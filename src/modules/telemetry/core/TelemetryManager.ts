/**
 * TelemetryManager.ts
 *
 * ════════════════════════════════════════════════════════════════════════
 * THE TELEMETRY PIPELINE — the central engine of the GCS data layer
 * ════════════════════════════════════════════════════════════════════════
 *
 * Full pipeline:
 *
 *   [Source]          [Normalize]           [Smooth]          [Derive]
 *   TelemetrySource ──▶ FlightTelemetry ──▶ SmoothingEngine ──▶ computeD..
 *      (raw MAVLink units)   (SI + deg)     (EMA per field)   (waypoint ETA…)
 *           │                                    │                   │
 *           └──────────────── onTelemetry ◀──────┘                   │
 *                             (smoothed)                             │
 *           └──────────────────────────── onDerived ◀────────────────┘
 *
 * ── Design goals ─────────────────────────────────────────────────────────
 *
 *   • Zero React – pure TypeScript class, works in tests, workers, and
 *     in useEffect(). No useState, no useRef, no context.
 *
 *   • Hot-swappable source – setSource() stops the old source, connects
 *     the new one and redirects all listeners without any consumer code
 *     changes. Useful to switch Sim ↔ MAVLink without unmounting the HUD.
 *
 *   • Graceful degradation – individual missing MAVLink messages fall back
 *     to the previous normalised value, so the pipeline never emits
 *     undefined / NaN.
 *
 *   • Single output stream – consumers see _one_ subscription interface:
 *     onTelemetry() and onDerived(). The source swap is invisible.
 *
 * ── Usage ─────────────────────────────────────────────────────────────────
 *
 *   // In a React component or Zustand store:
 *   const source = new SimulationTelemetrySource();
 *   const manager = new TelemetryManager(source, {
 *     batteryCapacityMah: 5000,
 *   });
 *
 *   // Subscribe to normalised & smoothed telemetry for the HUD:
 *   const unsub = manager.onTelemetry((tel) => {
 *     hudRef.current?.update(tel);
 *   });
 *
 *   // Subscribe to derived data (ETA, distance, time-of-flight…):
 *   const unsubD = manager.onDerived((derived) => {
 *     setDerivedState(derived);
 *   });
 *
 *   // Live mission — update waypoint from mission store:
 *   manager.setDerivedContext({ activeWaypoint: missionStore.activeWaypoint });
 *
 *   // Swap to real vehicle when connected:
 *   manager.setSource(mavlink);
 *
 *   // Cleanup:
 *   manager.destroy();
 */

import { BaseTelemetrySource } from './TelemetrySource';
import type { TelemetrySource, SourceStatus } from './TelemetrySource';
import {
  DEFAULT_FLIGHT_TELEMETRY,
  DEFAULT_FLIGHT_DERIVED_DATA,
  FlightMode,
  GPSFixType,
  EKFHealthStatus,
  radToDeg,
  mavLatLonToDeg,
  mavAltToMeters,
  mavVoltageToVolts,
  mavCurrentToAmps,
  parseArmState,
  normalizeYaw,
  clampPitch,
  classifyBatteryLevel,
  classifyEKFHealth,
  haversineDistanceM,
} from './FlightTelemetryModel';
import type {
  TelemetryRawData,
  FlightTelemetry,
  FlightDerivedData,
  NormalizedTelemetry,
  ControlSurfacesTelemetry,
  ControlSurfacesSource,
  MAVStatusText,
} from './FlightTelemetryModel';
import { SmoothingEngine, DEFAULT_SMOOTHING_CONFIG } from './SmoothingEngine';
import type { SmoothingConfig } from './SmoothingEngine';
import { FeedforwardEngine, DEFAULT_FF_CONFIG }       from './FeedforwardEngine';
import type { FeedforwardConfig }                     from './FeedforwardEngine';
import { computeDerivedData } from './DerivedDataEngine';
import type { DerivedDataContext, DerivedPosition } from './DerivedDataEngine';
import { chooseGroundSpeed } from './speedSourcePolicy';
import {
  STATUS_TEXT_MAX_MESSAGES,
  STATUS_TEXT_DEDUP_MS,
  STATUS_TEXT_TTL_MS,
  safe,
  normalizeServo,
  normalizeActuator,
  normalizeRcChannels,
  hasIsolatedRailInServo,
  controlActivityScore,
  normalizeAttitudeToControlSurfaces,
} from './telemetryManagerModel';

interface SimulationFlightMode {
  readonly mode: FlightMode;
  readonly label: string;
}

const SIMULATION_FLIGHT_MODES: Readonly<Partial<Record<number, SimulationFlightMode>>> = {
  0: { mode: FlightMode.STABILIZE, label: 'STABILIZE' },
  1: { mode: FlightMode.ACRO, label: 'ACRO' },
  2: { mode: FlightMode.ALT_HOLD, label: 'ALT HOLD' },
  3: { mode: FlightMode.AUTO, label: 'AUTO' },
  4: { mode: FlightMode.GUIDED, label: 'GUIDED' },
  5: { mode: FlightMode.LOITER, label: 'LOITER' },
  6: { mode: FlightMode.RTL, label: 'RTL' },
  7: { mode: FlightMode.CIRCLE, label: 'CIRCLE' },
  9: { mode: FlightMode.LAND, label: 'LAND' },
  25: { mode: FlightMode.TAKEOFF, label: 'TAKEOFF' },
};

function decodeSimulationFlightMode(customMode: number): SimulationFlightMode {
  return SIMULATION_FLIGHT_MODES[customMode]
    ?? { mode: FlightMode.UNKNOWN, label: `MODE_${customMode.toString()}` };
}

// ── Manager options ───────────────────────────────────────────────────────

export interface TelemetryManagerOptions {
  /** Battery capacity for "time remaining" calculation. Default: 5000 mAh. */
  batteryCapacityMah?: number;
  /** Human-readable label for diagnostics (for example a droneId). */
  debugLabel?: string;
  /** Override EMA smoothing constants per field. Defaults from SmoothingEngine. */
  smoothingConfig?:    SmoothingConfig;
  /**
   * If true, the manager emits telemetry for every raw frame (no frame-skip).
   * If false (default), consecutive identical frames (same capturedAt) are
   * dropped.
   */
  emitAllFrames?: boolean;
  /** Feedforward extrapolation engine config. Pass `{ gain: 0 }` to disable. */
  feedforward?: Partial<FeedforwardConfig>;
}

// ── Listener aliases ──────────────────────────────────────────────────────

type TelemetryCallback    = (data: FlightTelemetry)    => void;
type DerivedCallback       = (data: FlightDerivedData)  => void;
type StatusCallback        = (status: SourceStatus)     => void;
type ErrorCallback         = (error: Error)             => void;
type NormTelemetryCallback = (data: NormalizedTelemetry | null) => void;
/** Returns an unsubscribe function. */
type Unsubscribe = () => void;

