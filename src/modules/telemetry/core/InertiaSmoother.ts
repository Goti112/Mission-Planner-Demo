/**
 * InertiaSmoother.ts
 *
 * Spring-physics inertia layer for the PFD.
 *
 * Wraps any SnapshotProvider and applies per-field spring-damper physics
 * at 60 Hz (rAF rate). The spring carries momentum through mode transitions
 * in the inner provider (e.g. PFDInterpolationBuffer's extrapolation→interpolation
 * transitions), eliminating visible "snaps" on the artificial horizon.
 *
 * Algorithm per field F each frame (dt ms):
 *   target = inner.getExtrapolatedSnapshot(nowMs)[F]
 *   error  = target − pos   (shortest arc for circular fields)
 *   acc    = omega² * error − 2*zeta*omega * vel
 *   vel   += acc * dt       ← symplectic Euler: vel first
 *   pos   += vel * dt
 *
 * Zero-allocation contract: _output is pre-allocated, mutated in-place.
 * Passthrough fields (battery, GPS, vehicleStatus, EKF, timestamp) are
 * always taken from the latest inner snapshot unchanged.
 *
 * Pure TypeScript — no React, no DOM. Testable in isolation.
 */

import type { FlightTelemetry } from './FlightTelemetryModel';
import { DEFAULT_FLIGHT_TELEMETRY } from './FlightTelemetryModel';
import type { SnapshotProvider } from './SnapshotProvider';

// ── Config ────────────────────────────────────────────────────────────────

/** Spring config for one field. */
export interface SpringConfig {
  /** Time constant in ms. omega = 1/tauMs. Lower = stiffer spring. */
  tauMs: number;
  /** Damping ratio. 1.0 = critical (no overshoot). <1 = underdamped (slight overshoot). */
  zeta: number;
}

export interface InertiaConfig {
  attitude: SpringConfig;  // pitch, roll
  yaw: SpringConfig;  // yawDeg, headingDeg (circular)
  altitude: SpringConfig;  // altitudeMSLm, altitudeAGLm
  speed: SpringConfig;  // groundSpeedMs, airSpeedMs
  climbRate: SpringConfig;  // verticalSpeedMs
  throttle: SpringConfig;  // throttlePercent
}

export const DEFAULT_INERTIA_CONFIG: InertiaConfig = {
  attitude: { tauMs: 250, zeta: 0.8 },  // pitch & roll: máxima fluidez (~800ms settle)
  yaw: { tauMs: 300, zeta: 0.8 },  // heading: giro muy suave y largo
  altitude: { tauMs: 140, zeta: 0.9 },  // altitud: fluida, sin overshoot brusco en la cinta
  speed: { tauMs: 170, zeta: 0.7 }, // velocidad: fluida, casi sin overshoot
  climbRate: { tauMs: 160, zeta: 0.6 },  // VSI: inercia larga, movimiento vivo
  throttle: { tauMs: 120, zeta: 0.8 },   // Throttle: reactivo pero suave
};

// ── Field state ───────────────────────────────────────────────────────────

interface FieldState {
  pos: number;
  vel: number; // units per ms
}

function makeField(pos: number): FieldState {
  return { pos, vel: 0 };
}

/** Wrap angle to [0, 360). */
function wrapDeg(a: number): number {
  let r = a % 360;
  if (r < 0) r += 360;
  return r;
}

/** Shortest arc from `from` to `to` in degrees, result in [-180, 180]. */
function shortestArc(from: number, to: number): number {
  return ((to - from) % 360 + 540) % 360 - 180;
}

// ── InertiaSmoother ───────────────────────────────────────────────────────

export class InertiaSmoother implements SnapshotProvider {
  private readonly _inner: SnapshotProvider;
  private readonly _cfg: InertiaConfig;

  // Per-field spring state
  private _pitch: FieldState = makeField(0);
  private _roll: FieldState = makeField(0);
  private _yaw: FieldState = makeField(0);
  private _heading: FieldState = makeField(0);
  private _altMSL: FieldState = makeField(0);
  private _altAGL: FieldState | null = null;
  private _groundSpeed: FieldState = makeField(0);
  private _airSpeed: FieldState | null = null;
  private _climbRate: FieldState = makeField(0);
  private _throttle: FieldState = makeField(0);

  private _lastNowMs: number = -1;
  private _initialized: boolean = false;

  /** Pre-allocated output — zero allocation per frame. */
  private readonly _output: FlightTelemetry;

  constructor(inner: SnapshotProvider, config: Partial<InertiaConfig> = {}) {
    this._inner = inner;
    this._cfg = { ...DEFAULT_INERTIA_CONFIG, ...config };
    this._output = InertiaSmoother._deepClone(DEFAULT_FLIGHT_TELEMETRY);
  }

  // ── Spring integration helpers ────────────────────────────────────────

