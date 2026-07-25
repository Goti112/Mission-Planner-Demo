/**
 * PFDInterpolationBuffer.ts
 *
 * Time-delayed buffered interpolation engine for the PFD.
 *
 * Instead of predicting the future (feedforward), this renders a fixed
 * time in the past where we always have two real data points to
 * interpolate between. This guarantees the PFD always renders between
 * two known-good data points — no prediction, no derivative estimation,
 * no jitter.
 *
 * ── Algorithm ─────────────────────────────────────────────────────────────
 *
 *   Ring buffer (maxBufferSize slots):
 *     entries[oldest] ... entries[newest]
 *
 *   Every rAF tick:
 *     renderTime = nowMs - renderDelayMs
 *     Find bracket [A, B] where A.ts ≤ renderTime ≤ B.ts
 *     t = (renderTime - A.ts) / (B.ts - A.ts)
 *     output = lerp(A, B, t)
 *
 * ── Safety invariants ─────────────────────────────────────────────────────
 *
 *   • During normal operation, output is bounded between two real samples.
 *   • Edge extrapolation is capped at maxEdgeExtrapolationMs (default 50ms).
 *   • Gap > maxGapMs clears the buffer (reconnection scenario).
 *   • Passthrough fields (battery, mode, gpsStatus, ekf) always from latest.
 *   • Zero heap allocation in sample() — writes to pre-allocated output.
 *
 * Class is pure TypeScript — no React, no DOM.
 */

import type { FlightTelemetry } from './FlightTelemetryModel';
import { DEFAULT_FLIGHT_TELEMETRY } from './FlightTelemetryModel';
import type { SnapshotProvider } from './SnapshotProvider';

// ── Configuration ─────────────────────────────────────────────────────────

export interface PFDBufferConfig {
  /** Time delay for rendering in the past. Default 150ms. */
  renderDelayMs: number;
  /** Maximum number of samples in the ring buffer. Default 30. */
  maxBufferSize: number;
  /** Gap threshold for reconnection detection. Default 500ms. */
  maxGapMs: number;
  /** Maximum extrapolation past newest sample. Default 50ms. */
  maxEdgeExtrapolationMs: number;
}

export const DEFAULT_PFD_BUFFER_CONFIG: PFDBufferConfig = {
  renderDelayMs: 2000,
  maxBufferSize: 30,
  maxGapMs: 500,
  maxEdgeExtrapolationMs: 1000,
};

/**
 * PFD buffer config tuned for a SiK 57600-baud MAVLink radio at ~10 Hz ATTITUDE.
 *
 * Why these values differ from DEFAULT_PFD_BUFFER_CONFIG:
 *
 *   renderDelayMs 500
 *     SiK delivers ATTITUDE in micro-bursts with inter-burst gaps of 500-760ms.
 *     With renderDelayMs ≥ gap, the render window is almost always bracketed by
 *     two real samples → pure interpolation, zero freeze+snap.
 *
 *     Timeline example (burst gap = 600ms):
 *       Burst A: T=0,50,100ms
 *       Burst B: T=600,650,700ms
 *       Wall=650ms → renderTime=150ms → between T=100 and T=600 → interpolating ✓
 *       Wall=700ms → renderTime=200ms → still interpolating between bursts ✓
 *
 *     With the old renderDelayMs=300 the window would reach renderTime=150ms
 *     past newest at wall=450ms, hit the extrapolation cap and freeze for
 *     ~150ms until Burst B arrived — the "mini-corte" that was visible.
 *
 *     Tradeoff: 500ms display lag (acceptable for GCS monitoring; primary
 *     pilot control is via RC stick, not the screen).
 *
 *   maxGapMs 2000
 *     SiK inter-burst gaps of 500-760ms are normal (not a reconnection).
 *     The TelemetryManager stale watchdog (1000ms) handles true data loss.
 *     Clearing the buffer at 500ms causes a visible freeze+snap on every burst.
 *
 *   maxEdgeExtrapolationMs 1000
 *     The maximum overshoot = ts_first_burst2 - ts_last_burst1 = the full
 *     inter-burst gap (600–760ms observed).  renderDelay cancels in the math:
 *
 *       overshoot = renderTime − ts_newest
 *                 = (perf.now() − renderDelay) − ts_C
 *       extrapolation ends when renderTime catches up to ts_D:
 *         perf.now() = ts_D + renderDelay  →  overshoot = ts_D − ts_C = burst_gap
 *
 *     Previous cap (400ms) was derived from the WRONG formula
 *     "760 − 500 = 260ms" (renderDelay was incorrectly subtracted).
 *     The correct max overshoot is 760ms >> 400ms, causing a 360ms freeze
 *     every burst cycle — the source of the remaining "cortes."
 *
 *     With cap = 1000ms (> 760ms max observed):  the dead-reckoning covers
 *     the entire gap, no freeze, no snap.  At 5°/s cruise rate → ≤ 5° drift
 *     over 1000ms, imperceptible on a GCS display.  The stale watchdog still
 *     fires at 1000ms so the link indicator shows DEGRADED on true data loss.
 */