const readDerivedPositionFromTelemetry = (telemetry: FlightTelemetry): DerivedPosition | null => {
  const { latitude, longitude } = telemetry.navigation;
  if (
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude) ||
    (latitude === 0 && longitude === 0)
  ) {
    return null;
  }

  return { latitude, longitude };
};

const describeUnknownError = (error: unknown): string => {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
};

const createListenerError = (context: string, error: unknown): Error =>
  new Error(`${context}: ${describeUnknownError(error)}`);

// ─────────────────────────────────────────────────────────────────────────
// TelemetryManager
// ─────────────────────────────────────────────────────────────────────────

export class TelemetryManager {
  // ── Pipeline engines ──────────────────────────────────────────────────
  private readonly _smoother: SmoothingEngine;
  private readonly _ff:       FeedforwardEngine;

  /**
   * Pre-allocated mutable snapshot for feedforward extrapolation.
   * Written in-place by getExtrapolatedSnapshot() — ZERO heap allocation
   * in the rAF hot path. Returned as Readonly<> so callers cannot mutate.
   */
  private readonly _extrapolatedSnapshot: FlightTelemetry =
    JSON.parse(JSON.stringify(DEFAULT_FLIGHT_TELEMETRY)) as FlightTelemetry;

  // ── Current source & its unsubscribe handles ──────────────────────────
  private _source:          TelemetrySource;
  private _unsubData:       Unsubscribe | null = null;
  private _unsubError:      Unsubscribe | null = null;
  private _unsubStatus:     Unsubscribe | null = null;

  // ── Listener sets ─────────────────────────────────────────────────────
  private readonly _telemetryListeners: Set<TelemetryCallback>    = new Set();
  private readonly _derivedListeners:   Set<DerivedCallback>      = new Set();
  private readonly _statusListeners:    Set<StatusCallback>       = new Set();
  private readonly _errorListeners:     Set<ErrorCallback>        = new Set();
  private readonly _normListeners:      Set<NormTelemetryCallback> = new Set();
  /** Pre-EMA normalized telemetry listeners (for PFD interpolation buffer). */
  private readonly _rawNormalizedListeners: Set<TelemetryCallback> = new Set();

  // ── Pipeline state ────────────────────────────────────────────────────
  /** The previous normalised telemetry snapshot (fallback for missing fields). */
  private _prevTelemetry:  FlightTelemetry        = DEFAULT_FLIGHT_TELEMETRY;
  private _prevDerived:    FlightDerivedData      = DEFAULT_FLIGHT_DERIVED_DATA;
  private _normTelemetry:  NormalizedTelemetry | null = null;
  /** Home lat/lon in decimal degrees — from HOME_POSITION message or setDerivedContext. */
  private _homeLatLon:     { lat: number; lon: number } | null = null;
  private _lastCapturedAt: number            = 0;
  /** Timestamp (Date.now ms) of last GLOBAL_POSITION_INT packet. */
  private _lastGlobalPositionMs: number = 0;
  /** Timestamp (Date.now ms) of last VFR_HUD packet. */
  private _lastVfrHudMs: number = 0;
  /** Timestamp (Date.now ms) of last received raw packet (any type). */
  private _lastTelemetryAt: number = 0;
  /** Last speed source chosen by the speed policy (for norm telemetry metadata). */
  private _lastSpeedSource: 'GPS' | 'VFR_FALLBACK' | 'STALE_HOLD' | 'INVALID' = 'INVALID';
  /** Timer ID for stale-packet watchdog (null when not armed). */
  private _stalenessTimer: ReturnType<typeof setTimeout> | null = null;
  /** Timer ID for heartbeat-specific watchdog (2 s timeout). */
  private _heartbeatTimer: ReturnType<typeof setTimeout> | null = null;
  /** Timestamp (Date.now()) of last HEARTBEAT message — for connection status. */
  private _lastHeartbeatAt: number = 0;
  /** Cached connected flag — set false by heartbeat watchdog timeout. */
  private _connected: boolean = false;
  /** Recent autopilot status text messages, newest first. */
  private _statusTextMessages: MAVStatusText[] = [];

  private readonly _emitAllFrames:   boolean;

  // ── Diagnostic counters (DEV only) ────────────────────────────────────
  private _dbgFrameCount: number = 0;
  private _dbgLastLogMs: number = 0;
  private _dbgLastControlSurfacesLogMs: number = 0;
  private _lastControlSurfacesSource: ControlSurfacesSource = 'PREV_HOLD';
  private _servoIsolatedRailFrames: number = 0;

  /**
   * Latest smoothed snapshot — the single reference the rAF loop reads.
   *
   * ── Zero-allocation contract ────────────────────────────────────────
   * getSnapshot() just returns this pointer — it allocates NOTHING.
   * The pointer is updated (not the object) each time new MAVLink data
   * arrives (50–100 Hz). Because JS is single-threaded:
   *   • The rAF callback (60 Hz) never sees a partially-written state.
   *   • No mutex / double-buffer needed.
   *   • If MAVLink > 60 Hz, some frames are skipped (fine).
   *   • If MAVLink < 60 Hz, the same snapshot is read multiple times
   *     (instruments hold the last known position — correct behaviour).
   */
  private _snapshot: Readonly<FlightTelemetry> = DEFAULT_FLIGHT_TELEMETRY;

  // ── Derived-data context ──────────────────────────────────────────────
  private _derivedCtx: DerivedDataContext;

  // ── Misc ──────────────────────────────────────────────────────────────
  private _destroyed: boolean = false;
  private readonly _debugLabel: string;

  // ─────────────────────────────────────────────────────────────────────

  constructor(source: TelemetrySource, options: TelemetryManagerOptions = {}) {
    const batteryCapacityMah = options.batteryCapacityMah ?? 5000;
    this._emitAllFrames       = options.emitAllFrames ?? false;
    this._debugLabel          = options.debugLabel ?? 'unlabeled';

    this._smoother = new SmoothingEngine(
      options.smoothingConfig ?? DEFAULT_SMOOTHING_CONFIG,
    );
    this._ff = new FeedforwardEngine({
      ...DEFAULT_FF_CONFIG,
      ...options.feedforward,
    });

    this._derivedCtx = {
      homePosition:       null,
      activeWaypoint:     null,
      batteryCapacityMah,
      previousPosition:   null,
      prev:               DEFAULT_FLIGHT_DERIVED_DATA,
    };

    // Attach to the initial source
    this._source = source;           // satisfy TS before _attachSource
    this._attachSource(source);
  }

  // ── Public API ────────────────────────────────────────────────────────

