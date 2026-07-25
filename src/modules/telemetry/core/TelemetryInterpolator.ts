/**
 * TelemetryInterpolator.ts
 *
 * ════════════════════════════════════════════════════════════════════════
 * 60 Hz VISUAL SMOOTHING LAYER — converts sparse telemetry to fluid motion
 * ════════════════════════════════════════════════════════════════════════
 *
 * Real MAVLink telemetry arrives at irregular, mixed rates:
 *
 *   ATTITUDE          50 Hz   (20 ms gap)
 *   GLOBAL_POSITION   10 Hz   (100 ms gap)  ← position bottleneck
 *   VFR_HUD           10 Hz   (100 ms gap)
 *   GPS_RAW_INT        5 Hz   (200 ms gap)
 *   Simulation source  20 Hz  (50 ms gap)
 *
 * Without interpolation the 3D model, map marker and PFD update in visible
 * discrete steps.  This class inserts a requestAnimationFrame loop between
 * the TelemetryManager output and the droneStore, emitting a smoothly
 * interpolated FlightTelemetry snapshot every ~16.7 ms (~60 Hz) regardless
 * of the upstream packet rate.
 *
 * ── Algorithm ─────────────────────────────────────────────────────────────
 *
 *   Ring buffer (INTERP_HISTORY_DEPTH slots):
 *     snaps[A]  ← previous confirmed snapshot
 *     snaps[B]  ← latest  confirmed snapshot  (tail)
 *
 *   Every rAF tick:
 *     t = clamp(0, 1, (now − tsA) / (tsB − tsA))
 *
 *   t < 1 (normal):
 *     → Linear lerp(A, B, t) for all visual scalar fields.
 *     → Shortest-arc lerp for yaw / heading — prevents 359°→1° spin.
 *
 *   t ≥ 1 (packet overdue) and INTERP_PREDICT_BEYOND_LAST enabled:
 *     → Dead-reckoning from B via NED velocity:
 *         Δlat = velNorth × Δt / 111 320
 *         Δlng = velEast  × Δt / (111 320 × cos(lat))
 *         Δalt = −velDown × Δt
 *     → Capped at INTERP_PREDICT_CAP_MS from B.
 *       After the cap: hold B unchanged.
 *
 * ── Safety invariants ─────────────────────────────────────────────────────
 *
 *   • Lerped output NEVER exceeds the latest confirmed snapshot B
 *     (t is clamped to [0,1] before lerp).
 *   • Dead-reckoning is independently capped at INTERP_PREDICT_CAP_MS.
 *   • Passthrough fields (battery, mode, gpsStatus, ekf) always reflect
 *     the latest real value and are never interpolated.
 *   • With only one snapshot, emits B unchanged — no extrapolation.
 *   • rAF Δt is capped at 100 ms to skip artefacts from hidden-tab pauses.
 *
 * ── Configuration ────────────────────────────────────────────────────────
 *
 *   All tunable knobs live in `src/config/interpolationConfig.ts`.
 *   No magic numbers in this file.
 *
 * ── Integration ──────────────────────────────────────────────────────────
 *
 *   // Inside DroneStateManager.registerDrone():
 *   const interp = new TelemetryInterpolator();
 *   interp.start();
 *
 *   manager.onTelemetry(tel => interp.pushSnapshot(tel));   // real rate
 *   interp.onFrame(tel => droneStore.updateDrone(id, ...)); // 60 Hz
 *
 *   // Cleanup:
 *   interp.stop();
 *
 * Zero React. Zero DOM. Pure TypeScript.
 */

import {
  INTERP_PREDICT_BEYOND_LAST,
  INTERP_PREDICT_CAP_MS,
  INTERP_HISTORY_DEPTH,
} from '../../../shared/config/interpolationConfig';
import type { FlightTelemetry } from './FlightTelemetryModel';

// ── Math helpers ──────────────────────────────────────────────────────────

const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);
const lerp     = (a: number, b: number, t: number): number => a + (b - a) * t;
const wrapAngleDeg = (value: number): number => ((value % 360) + 360) % 360;

/**
 * Shortest-arc linear interpolation for angles expressed in degrees.
 * Prevents the 359°→1° wrap-around spin artefact.
 * Output is normalised to [0, 360).
 */