export const SIK_RADIO_PFD_CONFIG: PFDBufferConfig = {
  renderDelayMs: 500,
  maxBufferSize: 30,
  maxGapMs: 2000,
  maxEdgeExtrapolationMs: 1000,
};

// ── Math helpers ──────────────────────────────────────────────────────────

const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);

/**
 * Shortest-arc linear interpolation for angles in degrees.
 * Prevents the 359°→1° wrap-around spin artefact.
 * Output normalised to [0, 360).
 */
function lerpAngleDeg(a: number, b: number, t: number): number {
  const delta = ((b - a) % 360 + 540) % 360 - 180;
  return ((a + delta * t) % 360 + 360) % 360;
}

/**
 * Shortest-arc interpolation without output wrapping.
 * Roll must remain continuous through ±180° so the PFD completes aerobatic
 * rolls instead of springing back through 0° after the inverted point.
 */
function lerpContinuousAngleDeg(a: number, b: number, t: number): number {
  const delta = ((b - a) % 360 + 540) % 360 - 180;
  return a + delta * t;
}

// ── Ring buffer entry ─────────────────────────────────────────────────────

interface BufferEntry {
  tel: FlightTelemetry;
  ts: number;
}

// ── PFDInterpolationBuffer ────────────────────────────────────────────────

export class PFDInterpolationBuffer implements SnapshotProvider {
  private readonly _config: PFDBufferConfig;
  private readonly _buffer: Array<BufferEntry | null>;
  private _head: number = 0;
  private _count: number = 0;

  /** True once at least one sample has been pushed. */
  private _hasHadData: boolean = false;

  /** Pre-allocated mutable output — zero allocation per frame. */
  private readonly _output: FlightTelemetry;

  // ── Diagnostic (DEV only) ───────────────────────────────────────────────
  private _dbgPushCount: number = 0;
  private _dbgLastLogMs: number = 0;
  private _dbgSampleFreezeCount: number = 0;

  constructor(config: Partial<PFDBufferConfig> = {}) {
    this._config = { ...DEFAULT_PFD_BUFFER_CONFIG, ...config };
    this._buffer = new Array<BufferEntry | null>(this._config.maxBufferSize).fill(null);
    this._output = PFDInterpolationBuffer._deepCloneTelemetry(DEFAULT_FLIGHT_TELEMETRY);
  }

  // ── Public API ──────────────────────────────────────────────────────────