  /**
   * Subscribe to normalised & smoothed FlightTelemetry.
   * Called at approximately the source's emission rate (e.g. 50 Hz for ATTITUDE).
   * Returns an unsubscribe function.
   */
  onTelemetry(callback: TelemetryCallback): Unsubscribe {
    this._telemetryListeners.add(callback);
    return () => { this._telemetryListeners.delete(callback); };
  }

  /**
   * Subscribe to FlightDerivedData (ETA, distance, time-of-flight, etc.).
   * Emitted in sync with onTelemetry.
   * Returns an unsubscribe function.
   */
  onDerived(callback: DerivedCallback): Unsubscribe {
    this._derivedListeners.add(callback);
    return () => { this._derivedListeners.delete(callback); };
  }

  /**
   * Subscribe to NormalizedTelemetry — Mission Planner panel fields.
   * Emitted on every ATTITUDE frame alongside onTelemetry/onDerived.
   * Returns an unsubscribe function.
   */
  onNormTelemetry(callback: NormTelemetryCallback): Unsubscribe {
    this._normListeners.add(callback);
    return () => { this._normListeners.delete(callback); };
  }

  /**
   * Subscribe to raw normalized (pre-EMA) FlightTelemetry.
   * Used by PFDInterpolationBuffer — receives unsmoothed data for
   * time-delayed interpolation (the buffer does its own smoothing).
   * Returns an unsubscribe function.
   */
  onRawNormalized(callback: TelemetryCallback): Unsubscribe {
    this._rawNormalizedListeners.add(callback);
    return () => { this._rawNormalizedListeners.delete(callback); };
  }

  /**
   * Subscribe to source status changes (CONNECTING, ACTIVE, DEGRADED…).
   * Returns an unsubscribe function.
   */
  onStatus(callback: StatusCallback): Unsubscribe {
    this._statusListeners.add(callback);
    return () => { this._statusListeners.delete(callback); };
  }

  /**
   * Subscribe to recoverable source errors.
   * Returns an unsubscribe function.
   */
  onError(callback: ErrorCallback): Unsubscribe {
    this._errorListeners.add(callback);
    return () => { this._errorListeners.delete(callback); };
  }

  /**
   * Hot-swap the data source.
   * The old source is stopped cleanly; the new source is started immediately.
   * All telemetry/derived subscribers continue uninterrupted.
   */
  setSource(newSource: TelemetrySource): void {
    if (this._destroyed) return;
    this._detachSource();
    this._attachSource(newSource);
  }

  /**
   * Update derived-data context without restarting anything.
   * Call this whenever the mission store changes homePosition or activeWaypoint.
   */
  setDerivedContext(partial: Partial<Omit<DerivedDataContext, 'prev' | 'previousPosition'>>): void {
    this._derivedCtx = { ...this._derivedCtx, ...partial };
  }

  /** Current active source. */
  get source(): TelemetrySource { return this._source; }

  /** Most recent normalised telemetry snapshot (or default if no data yet). */
  get latestTelemetry(): FlightTelemetry { return this._prevTelemetry; }

  /** Most recent derived data snapshot. */
  get latestDerived(): FlightDerivedData { return this._prevDerived; }

  /** Timestamp (Date.now()) of the most recent HEARTBEAT message. 0 if none received. */
  get lastHeartbeatAt(): number { return this._lastHeartbeatAt; }

  /** Timestamp (Date.now()) of the most recent raw telemetry packet. 0 if none received. */
  get lastTelemetryAt(): number { return this._lastTelemetryAt; }

  /** true if the heartbeat watchdog has not timed out (< 2 s since last HEARTBEAT). */
  get isConnected(): boolean { return this._connected; }

  /**
   * Returns the latest smoothed snapshot for the rAF render loop.
   *
   * ════════════════════════════════════════════════════════════════════
   * ZERO ALLOCATION — call this inside requestAnimationFrame freely.
   * ════════════════════════════════════════════════════════════════════
   *
   * Pattern:
   *   const loop = () => {
   *     const snap = manager.getSnapshot();  // ← this line: 0 alloc
   *     horizon.draw(snap);                  // ← reads pixels, 0 alloc
   *     rAF(loop);
   *   };
   */
  getSnapshot(): Readonly<FlightTelemetry> {
    return this._snapshot;
  }

  /**
   * Returns a feedforward-extrapolated snapshot for the rAF render loop.
   *
   * Extrapolates attitude/velocity fields to `nowMs` using the velocity
   * computed at the last telemetry update. Writes to a pre-allocated
   * internal object and returns it as Readonly<> — ZERO heap allocation.
   *
   * Safe-fields (altitude, battery, GPS, mode) are always the last real value.
   *
   * @param nowMs  performance.now() of the current rAF frame.
   */
  getExtrapolatedSnapshot(nowMs: number): Readonly<FlightTelemetry> {
    this._ff.extrapolate(this._snapshot, this._extrapolatedSnapshot, nowMs);

    return this._extrapolatedSnapshot;
  }

  /**
   * Latest NormalizedTelemetry snapshot — Mission Planner panel fields.
   * Null when no data has arrived yet, or when telemetry is stale/drone removed.
   */
  get latestNormTelemetry(): NormalizedTelemetry | null { return this._normTelemetry; }

  /**
   * Hard-reset the pipeline to neutral state.
   *
   * Use when a drone is removed or the active drone changes.
   *  • Cancels the stale-packet watchdog and heartbeat watchdog.
   *  • Resets EMA smoother (no carryover from the old drone).
   *  • Clears all cached buffers and the home-position fix.
   *  • Emits DEFAULT_FLIGHT_TELEMETRY → PFD freezes at neutral attitude.
   *  • Emits null to NormTelemetry subscribers → panel shows "--".
   */
  reset(): void {
    if (this._destroyed) return;
    this._clearTimers();
    this._smoother.reset();
    this._ff.reset();
    this._prevTelemetry  = DEFAULT_FLIGHT_TELEMETRY;
    this._prevDerived    = DEFAULT_FLIGHT_DERIVED_DATA;
    this._snapshot       = DEFAULT_FLIGHT_TELEMETRY;
    this._normTelemetry  = null;
    this._homeLatLon     = null;
    this._lastCapturedAt = 0;
    this._lastGlobalPositionMs = 0;
    this._lastVfrHudMs = 0;
    this._lastTelemetryAt = 0;
    this._lastSpeedSource = 'INVALID';
    this._lastHeartbeatAt = 0;
    this._connected       = false;
    this._statusTextMessages = [];
    this._emitTelemetry(DEFAULT_FLIGHT_TELEMETRY);
    this._emitDerived(DEFAULT_FLIGHT_DERIVED_DATA);
    this._emitNorm(null);
  }