  /**
   * Advance a linear spring one timestep (symplectic Euler).
   * Mutates `state` in-place. Returns new position.
   */
  private _stepLinear(state: FieldState, target: number, dt: number, cfg: SpringConfig): number {
    const omega = 1 / cfg.tauMs;
    const K = omega * omega;
    const C = 2 * cfg.zeta * omega;
    const acc = K * (target - state.pos) - C * state.vel;
    state.vel += acc * dt;          // velocity first (symplectic Euler)
    state.pos += state.vel * dt;
    return state.pos;
  }

  /**
   * Advance a circular (angle) spring one timestep.
   * Uses shortest-arc error to avoid wrap-around jumps.
   * Wraps output to [0, 360).
   */
  private _stepCircular(state: FieldState, target: number, dt: number, cfg: SpringConfig): number {
    const omega = 1 / cfg.tauMs;
    const K = omega * omega;
    const C = 2 * cfg.zeta * omega;
    const error = shortestArc(state.pos, target);
    const acc = K * error - C * state.vel;
    state.vel += acc * dt;
    state.pos = wrapDeg(state.pos + state.vel * dt);
    return state.pos;
  }

  /**
   * Advance a continuous angular spring one timestep.
   * Uses shortest-arc error, but does not wrap the position. This preserves
   * full-roll continuity across ±180° for the artificial horizon.
   */
  private _stepContinuousAngle(state: FieldState, target: number, dt: number, cfg: SpringConfig): number {
    const omega = 1 / cfg.tauMs;
    const K = omega * omega;
    const C = 2 * cfg.zeta * omega;
    const error = shortestArc(state.pos, target);
    const acc = K * error - C * state.vel;
    state.vel += acc * dt;
    state.pos += state.vel * dt;
    return state.pos;
  }

  // ── SnapshotProvider implementation ──────────────────────────────────

  /** SnapshotProvider — drives all spring integrations for one rAF frame. */
  getExtrapolatedSnapshot(nowMs: number): Readonly<FlightTelemetry> {
    const target = this._inner.getExtrapolatedSnapshot
      ? this._inner.getExtrapolatedSnapshot(nowMs)
      : this._inner.getSnapshot();

    // ── First call: teleport to current target (no animation artifact at startup) ──
    if (!this._initialized) {
      this._teleportTo(target);
      this._lastNowMs = nowMs;
      this._initialized = true;
      InertiaSmoother._copyPassthrough(target, this._output);
      InertiaSmoother._writeAnimated(this, this._output);
      return this._output;
    }

    const rawDt = nowMs - this._lastNowMs;
    this._lastNowMs = nowMs;

    // Clamp dt: skip huge gaps (tab hidden, etc.) and negative drifts.
    if (rawDt <= 0 || rawDt > 500) {
      // Reset velocities on huge gaps to avoid explosion; hold position.
      if (rawDt > 500) this.resetVelocities();
      InertiaSmoother._copyPassthrough(target, this._output);
      InertiaSmoother._writeAnimated(this, this._output);
      return this._output;
    }
    const dt = rawDt;

    const att = target.attitude;
    const vel = target.velocity;
    const alt = target.altitude;
    const nav = target.navigation;
    const cfg = this._cfg;

    // ── Attitude fields ───────────────────────────────────────────────
    this._stepLinear(this._pitch, att.pitchDeg, dt, cfg.attitude);
    this._stepContinuousAngle(this._roll, att.rollDeg, dt, cfg.attitude);

    // ── Circular angle fields ─────────────────────────────────────────
    this._stepCircular(this._yaw, att.yawDeg, dt, cfg.yaw);
    this._stepCircular(this._heading, nav.headingDeg, dt, cfg.yaw);

    // ── Altitude ──────────────────────────────────────────────────────
    this._stepLinear(this._altMSL, alt.altitudeMSLm, dt, cfg.altitude);
    if (alt.altitudeAGLm !== null) {
      if (this._altAGL === null) this._altAGL = makeField(alt.altitudeAGLm);
      this._stepLinear(this._altAGL, alt.altitudeAGLm, dt, cfg.altitude);
    } else {
      this._altAGL = null;
    }

    // ── Speeds ────────────────────────────────────────────────────────
    this._stepLinear(this._groundSpeed, vel.groundSpeedMs, dt, cfg.speed);
    if (vel.airSpeedMs !== null) {
      if (this._airSpeed === null) this._airSpeed = makeField(vel.airSpeedMs);
      this._stepLinear(this._airSpeed, vel.airSpeedMs, dt, cfg.speed);
    } else {
      this._airSpeed = null;
    }
    this._stepLinear(this._climbRate, vel.verticalSpeedMs, dt, cfg.climbRate);
    this._stepLinear(this._throttle, vel.throttlePercent, dt, cfg.throttle);

    // ── Write output ──────────────────────────────────────────────────
    InertiaSmoother._copyPassthrough(target, this._output);
    InertiaSmoother._writeAnimated(this, this._output);

    return this._output;
  }

  /** SnapshotProvider fallback — calls getExtrapolatedSnapshot(performance.now()). */
  getSnapshot(): Readonly<FlightTelemetry> {
    return this.getExtrapolatedSnapshot(performance.now());
  }