function lerpAngleDeg(a: number, b: number, t: number): number {
  const delta = ((b - a) % 360 + 540) % 360 - 180; // Δ ∈ (-180, 180]
  return wrapAngleDeg(a + delta * t);
}

/**
 * Catmull-Rom cubic spline interpolation for scalar values.
 *
 * Interpolates between P1 and P2 using P0 (previous) and P3 (ghost/next)
 * as tangent guides.  t ∈ [0, 1].
 *
 * Formula (uniform Catmull-Rom):
 *   q(t) = 0.5 * [(2*P1)
 *              + (-P0 + P2)          * t
 *              + (2P0 - 5P1 + 4P2 - P3) * t²
 *              + (-P0 + 3P1 - 3P2 + P3)  * t³]
 */
function catmullRom(p0: number, p1: number, p2: number, p3: number, t: number): number {
  const t2 = t * t;
  const t3 = t2 * t;
  return 0.5 * (
    (2 * p1) +
    (-p0 + p2) * t +
    (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 +
    (-p0 + 3 * p1 - 3 * p2 + p3) * t3
  );
}

/**
 * Catmull-Rom for circular angles (degrees).
 * Works in a local frame around P1 to avoid 359°→0° wrap-around artifacts.
 * Output normalised to [0, 360).
 */
function catmullRomAngleDeg(p0: number, p1: number, p2: number, p3: number, t: number): number {
  // Bring all points into the frame where P1 = 0 using shortest-arc deltas.
  const d01 = ((p0 - p1 + 540) % 360) - 180; // p0 offset from p1
  const d21 = ((p2 - p1 + 540) % 360) - 180; // p2 offset from p1
  const d31 = ((p3 - p1 + 540) % 360) - 180; // p3 offset from p1
  const result = catmullRom(d01, 0, d21, d31, t);
  return ((p1 + result) % 360 + 360) % 360;
}


interface Snap {
  tel: FlightTelemetry;
  /** Wall-clock ms when pushSnapshot was called (Date.now()). */
  ts: number;
}

type FrameCallback = (tel: FlightTelemetry) => void;
type Unsubscribe   = () => void;

// ─────────────────────────────────────────────────────────────────────────
// TelemetryInterpolator
// ─────────────────────────────────────────────────────────────────────────

export class TelemetryInterpolator {
  // ── Ring buffer ───────────────────────────────────────────────────────
  /** Fixed-size array of INTERP_HISTORY_DEPTH slots. null = not yet filled. */
  private readonly _snaps: Array<Snap | null>;
  /** Index of the most recently written slot (the "B" slot). */
  private _tail:  number = 0;
  /** How many snapshots have been pushed (saturates at INTERP_HISTORY_DEPTH). */
  private _count: number = 0;

  // ── rAF loop ──────────────────────────────────────────────────────────
  private _rafId:     number | null = null;
  private _running:   boolean       = false;
  // ── Subscribers ───────────────────────────────────────────────────────
  private readonly _listeners: Set<FrameCallback> = new Set();

  // ─────────────────────────────────────────────────────────────────────

  constructor() {
    this._snaps = new Array<Snap | null>(INTERP_HISTORY_DEPTH).fill(null);
  }

  // ── Public API ────────────────────────────────────────────────────────

  /**
   * Feed a new real (smoothed) telemetry snapshot into the interpolator.
   *
   * Call this from the TelemetryManager.onTelemetry() callback.
   * The wall-clock timestamp is captured here (Date.now()) so the lerp
   * parameter t tracks real elapsed time, independent of the telemetry
   * source's own clock.
   */
  pushSnapshot(tel: FlightTelemetry): void {
    this._tail = (this._tail + 1) % INTERP_HISTORY_DEPTH;
    this._snaps[this._tail] = { tel, ts: Date.now() };
    if (this._count < INTERP_HISTORY_DEPTH) this._count++;
  }

  /**
   * Start the requestAnimationFrame loop.
   * Safe to call multiple times — idempotent.
   * Must be called in a browser context.
   */
  start(): void {
    if (this._running) return;
    this._running   = true;
    this._rafId     = requestAnimationFrame(this._tick);
  }

  /**
   * Stop the rAF loop.  Can be restarted with start().
   * Registered onFrame listeners are kept — only the loop is paused.
   */
  stop(): void {
    this._running = false;
    if (this._rafId !== null) {
      cancelAnimationFrame(this._rafId);
      this._rafId = null;
    }
  }

  /**
   * Subscribe to 60 Hz interpolated frames.
   * @returns An unsubscribe function.
   */
  onFrame(callback: FrameCallback): Unsubscribe {
    this._listeners.add(callback);
    return () => { this._listeners.delete(callback); };
  }
  /**
   * Clears interpolation history immediately.
   * Use when switching telemetry authority (simulation ↔ live) so stale
   * snapshots cannot leak previous-map positions into the next mode.
   */
  reset(): void {
    for (let i = 0; i < this._snaps.length; i++) this._snaps[i] = null;
    this._tail = 0;
    this._count = 0;
  }
  // ── rAF loop ──────────────────────────────────────────────────────────

  /** Arrow-function preserves `this` across rAF callbacks. */
  private readonly _tick = (_rafNow: number): void => {
    if (!this._running) return;

    // Cap Δt at 100 ms to suppress artefacts after a hidden-tab pause or GC.
    // Nothing to emit yet.
    if (this._count === 0) {
      this._rafId = requestAnimationFrame(this._tick);
      return;
    }

    const snapB = this._snaps[this._tail]!;

    // Only one snapshot available — emit as-is.
    if (this._count < 2) {
      this._emit(snapB.tel);
      this._rafId = requestAnimationFrame(this._tick);
      return;
    }

    const idxA  = (this._tail - 1 + INTERP_HISTORY_DEPTH) % INTERP_HISTORY_DEPTH;
    const snapA = this._snaps[idxA];

    if (!snapA) {
      this._emit(snapB.tel);
      this._rafId = requestAnimationFrame(this._tick);
      return;
    }

    const interval = snapB.ts - snapA.ts;
    const now      = Date.now();

    // Guard: identical timestamps (should not occur in practice).
    if (interval <= 0) {
      this._emit(snapB.tel);
      this._rafId = requestAnimationFrame(this._tick);
      return;
    }

    const rawT = (now - snapA.ts) / interval;

    if (rawT <= 1) {
      // ── Linear lerp A → B ─────────────────────────────────────────────────
      // Catmull-Rom was removed: GPS lat/lon arrives unsmoothed from the
      // parser (SmoothingEngine only touches attitude/velocity, never position).
      // Random GPS noise (±1–5 m per packet, uncorrelated) feeds into the
      // Catmull-Rom control points, causing the cubic spline to massively
      // overshoot the real position — the drone marker jumped 10–30 m while
      // actually stationary.  Linear lerp is bounded within [A, B] by
      // construction and does not exhibit this artefact.
      this._emit(this._interpolate(snapA.tel, snapB.tel, clamp01(rawT)));
    } else {
      // ── Packet overdue — rawT > 1 ──────────────────────────────────
      const overdueMsFromB = now - snapB.ts;
      if (INTERP_PREDICT_BEYOND_LAST && overdueMsFromB <= INTERP_PREDICT_CAP_MS) {
        this._emit(this._deadReckon(snapB.tel, overdueMsFromB / 1000));
      } else {
        // Hold last confirmed value.
        this._emit(snapB.tel);
      }
    }

    this._rafId = requestAnimationFrame(this._tick);
  };

  // ── Interpolation ─────────────────────────────────────────────────────

  /**
   * Build an interpolated FlightTelemetry between A and B at factor t ∈ [0,1].
   *
   * Visual fields (position, attitude, velocity) are linearly interpolated.
   * Angle fields (yaw, heading) use shortest-arc lerp.
   * Status / health fields (battery, mode, gps, ekf) are passed through from B.
   */
  private _interpolate(a: FlightTelemetry, b: FlightTelemetry, t: number): FlightTelemetry {
    return {
      timestamp: lerp(a.timestamp, b.timestamp, t),

      attitude: {
        pitchDeg:      lerp(a.attitude.pitchDeg,          b.attitude.pitchDeg,          t),
        rollDeg:       lerp(a.attitude.rollDeg,            b.attitude.rollDeg,            t),
        yawDeg:        lerpAngleDeg(a.attitude.yawDeg,     b.attitude.yawDeg,             t),
        pitchRateDegS: lerp(a.attitude.pitchRateDegS,      b.attitude.pitchRateDegS,      t),
        rollRateDegS:  lerp(a.attitude.rollRateDegS,       b.attitude.rollRateDegS,       t),
        yawRateDegS:   lerp(a.attitude.yawRateDegS,        b.attitude.yawRateDegS,        t),
      },

      velocity: {
        groundSpeedMs:   lerp(a.velocity.groundSpeedMs,   b.velocity.groundSpeedMs,   t),
        airSpeedMs:
          a.velocity.airSpeedMs !== null && b.velocity.airSpeedMs !== null
            ? lerp(a.velocity.airSpeedMs, b.velocity.airSpeedMs, t)
            : b.velocity.airSpeedMs,
        verticalSpeedMs: lerp(a.velocity.verticalSpeedMs, b.velocity.verticalSpeedMs, t),
        throttlePercent: lerp(a.velocity.throttlePercent, b.velocity.throttlePercent, t),
        velNorthMs:      lerp(a.velocity.velNorthMs,      b.velocity.velNorthMs,      t),
        velEastMs:       lerp(a.velocity.velEastMs,       b.velocity.velEastMs,       t),
        velDownMs:       lerp(a.velocity.velDownMs,       b.velocity.velDownMs,       t),
      },

      altitude: {
        altitudeMSLm:  lerp(a.altitude.altitudeMSLm, b.altitude.altitudeMSLm, t),
        altitudeAGLm:
          a.altitude.altitudeAGLm !== null && b.altitude.altitudeAGLm !== null
            ? lerp(a.altitude.altitudeAGLm, b.altitude.altitudeAGLm, t)
            : b.altitude.altitudeAGLm,
        homeAltitudeMSLm: b.altitude.homeAltitudeMSLm, // passthrough
      },

      navigation: {
        latitude:             lerp(a.navigation.latitude,  b.navigation.latitude,  t),
        longitude:            lerp(a.navigation.longitude, b.navigation.longitude, t),
        headingDeg:           lerpAngleDeg(a.navigation.headingDeg,          b.navigation.headingDeg,          t),
        courseOverGroundDeg:
          a.navigation.courseOverGroundDeg !== null && b.navigation.courseOverGroundDeg !== null
            ? lerpAngleDeg(a.navigation.courseOverGroundDeg, b.navigation.courseOverGroundDeg, t)
            : b.navigation.courseOverGroundDeg,
        // Mission-state fields: always latest real value — no lerp.
        currentWaypointIndex: b.navigation.currentWaypointIndex,
        distanceToWaypointM:  b.navigation.distanceToWaypointM,
        bearingToWaypointDeg: b.navigation.bearingToWaypointDeg,
      },

      // ── Passthrough — these must never be interpolated ───────────────
      // Lerping battery % would cause flicker; lerping mode/health could
      // emit intermediate enum values that don't exist.
      vehicleStatus: b.vehicleStatus,
      gpsStatus:     b.gpsStatus,
      battery:       b.battery,
      ekf:           b.ekf,
      controlSurfaces: b.controlSurfaces,
      statusTextMessages: b.statusTextMessages,
    };
  }

  /**
   * Catmull-Rom interpolation between A (P1) and B (P2).
   *
   * P0  = confirmed snapshot two steps before B (history tangent guide).
   * P3  = ghost point synthesised as (2*B − A) — linear extrapolation past B.
   *       This gives a smooth tangent at B without needing a future snapshot.
   *
   * Applied to: pitch, roll, yaw, heading, speed, altitude, lat/lng.
   * Rate fields (pitchRateDegS etc.) use linear lerp — they are derivatives,
   * not positions; Catmull-Rom on them could overshoot badly.
   * Status / health fields always pass through from B unchanged.
   */
  _catmullRomInterpolate(
    p0: FlightTelemetry,
    a:  FlightTelemetry,
    b:  FlightTelemetry,
    t:  number,
  ): FlightTelemetry {
    // Ghost P3: linear extrapolation beyond B.
    // For scalar f: ghost.f = 2*b.f - a.f
    // For circular angles the wrap-around is handled inside catmullRomAngleDeg.

    const ghostPitch = 2 * b.attitude.pitchDeg - a.attitude.pitchDeg;
    const ghostRoll  = 2 * b.attitude.rollDeg  - a.attitude.rollDeg;
    const ghostYaw   = ((2 * b.attitude.yawDeg - a.attitude.yawDeg) % 360 + 360) % 360;

    const ghostGS  = 2 * b.velocity.groundSpeedMs   - a.velocity.groundSpeedMs;
    const ghostVS  = 2 * b.velocity.verticalSpeedMs  - a.velocity.verticalSpeedMs;
    const ghostThrottle = 2 * b.velocity.throttlePercent - a.velocity.throttlePercent;
    const ghostAS  = b.velocity.airSpeedMs !== null && a.velocity.airSpeedMs !== null
      ? 2 * b.velocity.airSpeedMs - a.velocity.airSpeedMs : null;

    const ghostAlt = 2 * b.altitude.altitudeMSLm - a.altitude.altitudeMSLm;
    const ghostAGL = b.altitude.altitudeAGLm !== null && a.altitude.altitudeAGLm !== null
      ? 2 * b.altitude.altitudeAGLm - a.altitude.altitudeAGLm : null;

    const ghostLat     = 2 * b.navigation.latitude  - a.navigation.latitude;
    const ghostLng     = 2 * b.navigation.longitude - a.navigation.longitude;
    const ghostHeading = ((2 * b.navigation.headingDeg - a.navigation.headingDeg) % 360 + 360) % 360;

    return {
      timestamp: lerp(a.timestamp, b.timestamp, t),

      attitude: {
        pitchDeg: catmullRom(p0.attitude.pitchDeg, a.attitude.pitchDeg, b.attitude.pitchDeg, ghostPitch, t),
        rollDeg:  catmullRom(p0.attitude.rollDeg,  a.attitude.rollDeg,  b.attitude.rollDeg,  ghostRoll,  t),
        yawDeg:   catmullRomAngleDeg(p0.attitude.yawDeg, a.attitude.yawDeg, b.attitude.yawDeg, ghostYaw, t),
        // Rate fields — linear lerp (no Catmull-Rom on derivatives)
        pitchRateDegS: lerp(a.attitude.pitchRateDegS, b.attitude.pitchRateDegS, t),
        rollRateDegS:  lerp(a.attitude.rollRateDegS,  b.attitude.rollRateDegS,  t),
        yawRateDegS:   lerp(a.attitude.yawRateDegS,   b.attitude.yawRateDegS,   t),
      },

      velocity: {
        groundSpeedMs:   catmullRom(p0.velocity.groundSpeedMs,  a.velocity.groundSpeedMs,  b.velocity.groundSpeedMs,  ghostGS, t),
        airSpeedMs:      ghostAS !== null && a.velocity.airSpeedMs !== null && b.velocity.airSpeedMs !== null
          ? catmullRom(p0.velocity.airSpeedMs ?? a.velocity.airSpeedMs, a.velocity.airSpeedMs, b.velocity.airSpeedMs, ghostAS, t)
          : b.velocity.airSpeedMs,
        verticalSpeedMs: catmullRom(p0.velocity.verticalSpeedMs, a.velocity.verticalSpeedMs, b.velocity.verticalSpeedMs, ghostVS, t),
        throttlePercent: catmullRom(
          p0.velocity.throttlePercent,
          a.velocity.throttlePercent,
          b.velocity.throttlePercent,
          ghostThrottle,
          t,
        ),
        // NED velocity — linear lerp (they drive dead-reckoning, not visual)
        velNorthMs: lerp(a.velocity.velNorthMs, b.velocity.velNorthMs, t),
        velEastMs:  lerp(a.velocity.velEastMs,  b.velocity.velEastMs,  t),
        velDownMs:  lerp(a.velocity.velDownMs,  b.velocity.velDownMs,  t),
      },

      altitude: {
        altitudeMSLm:    catmullRom(p0.altitude.altitudeMSLm, a.altitude.altitudeMSLm, b.altitude.altitudeMSLm, ghostAlt, t),
        altitudeAGLm:    ghostAGL !== null && a.altitude.altitudeAGLm !== null && b.altitude.altitudeAGLm !== null
          ? catmullRom(p0.altitude.altitudeAGLm ?? a.altitude.altitudeAGLm, a.altitude.altitudeAGLm, b.altitude.altitudeAGLm, ghostAGL, t)
          : b.altitude.altitudeAGLm,
        homeAltitudeMSLm: b.altitude.homeAltitudeMSLm, // passthrough
      },

      navigation: {
        latitude:  catmullRom(p0.navigation.latitude,  a.navigation.latitude,  b.navigation.latitude,  ghostLat, t),
        longitude: catmullRom(p0.navigation.longitude, a.navigation.longitude, b.navigation.longitude, ghostLng, t),
        headingDeg: catmullRomAngleDeg(p0.navigation.headingDeg, a.navigation.headingDeg, b.navigation.headingDeg, ghostHeading, t),
        courseOverGroundDeg:
          a.navigation.courseOverGroundDeg !== null && b.navigation.courseOverGroundDeg !== null
            ? lerpAngleDeg(a.navigation.courseOverGroundDeg, b.navigation.courseOverGroundDeg, t)
            : b.navigation.courseOverGroundDeg,
        // Mission-state fields: always latest real value — no interpolation.
        currentWaypointIndex: b.navigation.currentWaypointIndex,
        distanceToWaypointM:  b.navigation.distanceToWaypointM,
        bearingToWaypointDeg: b.navigation.bearingToWaypointDeg,
      },

      // ── Passthrough ─────────────────────────────────────────────────
      vehicleStatus: b.vehicleStatus,
      gpsStatus:     b.gpsStatus,
      battery:       b.battery,
      ekf:           b.ekf,
      controlSurfaces: b.controlSurfaces,
      statusTextMessages: b.statusTextMessages,
    };
  }

  /**
   * Dead-reckoning: extrapolate position from the last confirmed snapshot B
   * using the NED velocity vector.
   *
   *   Δlat (deg) = velNorth (m/s) × dt (s) / 111 320 (m/deg)
   *   Δlng (deg) = velEast  (m/s) × dt (s) / (111 320 × cos(lat))
   *   Δalt (m)   = −velDown (m/s) × dt (s)
   *
   * During telemetry gaps, yaw/heading continue from B using yawRateDegS.
   * This avoids accumulating angular lag until the next packet, which can
   * otherwise make the next correction choose the opposite rotation arc.
   * The caller guarantees dt ≤ INTERP_PREDICT_CAP_MS / 1000.
   *
   * @param b   Last confirmed snapshot.
   * @param dt  Seconds elapsed since B.  Already bounded by the caller.
   */
  private _deadReckon(b: FlightTelemetry, dt: number): FlightTelemetry {
    const latRad = b.navigation.latitude * (Math.PI / 180);
    const cosLat = Math.cos(latRad);

    const dLatDeg = (b.velocity.velNorthMs * dt) / 111_320;
    const dLngDeg = cosLat > 1e-6
      ? (b.velocity.velEastMs * dt) / (111_320 * cosLat)
      : 0;
    const dAlt = -b.velocity.velDownMs * dt;
    const yawRateDegS = Number.isFinite(b.attitude.yawRateDegS) ? b.attitude.yawRateDegS : 0;
    const yawDeg = wrapAngleDeg(b.attitude.yawDeg + yawRateDegS * dt);
    const headingDeg = wrapAngleDeg(b.navigation.headingDeg + yawRateDegS * dt);

    return {
      ...b,
      timestamp: b.timestamp + dt * 1000,
      attitude: {
        ...b.attitude,
        yawDeg,
      },
      navigation: {
        ...b.navigation,
        latitude:  b.navigation.latitude  + dLatDeg,
        longitude: b.navigation.longitude + dLngDeg,
        headingDeg,
      },
      altitude: {
        ...b.altitude,
        altitudeMSLm: b.altitude.altitudeMSLm + dAlt,
        altitudeAGLm: b.altitude.altitudeAGLm !== null
          ? b.altitude.altitudeAGLm + dAlt
          : null,
      },
    };
  }

  // ── Emit ──────────────────────────────────────────────────────────────

  private _emit(tel: FlightTelemetry): void {
    for (const cb of this._listeners) cb(tel);
  }
}