  /**
   * Permanently tear down.
   * Stops the source and releases all listeners.
   */
  destroy(): void {
    if (this._destroyed) return;
    this._destroyed = true;
    this._clearTimers();
    this._detachSource();
    this._telemetryListeners.clear();
    this._derivedListeners.clear();
    this._statusListeners.clear();
    this._errorListeners.clear();
    this._normListeners.clear();
    this._rawNormalizedListeners.clear();
  }

  // ── Source wiring ─────────────────────────────────────────────────────

  private _attachSource(source: TelemetrySource): void {    // ── Cleanup guarantee: detach any previous source first ──────────
    // Prevents duplicate listeners if _attachSource is called without
    // a matching _detachSource (defensive coding).
    if (this._unsubData) {
      this._unsubData();
      this._unsubData = null;
    }
    if (this._unsubError) {
      this._unsubError();
      this._unsubError = null;
    }
    if (this._unsubStatus) {
      this._unsubStatus();
      this._unsubStatus = null;
    }
    this._source      = source;
    this._unsubData   = source.onData(   (raw)    => this._onRawData(raw));
    this._unsubError  = source.onError(  (error)  => this._emitError(error));
    this._unsubStatus = source.onStatusChange((st) => this._emitStatus(st));
    source.start();
  }

  private _detachSource(): void {
    // Cancel any watchdog timers so the old-source stale/heartbeat timers
    // do NOT fire against the incoming new source's data window.
    this._clearTimers();
    // Reset FF and EMA smoother so stale values from the old source do not
    // contaminate the first frames of the new source.
    // For example: SimulationTelemetrySource EMA state (pitch=15°, alt=50m)
    // must not bleed into the first MAVLink-smoothed frames.
    this._ff.reset();
    this._smoother.reset();
    this._source.stop();
    this._unsubData?.();
    this._unsubError?.();
    this._unsubStatus?.();
    this._unsubData   = null;
    this._unsubError  = null;
    this._unsubStatus = null;
  }

  // ── Pipeline ──────────────────────────────────────────────────────────

  private _onRawData(raw: TelemetryRawData): void {
    const nowMs = Date.now();
    this._lastTelemetryAt = nowMs;
    if (raw.globalPosition) this._lastGlobalPositionMs = nowMs;
    if (raw.vfrHud) this._lastVfrHudMs = nowMs;
    if (raw.statusText) this._recordStatusText(raw.statusText);
    this._pruneStatusTextMessages(raw.capturedAt > 0 ? raw.capturedAt : nowMs);

    // Deduplicate identical frames (same capture timestamp)
    if (!this._emitAllFrames && raw.capturedAt === this._lastCapturedAt && !raw.statusText) return;
    this._lastCapturedAt = raw.capturedAt;

    // 1. Normalize MAVLink raw units → SI + degrees
    const normalized = this._normalize(raw);

    // ── DIAGNOSTIC LOG (1 Hz rate-limited, remove when fixed) ────────────
    if (import.meta.env.DEV) {
      this._dbgFrameCount++;
      const nowMs = performance.now();
      if (nowMs - this._dbgLastLogMs >= 1000) {
        this._dbgLastLogMs = nowMs;
        const pktType = raw.attitude ? 'ATTITUDE'
          : raw.vfrHud ? 'VFR_HUD'
          : raw.globalPosition ? 'GPS_INT'
          : raw.heartbeat ? 'HEARTBEAT'
          : raw.gpsRaw ? 'GPS_RAW'
          : 'OTHER';
        const a = normalized.attitude;
        const v = normalized.velocity;
        const alt = normalized.altitude;
        const prev = this._prevTelemetry;
        console.log(
          `[TM DBG | ${this._debugLabel} | ${pktType} | #${this._dbgFrameCount}/s]` +
          `\n  pitch=${a.pitchDeg.toFixed(2)}° roll=${a.rollDeg.toFixed(2)}° yaw=${a.yawDeg.toFixed(2)}°` +
          `\n  alt MSL=${alt.altitudeMSLm.toFixed(1)}m AGL=${(alt.altitudeAGLm ?? 0).toFixed(1)}m` +
          `\n  spd=${v.groundSpeedMs.toFixed(1)}m/s vs=${v.verticalSpeedMs.toFixed(2)}m/s` +
          `\n  prevPitch=${prev.attitude.pitchDeg.toFixed(2)}° prevAlt=${prev.altitude.altitudeMSLm.toFixed(1)}m` +
          `\n  prevTelemetry=DEFAULT? ${this._prevTelemetry === DEFAULT_FLIGHT_TELEMETRY}`,
        );
        this._dbgFrameCount = 0;
      }
    }
    // ── END DIAGNOSTIC ────────────────────────────────────────────────────

    // 1.5 Emit pre-EMA normalized telemetry for PFD interpolation buffer.
    //     ONLY on ATTITUDE packets — other packet types (VFR_HUD, GPS, etc.)
    //     carry stale EMA-smoothed attitude fallback values, creating sawtooth
    //     jitter when mixed with fresh raw attitude samples in the buffer.
    if (raw.attitude) {
      this._emitRawNormalized(normalized);
    }

    // 2. Smooth per-field with EMA
    const smoothed = this._smoother.update(normalized);

    // 2.5 Track HOME_POSITION for distToMAV; update home from raw if present
    if (raw.homePosition) {
      this._homeLatLon = {
        lat: mavLatLonToDeg(raw.homePosition.latitude),
        lon: mavLatLonToDeg(raw.homePosition.longitude),
      };
    } else if (!this._homeLatLon && this._derivedCtx.homePosition) {
      // Fallback: use home from setDerivedContext (e.g. simulation)
      this._homeLatLon = {
        lat: this._derivedCtx.homePosition.latitude,
        lon: this._derivedCtx.homePosition.longitude,
      };
    }
    const norm = this._computeNorm(smoothed, raw);
    this._normTelemetry = norm;

    // 3. Compute derived data (ETA, distances, power…)
    const ctx: DerivedDataContext = {
      ...this._derivedCtx,
      previousPosition: readDerivedPositionFromTelemetry(this._prevTelemetry),
      prev: this._prevDerived,
    };
    const derived = computeDerivedData(smoothed, ctx);

    // 4. Persist state for next frame
    this._prevTelemetry = smoothed;
    this._snapshot      = smoothed;   // rAF reads this — zero alloc in hot path
    this._ff.recordSnapshot(smoothed, performance.now()); // velocity for FF
    this._prevDerived   = derived;


    this._derivedCtx    = { ...this._derivedCtx, prev: derived };

    // 5. Arm stale-packet watchdog — resets on every received packet
    this._scheduleStale();

    // 5b. Arm heartbeat watchdog if this packet contained a heartbeat
    if (raw.heartbeat) {
      this._lastHeartbeatAt = Date.now();
      this._connected = true;
      this._scheduleHeartbeat();
    }

    // 6. Notify all subscribers
    this._emitTelemetry(smoothed);
    this._emitDerived(derived);
    this._emitNorm(norm);
  }