  /**
   * Add a telemetry sample to the ring buffer.
   * If the gap from the previous sample exceeds maxGapMs, the buffer is
   * cleared first (reconnection scenario).
   */
  pushSample(tel: FlightTelemetry, timestampMs: number): void {
    this._hasHadData = true;

    if (this._count > 0) {
      const newest = this._getEntry(this._count - 1)!;
      if (timestampMs - newest.ts > this._config.maxGapMs) {
        // ── DIAGNOSTIC ──────────────────────────────────────────────────
        if (import.meta.env.DEV) {
          const gap = timestampMs - newest.ts;
          console.warn(
            `[PFD BUF] Gap ${gap.toFixed(0)}ms > maxGapMs ${this._config.maxGapMs}ms ` +
            `— clearing buffer (count was ${this._count})`,
          );
        }
        this.reset();
      }
    }

    if (this._count < this._config.maxBufferSize) {
      this._buffer[this._head] = { tel, ts: timestampMs };
      this._head = (this._head + 1) % this._config.maxBufferSize;
      this._count++;
    } else {
      this._buffer[this._head] = { tel, ts: timestampMs };
      this._head = (this._head + 1) % this._config.maxBufferSize;
    }

    // ── DIAGNOSTIC (1 Hz) ───────────────────────────────────────────────
    if (import.meta.env.DEV) {
      this._dbgPushCount++;
      if (timestampMs - this._dbgLastLogMs >= 1000) {
        this._dbgLastLogMs = timestampMs;
        const a = tel.attitude;
        const alt = tel.altitude;
        const v = tel.velocity;
        console.log(
          `[PFD BUF push | depth=${this._count} | ${this._dbgPushCount}/s]` +
          `\n  pitch=${a.pitchDeg.toFixed(2)}° roll=${a.rollDeg.toFixed(2)}° yaw=${a.yawDeg.toFixed(2)}°` +
          `\n  alt=${alt.altitudeMSLm.toFixed(1)}m spd=${v.groundSpeedMs.toFixed(1)}m/s`,
        );
        this._dbgPushCount = 0;
      }
    }
  }

  /**
   * Core interpolation method.
   * Computes renderTime = nowMs - renderDelayMs, finds the two bracketing
   * samples, and linearly interpolates between them.
   *
   * ZERO heap allocation — writes to pre-allocated _output.
   */
  sample(nowMs: number): Readonly<FlightTelemetry> {
    if (this._count === 0) {
      // After a gap-reset, freeze at last rendered frame instead of flashing
      // to all-zeros (DEFAULT) which causes a visible "black PFD" glitch.
      if (import.meta.env.DEV) {
        this._dbgSampleFreezeCount++;
        if (this._dbgSampleFreezeCount <= 3 || this._dbgSampleFreezeCount % 60 === 0) {
          console.warn(
            `[PFD BUF sample] count=0 freeze #${this._dbgSampleFreezeCount}` +
            ` hasHadData=${this._hasHadData}` +
            ` → returning ${this._hasHadData ? '_output (frozen)' : 'DEFAULT'}` +
            `\n  frozenPitch=${this._output.attitude.pitchDeg.toFixed(2)}°` +
            ` frozenAlt=${this._output.altitude.altitudeMSLm.toFixed(1)}m`,
          );
        }
      }
      return this._hasHadData ? this._output : DEFAULT_FLIGHT_TELEMETRY;
    }
    if (import.meta.env.DEV) this._dbgSampleFreezeCount = 0;

    const renderTime = nowMs - this._config.renderDelayMs;
    const oldest = this._getEntry(0)!;
    const newest = this._getEntry(this._count - 1)!;

    if (renderTime <= oldest.ts) {
      PFDInterpolationBuffer._copyTelemetry(oldest.tel, this._output);
      return this._output;
    }

    if (renderTime > newest.ts) {
      return this._extrapolateEdge(renderTime);
    }

    // Find bracket [A, B] — scan backwards from newest
    let aIdx = this._count - 2;
    while (aIdx > 0) {
      const entry = this._getEntry(aIdx)!;
      if (entry.ts <= renderTime) break;
      aIdx--;
    }
    const bIdx = aIdx + 1;

    const A = this._getEntry(aIdx)!;
    const B = this._getEntry(bIdx)!;
    const span = B.ts - A.ts;
    const t = span > 0 ? clamp01((renderTime - A.ts) / span) : 1;

    this._interpolate(A.tel, B.tel, t);
    return this._output;
  }