  /**
   * Reset spring state — call when active drone changes or connection is lost.
   * Next frame will teleport to new target (no animation artifact).
   */
  reset(): void {
    this._initialized = false;
    this._lastNowMs = -1;
    this._altAGL = null;
    this._airSpeed = null;
    this.resetVelocities();
  }

  // ── Private helpers ────────────────────────────────────────────────────

  private _teleportTo(t: Readonly<FlightTelemetry>): void {
    this._pitch.pos = t.attitude.pitchDeg;
    this._roll.pos = t.attitude.rollDeg;
    this._yaw.pos = t.attitude.yawDeg;
    this._heading.pos = t.navigation.headingDeg;
    this._altMSL.pos = t.altitude.altitudeMSLm;
    this._altAGL = t.altitude.altitudeAGLm !== null
      ? makeField(t.altitude.altitudeAGLm) : null;
    this._groundSpeed.pos = t.velocity.groundSpeedMs;
    this._airSpeed = t.velocity.airSpeedMs !== null
      ? makeField(t.velocity.airSpeedMs) : null;
    this._climbRate.pos = t.velocity.verticalSpeedMs;
    this._throttle.pos = t.velocity.throttlePercent;
  }

  /**
   * Clear all spring velocities.
   * Useful when switching data sources to avoid carrying momentum (e.g. rotation rates)
   * from the previous source into the new transition.
   */
  public resetVelocities(): void {
    this._pitch.vel = 0;
    this._roll.vel = 0;
    this._yaw.vel = 0;
    this._heading.vel = 0;
    this._altMSL.vel = 0;
    if (this._altAGL) this._altAGL.vel = 0;
    this._groundSpeed.vel = 0;
    if (this._airSpeed) this._airSpeed.vel = 0;
    this._climbRate.vel = 0;
    this._throttle.vel = 0;
  }

  /** Copy passthrough fields (status, GPS, battery, EKF, timestamp) to output. */
  private static _copyPassthrough(src: Readonly<FlightTelemetry>, out: FlightTelemetry): void {
    out.timestamp = src.timestamp;
    out.vehicleStatus = src.vehicleStatus;
    out.gpsStatus = src.gpsStatus;
    out.battery = src.battery;
    out.ekf = src.ekf;
    out.controlSurfaces = src.controlSurfaces;
    // Pass-through rate and nav fields — only animated fields override in _writeAnimated
    out.attitude.pitchRateDegS = src.attitude.pitchRateDegS;
    out.attitude.rollRateDegS = src.attitude.rollRateDegS;
    out.attitude.yawRateDegS = src.attitude.yawRateDegS;
    out.velocity.velNorthMs = src.velocity.velNorthMs;
    out.velocity.velEastMs = src.velocity.velEastMs;
    out.velocity.velDownMs = src.velocity.velDownMs;
    out.altitude.homeAltitudeMSLm = src.altitude.homeAltitudeMSLm;
    out.navigation.latitude = src.navigation.latitude;
    out.navigation.longitude = src.navigation.longitude;
    out.navigation.courseOverGroundDeg = src.navigation.courseOverGroundDeg;
    out.navigation.currentWaypointIndex = src.navigation.currentWaypointIndex;
    out.navigation.distanceToWaypointM = src.navigation.distanceToWaypointM;
    out.navigation.bearingToWaypointDeg = src.navigation.bearingToWaypointDeg;
  }

  /** Write animated (spring-integrated) fields to output. */
  private static _writeAnimated(s: InertiaSmoother, out: FlightTelemetry): void {
    out.attitude.pitchDeg = s._pitch.pos;
    out.attitude.rollDeg = s._roll.pos;
    out.attitude.yawDeg = s._yaw.pos;
    out.navigation.headingDeg = s._heading.pos;
    out.altitude.altitudeMSLm = s._altMSL.pos;
    out.altitude.altitudeAGLm = s._altAGL ? s._altAGL.pos : null;
    out.velocity.groundSpeedMs = Math.max(0, s._groundSpeed.pos);
    out.velocity.airSpeedMs = s._airSpeed ? Math.max(0, s._airSpeed.pos) : null;
    out.velocity.verticalSpeedMs = s._climbRate.pos;
    out.velocity.throttlePercent = Math.max(0, Math.min(100, s._throttle.pos));
  }

  /** Deep clone for pre-allocated output (called once in constructor). */
  private static _deepClone(src: Readonly<FlightTelemetry>): FlightTelemetry {
    return {
      timestamp: src.timestamp,
      attitude: { ...src.attitude },
      velocity: { ...src.velocity },
      altitude: { ...src.altitude },
      navigation: { ...src.navigation },
      vehicleStatus: src.vehicleStatus,
      gpsStatus: src.gpsStatus,
      battery: src.battery,
      ekf: src.ekf,
      controlSurfaces: src.controlSurfaces,
      statusTextMessages: src.statusTextMessages,
    };
  }
}