  // ── Normalization ─────────────────────────────────────────────────────
  /**
   * Pure function — no side effects.
   *
   * Converts every MAVLink raw field from native units to the SI / degree
   * units expected by the HUD and SmoothingEngine.
   *
   * Aerospace-grade safeguards:
   *  • Every converted value passes through _safe() — NaN/Inf → fallback.
   *  • altitude < -100 m → rejected (sensor fault).
   *  • groundSpeed > 200 m/s → rejected (GPS glitch).
   *  • yaw NaN → previous yaw kept.
   *
   * Any missing optional message falls back to the previous telemetry value,
   * so the pipeline never produces NaN / undefined in the output.
   */
  private _normalize(raw: TelemetryRawData): FlightTelemetry {
    const prev = this._prevTelemetry;
    const S = safe;

    // ── Attitude (ATTITUDE message) ──────────────────────────────────
    const att = raw.attitude;
    let attitude = prev.attitude;
    if (att) {
      const yawConverted = radToDeg(att.yaw);
      // Guard: yaw NaN → discard entire attitude yaw, keep prev
      const yawDeg = Number.isFinite(yawConverted)
        ? normalizeYaw(yawConverted)
        : prev.attitude.yawDeg;
      attitude = {
        pitchDeg:      clampPitch(S(radToDeg(att.pitch),      prev.attitude.pitchDeg)),
        rollDeg:                  S(radToDeg(att.roll),       prev.attitude.rollDeg),
        yawDeg,
        pitchRateDegS:            S(radToDeg(att.pitchSpeed), prev.attitude.pitchRateDegS),
        rollRateDegS:             S(radToDeg(att.rollSpeed),  prev.attitude.rollRateDegS),
        yawRateDegS:              S(radToDeg(att.yawSpeed),   prev.attitude.yawRateDegS),
      };
    }

    // ── Velocity (prefer VFR_HUD, supplement from GLOBAL_POSITION_INT) ─
    const hud = raw.vfrHud;
    const gp  = raw.globalPosition;

    const speedSel = chooseGroundSpeed({
      nowMs: Date.now(),
      gpsSpeedMs: gp ? Math.hypot(gp.vx / 100, gp.vy / 100) : null,
      vfrSpeedMs: hud ? hud.groundspeed : null,
      lastGpsMs: this._lastGlobalPositionMs,
      lastVfrMs: this._lastVfrHudMs,
      prevSpeedMs: prev.velocity.groundSpeedMs,
      gpsFreshMs: 300,
      vfrFreshMs: 500,
      holdMs: 700,
    });
    this._lastSpeedSource = speedSel.source;

    // Ground speed: GPS primary, VFR fallback when GPS is stale.
    let groundSpeedMs = S(speedSel.speedMs, prev.velocity.groundSpeedMs);
    // Sanity: groundspeed > 200 m/s → GPS glitch, reject
    if (groundSpeedMs > 200) groundSpeedMs = prev.velocity.groundSpeedMs;

    // Air speed: VFR_HUD only
    const airSpeedMs = hud ? S(hud.airspeed, prev.velocity.airSpeedMs ?? 0) : prev.velocity.airSpeedMs;

    // Vertical speed: prefer VFR_HUD.climbRate, fallback vz
    const verticalSpeedMs = hud
      ? S(hud.climbRate, prev.velocity.verticalSpeedMs)
      : gp
        ? S(-(gp.vz / 100), prev.velocity.verticalSpeedMs)   // GLOBAL_POSITION_INT vz is NED (positive down)
        : prev.velocity.verticalSpeedMs;
    const throttlePercent = hud
      ? Math.max(0, Math.min(100, S(hud.throttle, prev.velocity.throttlePercent)))
      : prev.velocity.throttlePercent;

    // NED velocity components from GLOBAL_POSITION_INT (cm/s → m/s)
    const velNorthMs = gp ? S(gp.vx / 100, prev.velocity.velNorthMs) : prev.velocity.velNorthMs;
    const velEastMs  = gp ? S(gp.vy / 100, prev.velocity.velEastMs)  : prev.velocity.velEastMs;
    const velDownMs  = gp ? S(gp.vz / 100, prev.velocity.velDownMs)  : prev.velocity.velDownMs;

    const velocity = {
      groundSpeedMs,
      airSpeedMs,
      verticalSpeedMs,
      throttlePercent,
      velNorthMs,
      velEastMs,
      velDownMs,
    };

    // ── Altitude (GLOBAL_POSITION_INT preferred, VFR_HUD fallback) ───
    let altMSLm = gp
      ? S(mavAltToMeters(gp.alt), prev.altitude.altitudeMSLm)
      : hud
        ? S(hud.alt, prev.altitude.altitudeMSLm)
        : prev.altitude.altitudeMSLm;
    // Sanity: altitude < -100 m → sensor fault, reject
    if (altMSLm < -100) altMSLm = prev.altitude.altitudeMSLm;

    let altAGLm = gp ? S(mavAltToMeters(gp.relativeAlt), prev.altitude.altitudeAGLm ?? 0) : prev.altitude.altitudeAGLm;
    // Sanity: relative_alt < -100 m → sensor fault, reject
    if (altAGLm !== null && altAGLm < -100) altAGLm = prev.altitude.altitudeAGLm;

    const altitude = {
      altitudeMSLm:     altMSLm,
      altitudeAGLm:     altAGLm,
      homeAltitudeMSLm: prev.altitude.homeAltitudeMSLm,
    };

    // ── Navigation (GLOBAL_POSITION_INT > GPS_RAW_INT) ───────────────
    const gr  = raw.gpsRaw;
    const latRaw = gp
      ? mavLatLonToDeg(gp.lat)
      : gr
        ? mavLatLonToDeg(gr.lat)
        : NaN;
    const lonRaw = gp
      ? mavLatLonToDeg(gp.lon)
      : gr
        ? mavLatLonToDeg(gr.lon)
        : NaN;
    // Guard: converted lat/lon must be finite — 1e7 division can glitch
    const lat = S(latRaw, prev.navigation.latitude);
    const lon = S(lonRaw, prev.navigation.longitude);

    const navigation = {
      latitude:             lat,
      longitude:            lon,
      headingDeg:           hud ? hud.heading : gp && gp.hdg !== 0xFFFF ? gp.hdg / 100 : prev.navigation.headingDeg,
      courseOverGroundDeg:  (velNorthMs !== 0 || velEastMs !== 0)
        ? normalizeYaw(radToDeg(Math.atan2(velEastMs, velNorthMs)))
        : prev.navigation.courseOverGroundDeg,
      currentWaypointIndex: prev.navigation.currentWaypointIndex,
      distanceToWaypointM:  prev.navigation.distanceToWaypointM,
      bearingToWaypointDeg: prev.navigation.bearingToWaypointDeg,
    };

    // ── GPS status ────────────────────────────────────────────────────
    const gpsStatus = gr
      ? {
          fixType:           gr.fixType,
          satellitesVisible: gr.satellitesVisible,
          hdop:              gr.eph !== 0xFFFF ? gr.eph / 100 : null,
          vdop:              gr.epv !== 0xFFFF ? gr.epv / 100 : null,
          hasSufficientFix:  gr.fixType >= GPSFixType.FIX_3D,
        }
      : prev.gpsStatus;

    // ── Vehicle status (HEARTBEAT) ────────────────────────────────────
    const hb = raw.heartbeat;
    const nowMs = Date.now();
    const vehicleStatus = hb
      ? (() => {
          const decoded = decodeSimulationFlightMode(hb.customMode);
          return {
            armState:        parseArmState(hb.baseMode),
            flightMode:      decoded.mode,
            flightModeLabel: decoded.label,
            vehicleType:     hb.type,
            mavState:        hb.systemStatus,
            lastHeartbeatMs: nowMs,
            isConnected:     true,
            cpuLoadPercent:  raw.sysStatus ? raw.sysStatus.load / 10 : prev.vehicleStatus.cpuLoadPercent,
          };
        })()
      : {
          ...prev.vehicleStatus,
          isConnected: nowMs - prev.vehicleStatus.lastHeartbeatMs < 3_000,
        };

    // ── Battery (prefer BATTERY_STATUS, fallback SYS_STATUS) ─────────
    const bs  = raw.batteryStatus;
    const sys = raw.sysStatus;

    let battery = prev.battery;
    if (bs) {
      // BATTERY_STATUS (richer, multi-cell)
      const validCellMv = (bs.voltages ?? []).filter(
        (cellMv) => Number.isFinite(cellMv) && cellMv > 0 && cellMv < 60_000 && cellMv !== 0xFFFF,
      );
      const packVoltageFromCellsV = validCellMv.length > 0
        ? validCellMv.reduce((acc: number, cellMv: number) => acc + cellMv, 0) / 1000
        : null;
      const sysVoltageV = sys ? mavVoltageToVolts(sys.voltageBattery) : null;
      const voltV = packVoltageFromCellsV
        ?? (sysVoltageV !== null && Number.isFinite(sysVoltageV) && sysVoltageV > 0 ? sysVoltageV : prev.battery.voltageV);
      const ampA  = bs.currentBattery >= 0 ? mavCurrentToAmps(bs.currentBattery) : prev.battery.currentA;
      const pct   = bs.batteryRemaining >= 0 ? bs.batteryRemaining : prev.battery.remainingPercent;
      battery = {
        voltageV:         voltV,
        currentA:         ampA,
        remainingPercent: pct,
        consumedMah:      bs.currentConsumed >= 0 ? bs.currentConsumed : prev.battery.consumedMah,
        warningLevel:     classifyBatteryLevel(pct),
      };
    } else if (sys) {
      // SYS_STATUS (simpler)
      const voltV = mavVoltageToVolts(sys.voltageBattery);
      const ampA  = sys.currentBattery >= 0 ? mavCurrentToAmps(sys.currentBattery) : prev.battery.currentA;
      const pct   = sys.batteryRemaining >= 0 ? sys.batteryRemaining : prev.battery.remainingPercent;
      battery = {
        voltageV:         voltV,
        currentA:         ampA,
        remainingPercent: pct,
        consumedMah:      prev.battery.consumedMah,
        warningLevel:     classifyBatteryLevel(pct),
      };
    }

    // ── EKF status ────────────────────────────────────────────────────
    const rawEkf = raw.ekfStatus;
    const ekf = rawEkf
      ? {
          healthStatus:        classifyEKFHealth(rawEkf.flags),
          flags:               rawEkf.flags,
          posHorizVariance:    rawEkf.posHorizVariance,
          posVertVariance:     rawEkf.posVertVariance,
          velocityVariance:    rawEkf.velocityVariance,
          compassVariance:     rawEkf.compassVariance,
          hasAbsolutePosition: !!(rawEkf.flags & (1 << 4)),
        }
      : prev.ekf;

    // ── Control surfaces (SERVO_OUTPUT_RAW) ──────────────────────────
    const fromServo = normalizeServo(raw.servoOutput, prev.controlSurfaces);
    const fromActuator = normalizeActuator(raw.actuatorOutput, prev.controlSurfaces);
    const fromRc = normalizeRcChannels(raw.rcChannels, prev.controlSurfaces);
    const fromAttitudeProxy = normalizeAttitudeToControlSurfaces(attitude, prev.controlSurfaces);
    const servoHasIsolatedRail = hasIsolatedRailInServo(raw.servoOutput);
    this._servoIsolatedRailFrames = servoHasIsolatedRail ? this._servoIsolatedRailFrames + 1 : 0;
    const servoSuppressedByRail = this._servoIsolatedRailFrames >= 4;

    const hasServo = raw.servoOutput != null && !servoSuppressedByRail;
    const hasActuator = raw.actuatorOutput != null;
    const hasRc = raw.rcChannels != null;
    const rcActivity = controlActivityScore(fromRc);
    const attProxyActivity = controlActivityScore(fromAttitudeProxy);
    const hasAttitudeProxy = !hasServo && !hasActuator && attProxyActivity >= 2;
    const hasRcAsPrimary = !hasServo && !hasActuator && rcActivity >= 8;
    const candidates: Array<{ source: ControlSurfacesSource; data: ControlSurfacesTelemetry; available: boolean }> = [
      { source: 'SERVO_OUTPUT_RAW', data: fromServo, available: hasServo },
      { source: 'ACTUATOR_OUTPUT_STATUS', data: fromActuator, available: hasActuator },
      { source: 'ATTITUDE_PROXY', data: fromAttitudeProxy, available: hasAttitudeProxy },
      { source: 'RC_CHANNELS', data: fromRc, available: hasRc && hasRcAsPrimary },
    ];
    const availableCandidates = candidates.filter((c) => c.available);
    const prevActivity = controlActivityScore(prev.controlSurfaces);
    let chosen: { source: ControlSurfacesSource; data: ControlSurfacesTelemetry } | null = null;
    if (availableCandidates.length > 0) {
      const ranked = [...availableCandidates].sort(
        (a, b) => controlActivityScore(b.data) - controlActivityScore(a.data),
      );
      const top = ranked[0];
      const topScore = controlActivityScore(top.data);
      const currentSourceEntry = availableCandidates.find((c) => c.source === this._lastControlSurfacesSource);
      const currentScore = currentSourceEntry ? controlActivityScore(currentSourceEntry.data) : -1;
      // Hysteresis: only switch source if candidate is clearly more "alive".
      if (currentSourceEntry && currentScore >= 0 && top.source !== currentSourceEntry.source) {
        const switchMargin = 8; // percent-points aggregate
        chosen = topScore > currentScore + switchMargin ? top : currentSourceEntry;
      } else {
        chosen = top;
      }
      // If all sources are effectively flat, preserve previous hold to avoid flicker.
      if (topScore < 1 && prevActivity < 1) {
        chosen = null;
      }
    }
    const controlSurfaces = chosen ? chosen.data : prev.controlSurfaces;
    const controlSurfacesSource: ControlSurfacesSource = chosen ? chosen.source : 'PREV_HOLD';
    this._lastControlSurfacesSource = controlSurfacesSource;
    if (import.meta.env.DEV) {
      const now = Date.now();
      if (now - this._dbgLastControlSurfacesLogMs > 1500) {
        this._dbgLastControlSurfacesLogMs = now;
        console.info('[TM DBG CTRL_SURFACES]', {
          source: controlSurfacesSource,
          servoSuppressedByRail,
          servoIsolatedRailFrames: this._servoIsolatedRailFrames,
          rcActivity,
          attProxyActivity,
          hasRawServo: raw.servoOutput != null,
          hasActuatorOutput: raw.actuatorOutput != null,
          hasRcChannels: raw.rcChannels != null,
          rawServo: raw.servoOutput
            ? {
                s1: raw.servoOutput.servo1Raw,
                s2: raw.servoOutput.servo2Raw,
                s3: raw.servoOutput.servo3Raw,
                s4: raw.servoOutput.servo4Raw,
                s5: raw.servoOutput.servo5Raw,
              }
            : null,
          rc: raw.rcChannels
            ? {
                c1: raw.rcChannels.chan1Raw,
                c2: raw.rcChannels.chan2Raw,
                c3: raw.rcChannels.chan3Raw,
                c4: raw.rcChannels.chan4Raw,
                c5: raw.rcChannels.chan5Raw,
                c6: raw.rcChannels.chan6Raw,
              }
            : null,
          normalized: controlSurfaces,
        });
      }
    }

    return {
      timestamp: raw.capturedAt,
      attitude,
      velocity,
      altitude,
      navigation,
      gpsStatus,
      vehicleStatus,
      battery,
      ekf,
      controlSurfaces,
      controlSurfacesSource,
      statusTextMessages: [...this._statusTextMessages],
    };
  }