  /** SnapshotProvider — calls sample(performance.now()) */
  getSnapshot(): Readonly<FlightTelemetry> {
    return this.sample(performance.now());
  }

  /** SnapshotProvider — calls sample(nowMs) */
  getExtrapolatedSnapshot(nowMs: number): Readonly<FlightTelemetry> {
    return this.sample(nowMs);
  }

  /** Clear the buffer. */
  reset(): void {
    this._head = 0;
    this._count = 0;
    for (let i = 0; i < this._config.maxBufferSize; i++) {
      this._buffer[i] = null;
    }
  }

  /** Current number of samples in the buffer. */
  get bufferDepth(): number {
    return this._count;
  }

  // ── Private helpers ─────────────────────────────────────────────────────

  /**
   * Get the i-th entry in time order (0 = oldest, count-1 = newest).
   */
  private _getEntry(index: number): BufferEntry | null {
    if (index < 0 || index >= this._count) return null;
    const size = this._config.maxBufferSize;
    let actualIndex: number;
    if (this._count < size) {
      actualIndex = index;
    } else {
      actualIndex = (this._head + index) % size;
    }
    return this._buffer[actualIndex];
  }

  /**
   * Angular-rate dead-reckoning: projects attitude forward from the newest
   * sample using the IMU angular rates stored in FlightTelemetry:
   *   pitchRateDegS / rollRateDegS / yawRateDegS (from ATTITUDE.pitchspeed etc.)
   *
   * Why this is better than the previous two-sample linear projection:
   *
   *   Old approach:  velocity = (newest.pitch - secondNewest.pitch) / span
   *     • span ≈ 50ms inside a burst → tiny position change → large t when
   *       overshoot > span → amplification artifacts (t = 1 + 150/50 = 4×).
   *
   *   New approach:  velocity = newest.pitchRateDegS (direct from IMU)
   *     • No division by span → no span-dependent amplification.
   *     • Physically correct: the aircraft continues at its current rotation
   *       rate → looks natural through inter-burst gaps.
   *     • Works with only ONE sample in the buffer (no secondNewest needed).
   *     • Altitude is also projected using verticalSpeedMs → eliminates the
   *       altitude-bar freeze that persisted while the horizon moved smoothly.
   *
   * Bounded by maxEdgeExtrapolationMs (1000ms for SiK config) so cumulative
   * drift stays < 5° even at 5°/s cruise attitude rates.
   */
  private _extrapolateEdge(renderTime: number): Readonly<FlightTelemetry> {
    const newest = this._getEntry(this._count - 1)!;

    // Copy newest as the base; fields not explicitly projected stay at last known value.
    PFDInterpolationBuffer._copyTelemetry(newest.tel, this._output);

    if (this._config.maxEdgeExtrapolationMs <= 0) {
      return this._output; // extrapolation disabled → freeze at newest
    }

    const overshoot = renderTime - newest.ts;
    const dtS = Math.min(overshoot, this._config.maxEdgeExtrapolationMs) / 1000;

    const att = newest.tel.attitude;
    const vel = newest.tel.velocity;

    // ── Attitude: IMU angular rate dead-reckoning ─────────────────────────
    const rawPitch = att.pitchDeg + att.pitchRateDegS * dtS;
    this._output.attitude.pitchDeg = Math.max(-90, Math.min(90, rawPitch));
    this._output.attitude.rollDeg  = att.rollDeg + att.rollRateDegS * dtS;
    const rawYaw = att.yawDeg + att.yawRateDegS * dtS;
    this._output.attitude.yawDeg   = ((rawYaw % 360) + 360) % 360;

    // ── Altitude: vertical-speed dead-reckoning ───────────────────────────
    // Removes the altitude-bar freeze that appeared while the horizon kept
    // moving during inter-burst gaps.
    this._output.altitude.altitudeMSLm =
      newest.tel.altitude.altitudeMSLm + vel.verticalSpeedMs * dtS;
    if (newest.tel.altitude.altitudeAGLm !== null) {
      this._output.altitude.altitudeAGLm =
        newest.tel.altitude.altitudeAGLm + vel.verticalSpeedMs * dtS;
    }

    return this._output;
  }