  private _recordStatusText(message: MAVStatusText): void {
    const text = message.text.trim();
    if (text.length === 0) return;

    const normalized: MAVStatusText = {
      ...message,
      text,
    };
    const existingIndex = this._statusTextMessages.findIndex((item) => item.text === text);
    const existing = existingIndex >= 0 ? this._statusTextMessages[existingIndex] : null;
    const isRecentDuplicate = existing !== null
      && normalized.receivedAtMs - existing.receivedAtMs < STATUS_TEXT_DEDUP_MS;

    const remainingMessages = this._statusTextMessages.filter((item) => item.text !== text);
    const nextMessages = isRecentDuplicate
      ? [normalized, ...remainingMessages]
      : [normalized, ...this._statusTextMessages];

    this._statusTextMessages = nextMessages.slice(0, STATUS_TEXT_MAX_MESSAGES);
  }

  private _pruneStatusTextMessages(referenceMs: number): void {
    this._statusTextMessages = this._statusTextMessages.filter(
      (message) => referenceMs - message.receivedAtMs <= STATUS_TEXT_TTL_MS,
    );
  }

  // ── Emission helpers ──────────────────────────────────────────────────

  private _emitTelemetry(data: FlightTelemetry): void {
    for (const cb of [...this._telemetryListeners]) {
      try {
        cb(data);
      } catch (error) {
        this._emitError(createListenerError('TelemetryManager telemetry listener failed', error));
      }
    }
  }