  /**
   * Interpolate between A and B at parameter t, writing into _output.
   * t ∈ [0,1] for interpolation, t > 1 for bounded edge extrapolation.
   */
  private _interpolate(A: FlightTelemetry, B: FlightTelemetry, t: number): void {
    const out = this._output;

    // ── Linear lerp fields ──────────────────────────────────────────────
    out.attitude.pitchDeg      = lerp(A.attitude.pitchDeg,      B.attitude.pitchDeg,      t);
    out.attitude.rollDeg       = lerpContinuousAngleDeg(A.attitude.rollDeg, B.attitude.rollDeg, t);
    out.attitude.pitchRateDegS = lerp(A.attitude.pitchRateDegS, B.attitude.pitchRateDegS, t);
    out.attitude.rollRateDegS  = lerp(A.attitude.rollRateDegS,  B.attitude.rollRateDegS,  t);
    out.attitude.yawRateDegS   = lerp(A.attitude.yawRateDegS,   B.attitude.yawRateDegS,   t);

    out.velocity.groundSpeedMs   = lerp(A.velocity.groundSpeedMs,   B.velocity.groundSpeedMs,   t);
    out.velocity.verticalSpeedMs = lerp(A.velocity.verticalSpeedMs, B.velocity.verticalSpeedMs, t);
    out.velocity.velNorthMs      = lerp(A.velocity.velNorthMs,      B.velocity.velNorthMs,      t);
    out.velocity.velEastMs       = lerp(A.velocity.velEastMs,       B.velocity.velEastMs,       t);
    out.velocity.velDownMs       = lerp(A.velocity.velDownMs,       B.velocity.velDownMs,       t);
    out.velocity.throttlePercent = lerp(A.velocity.throttlePercent, B.velocity.throttlePercent, t);

    out.altitude.altitudeMSLm = lerp(A.altitude.altitudeMSLm, B.altitude.altitudeMSLm, t);
    out.navigation.latitude   = lerp(A.navigation.latitude,   B.navigation.latitude,   t);
    out.navigation.longitude  = lerp(A.navigation.longitude,  B.navigation.longitude,  t);
    out.timestamp             = lerp(A.timestamp,             B.timestamp,             t);

    // ── Nullable linear lerp fields ─────────────────────────────────────
    out.velocity.airSpeedMs = (A.velocity.airSpeedMs != null && B.velocity.airSpeedMs != null)
      ? lerp(A.velocity.airSpeedMs, B.velocity.airSpeedMs, t)
      : B.velocity.airSpeedMs;

    out.altitude.altitudeAGLm = (A.altitude.altitudeAGLm != null && B.altitude.altitudeAGLm != null)
      ? lerp(A.altitude.altitudeAGLm, B.altitude.altitudeAGLm, t)
      : B.altitude.altitudeAGLm;

    // ── Shortest-arc angle lerp fields ──────────────────────────────────
    out.attitude.yawDeg       = lerpAngleDeg(A.attitude.yawDeg,       B.attitude.yawDeg,       t);
    out.navigation.headingDeg = lerpAngleDeg(A.navigation.headingDeg, B.navigation.headingDeg, t);

    out.navigation.courseOverGroundDeg =
      (A.navigation.courseOverGroundDeg != null && B.navigation.courseOverGroundDeg != null)
        ? lerpAngleDeg(A.navigation.courseOverGroundDeg, B.navigation.courseOverGroundDeg, t)
        : B.navigation.courseOverGroundDeg;

    // ── Passthrough from B (latest) ─────────────────────────────────────
    out.vehicleStatus                   = B.vehicleStatus;
    out.gpsStatus                       = B.gpsStatus;
    out.battery                         = B.battery;
    out.ekf                             = B.ekf;
    out.controlSurfaces                 = B.controlSurfaces;
    out.altitude.homeAltitudeMSLm       = B.altitude.homeAltitudeMSLm;
    out.navigation.currentWaypointIndex = B.navigation.currentWaypointIndex;
    out.navigation.distanceToWaypointM  = B.navigation.distanceToWaypointM;
    out.navigation.bearingToWaypointDeg = B.navigation.bearingToWaypointDeg;
  }

  // ── Static helpers ──────────────────────────────────────────────────────

  /** Deep clone a FlightTelemetry object (used once in constructor). */
  private static _deepCloneTelemetry(src: Readonly<FlightTelemetry>): FlightTelemetry {
    return {
      timestamp: src.timestamp,
      attitude: { ...src.attitude },
      velocity: { ...src.velocity },
      altitude: { ...src.altitude },
      navigation: { ...src.navigation },
      vehicleStatus: { ...src.vehicleStatus },
      gpsStatus: { ...src.gpsStatus },
      battery: { ...src.battery },
      ekf: { ...src.ekf },
      controlSurfaces: { ...src.controlSurfaces },
      statusTextMessages: src.statusTextMessages,
    };
  }

  /** Copy all fields from src into dst in-place (zero allocation). */
  private static _copyTelemetry(src: FlightTelemetry, dst: FlightTelemetry): void {
    dst.timestamp = src.timestamp;

    dst.attitude.pitchDeg      = src.attitude.pitchDeg;
    dst.attitude.rollDeg       = src.attitude.rollDeg;
    dst.attitude.yawDeg        = src.attitude.yawDeg;
    dst.attitude.pitchRateDegS = src.attitude.pitchRateDegS;
    dst.attitude.rollRateDegS  = src.attitude.rollRateDegS;
    dst.attitude.yawRateDegS   = src.attitude.yawRateDegS;

    dst.velocity.groundSpeedMs   = src.velocity.groundSpeedMs;
    dst.velocity.airSpeedMs      = src.velocity.airSpeedMs;
    dst.velocity.verticalSpeedMs = src.velocity.verticalSpeedMs;
    dst.velocity.velNorthMs      = src.velocity.velNorthMs;
    dst.velocity.velEastMs       = src.velocity.velEastMs;
    dst.velocity.velDownMs       = src.velocity.velDownMs;

    dst.altitude.altitudeMSLm      = src.altitude.altitudeMSLm;
    dst.altitude.altitudeAGLm      = src.altitude.altitudeAGLm;
    dst.altitude.homeAltitudeMSLm  = src.altitude.homeAltitudeMSLm;

    dst.navigation.latitude             = src.navigation.latitude;
    dst.navigation.longitude            = src.navigation.longitude;
    dst.navigation.headingDeg           = src.navigation.headingDeg;
    dst.navigation.courseOverGroundDeg   = src.navigation.courseOverGroundDeg;
    dst.navigation.currentWaypointIndex = src.navigation.currentWaypointIndex;
    dst.navigation.distanceToWaypointM  = src.navigation.distanceToWaypointM;
    dst.navigation.bearingToWaypointDeg = src.navigation.bearingToWaypointDeg;

    dst.vehicleStatus = src.vehicleStatus;
    dst.gpsStatus     = src.gpsStatus;
    dst.battery       = src.battery;
    dst.ekf           = src.ekf;
    dst.controlSurfaces = src.controlSurfaces;
    dst.statusTextMessages = src.statusTextMessages;
  }
}