  private _emitDerived(data: FlightDerivedData): void {
    for (const cb of [...this._derivedListeners]) {
      try {
        cb(data);
      } catch (error) {
        this._emitError(createListenerError('TelemetryManager derived listener failed', error));
      }
    }
  }

  private _emitStatus(status: SourceStatus): void {
    for (const cb of [...this._statusListeners]) {
      try {
        cb(status);
      } catch (error) {
        this._emitError(createListenerError('TelemetryManager status listener failed', error));
      }
    }
  }

  private _emitError(error: Error): void {
    for (const cb of [...this._errorListeners]) {
      try {
        cb(error);
      } catch (listenerError) {
        console.error('[TelemetryManager] Error listener failed', {
          error: describeUnknownError(listenerError),
          sourceError: error.message,
        });
      }
    }
  }

  private _emitNorm(data: NormalizedTelemetry | null): void {
    for (const cb of [...this._normListeners]) {
      try {
        cb(data);
      } catch (error) {
        this._emitError(createListenerError('TelemetryManager normalized telemetry listener failed', error));
      }
    }
  }

  private _emitRawNormalized(data: FlightTelemetry): void {
    for (const cb of [...this._rawNormalizedListeners]) {
      try {
        cb(data);
      } catch (error) {
        this._emitError(createListenerError('TelemetryManager raw normalized listener failed', error));
      }
    }
  }

  // ── Timer helpers ───────────────────────────────────────────────────

  /** Cancel all watchdog timers (stale + heartbeat). */
  private _clearTimers(): void {
    if (this._stalenessTimer !== null) {
      clearTimeout(this._stalenessTimer);
      this._stalenessTimer = null;
    }
    if (this._heartbeatTimer !== null) {
      clearTimeout(this._heartbeatTimer);
      this._heartbeatTimer = null;
    }
  }

  /**
   * Arms a 1-second stale-packet timer.
   * Cleared and restarted on every incoming raw packet.
   * If the timer fires → _onStale() freezes the PFD at neutral.
   */
  private _scheduleStale(): void {
    if (this._stalenessTimer !== null) clearTimeout(this._stalenessTimer);
    this._stalenessTimer = setTimeout(() => {
      this._stalenessTimer = null;
      this._onStale();
    }, 1_000);
  }

  /**
   * Arms a 2-second heartbeat watchdog.
   * Cleared and restarted on every HEARTBEAT message.
   * If the timer fires → _onHeartbeatTimeout() marks drone as disconnected.
   */
  private _scheduleHeartbeat(): void {
    if (this._heartbeatTimer !== null) clearTimeout(this._heartbeatTimer);
    this._heartbeatTimer = setTimeout(() => {
      this._heartbeatTimer = null;
      this._onHeartbeatTimeout();
    }, 2_000);
  }

  /**
   * Called by the stale watchdog when no packet received for > 1 s.
   * Freezes PFD at neutral attitude, clears panel values.
   */
  private _onStale(): void {
    if (this._destroyed) return;
    if (import.meta.env.DEV) {
      const prev = this._prevTelemetry;
      const isDefault = this._prevTelemetry === DEFAULT_FLIGHT_TELEMETRY;
      console.warn(
        `[TM DBG STALE | ${this._debugLabel}] 1s gap \u2014 prevTelemetry=DEFAULT? ${isDefault}` +
        `\n  prevPitch=${prev.attitude.pitchDeg.toFixed(2)}\u00b0` +
        ` prevAlt=${prev.altitude.altitudeMSLm.toFixed(1)}m` +
        ` prevSpd=${prev.velocity.groundSpeedMs.toFixed(1)}m/s`,
      );
    }
    this._smoother.reset();
    this._ff.reset();
    // NOTE: _prevTelemetry is intentionally NOT reset to DEFAULT here.
    // _prevTelemetry is used as fallback in _normalize() for fields missing
    // from incoming packets (e.g. altitude from ATTITUDE-only frames).
    // Resetting it to DEFAULT (all zeros) would cause the first ATTITUDE packet
    // after a radio gap to carry altitude=0, velocity=0 as fallback values,
    // producing a visible "altitude/speed snaps to zero" glitch in the PFD.
    // Keeping the last known real values as fallback is always safer.
    this._prevDerived   = DEFAULT_FLIGHT_DERIVED_DATA;
    this._snapshot      = DEFAULT_FLIGHT_TELEMETRY;
    this._normTelemetry = null;
    this._lastSpeedSource = 'INVALID';
    this._connected     = false;
    this._emitTelemetry(DEFAULT_FLIGHT_TELEMETRY);
    this._emitDerived(DEFAULT_FLIGHT_DERIVED_DATA);
    this._emitNorm(null);
  }

  /**
   * Called when no HEARTBEAT received for > 2 seconds.
   * Marks drone as disconnected but does NOT freeze telemetry — other
   * messages (ATTITUDE, VFR_HUD) may still arrive on degraded links.
   * The stale watchdog handles full data loss.
   */
  private _onHeartbeatTimeout(): void {
    if (this._destroyed) return;
    this._connected = false;
    // Update vehicleStatus.isConnected in the current snapshot
    const prev = this._prevTelemetry;
    if (prev.vehicleStatus.isConnected) {
      const updated: FlightTelemetry = {
        ...prev,
        vehicleStatus: { ...prev.vehicleStatus, isConnected: false },
      };
      this._prevTelemetry = updated;
      this._snapshot      = updated;
      this._emitTelemetry(updated);
      // Re-emit norm with connected=false
      if (this._normTelemetry) {
        const norm = {
          ...this._normTelemetry,
          connected: false,
          readyForFlight: false,
          blockingReason: 'LINK_DOWN' as const,
        };
        this._normTelemetry = norm;
        this._emitNorm(norm);
      }
    }
  }

  /**
   * Computes the NormalizedTelemetry from the smoothed FlightTelemetry and the
   * current raw data packet (for NAV_CONTROLLER_OUTPUT.wp_dist).
   *
   * All calculations stay here — the UI is purely passive.
   */
  private _computeNorm(
    tel: FlightTelemetry,
    raw: TelemetryRawData,
  ): NormalizedTelemetry {
    // ── distToWP: prefer NAV_CONTROLLER_OUTPUT.wp_dist (Mission Planner style)
    const distToWP: number | null =
      raw.navController != null ? raw.navController.wp_dist : null;

    // ── distToMAV: Haversine(home, current position)
    const lat = tel.navigation.latitude;
    const lon = tel.navigation.longitude;
    let distToMAV: number | null = null;
    if (this._homeLatLon !== null && (lat !== 0 || lon !== 0)) {
      const d = haversineDistanceM(
        this._homeLatLon.lat, this._homeLatLon.lon,
        lat, lon,
      );
      // Clamp to sane range (0 – 500 km). Rejects GPS glitches.
      distToMAV = Number.isFinite(d) && d >= 0 && d < 500_000 ? d : null;
    }

    const telemetryValid = (Date.now() - this._lastTelemetryAt) < 1000 && this._lastSpeedSource !== 'INVALID';
    const readyForFlight = this._connected && telemetryValid && tel.gpsStatus.fixType >= GPSFixType.FIX_3D;
    const blockingReason = readyForFlight
      ? null
      : tel.gpsStatus.fixType < GPSFixType.FIX_3D
        ? 'GPS < 3D'
        : !this._connected
          ? 'LINK_DOWN'
          : 'TELEMETRY_INVALID';

    return {
      altitude:      tel.altitude.altitudeAGLm ?? tel.altitude.altitudeMSLm,
      groundSpeed:   tel.velocity.groundSpeedMs,
      verticalSpeed: tel.velocity.verticalSpeedMs,
      yaw:           tel.attitude.yawDeg,
      distToWP,
      distToMAV,
      gpsFixStatus:  tel.gpsStatus.fixType,
      ekfHealthy:    tel.ekf.healthStatus === EKFHealthStatus.GOOD,
      connected:     this._connected,
      battery:       tel.battery,
      speedSource:   this._lastSpeedSource,
      telemetryValid,
      readyForFlight,
      blockingReason,
    };
  }
}

// ─────────────────────────────────────────────────────────────────────────
// Convenience factory
// ─────────────────────────────────────────────────────────────────────────

/**
 * Creates and starts a TelemetryManager backed by the given source.
 *
 * @example
 * ```ts
 * const manager = createTelemetryManager(
 *   new SimulationTelemetrySource(),
 *   { batteryCapacityMah: 6000 },
 * );
 * ```
 */
export function createTelemetryManager(
  source:  TelemetrySource,
  options: TelemetryManagerOptions = {},
): TelemetryManager {
  return new TelemetryManager(source, options);
}

// ─────────────────────────────────────────────────────────────────────────
// React integration helper (lives here to keep TelemetryManager pure)
// ─────────────────────────────────────────────────────────────────────────

/**
 * Extends BaseTelemetrySource with a raw-injection method for testing.
 *
 * Usage in tests / Storybook:
 * ```ts
 * const fake = new MockTelemetrySource();
 * const manager = new TelemetryManager(fake);
 * fake.inject({ attitude: { roll: 0.1, pitch: 0.05, yaw: 0, … }, … });
 * ```
 */
export class MockTelemetrySource extends BaseTelemetrySource {
  readonly info = {
    name:        'Mock',
    transport:   'custom' as const,
    description: 'Controllable fake source for tests & Storybook',
  };

  start(): void  { this._setStatus('ACTIVE' as const); }
  stop():  void  { this._setStatus('STOPPED' as const); }

  /** Synchronously injects a raw packet into the pipeline. */
  inject(raw: TelemetryRawData): void {
    this._emit(raw);
  }

  /** Synchronously emits a recoverable source error. */
  fail(error: Error): void {
    this._emitError(error);
  }
}


