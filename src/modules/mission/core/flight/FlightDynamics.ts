/**
 * FlightDynamics.ts
 *
 * ════════════════════════════════════════════════════════════════════════
 * FLIGHT DYNAMICS — Realistic drone attitude simulation
 * ════════════════════════════════════════════════════════════════════════
 *
 * Computes smooth, physically-plausible roll, pitch, and yaw angles for
 * the drone attitude display (PFD artificial horizon, 3D model orientation,
 * telemetry panel).
 *
 * ── Roll (bank) ───────────────────────────────────────────────────────────
 *
 *   Estimated from yaw rate (turn rate) using a simplified coordinated-turn
 *   model:
 *
 *     yawRate     = yawDelta / dt                         (deg/s)
 *     targetRoll  = clamp(yawRate × rollGain, ±maxRoll)   (deg)
 *
 *   Smoothed via a clamped rate so the drone banks gradually into the turn
 *   instead of snapping instantly:
 *
 *     rollError  = targetRoll − currentRoll
 *     roll      += clamp(rollError, ±maxRollRate × dt)
 *
 * ── Pitch ────────────────────────────────────────────────────────────────
 *
 *   Estimated from the vertical speed (climb rate):
 *
 *     targetPitch = clamp(verticalSpeed × pitchGain, ±maxPitch)  (deg)
 *
 *   Also smoothed with a clamped rate:
 *
 *     pitchError  = targetPitch − currentPitch
 *     pitch      += clamp(pitchError, ±maxPitchRate × dt)
 *
 * ── Yaw ──────────────────────────────────────────────────────────────────
 *
 *   Driven entirely by the NavigationController heading output.
 *   FlightDynamics does NOT compute yaw — it just passes it through.
 *
 * ── Per-drone isolation ──────────────────────────────────────────────────
 *
 *   Each drone MUST have its own FlightDynamics instance.
 *   Internal state (_currentRoll, _currentPitch, _prevYaw) is NEVER shared.
 *
 * ── Integration points ───────────────────────────────────────────────────
 *
 *   DroneMissionController calls update() each rAF tick and passes the
 *   result to droneStateManager.pushMissionState() as rollDeg/pitchDeg.
 *
 *   This propagates through:
 *     DroneStateManager → SimulationTelemetrySource → TelemetryManager
 *     → droneStore { pitch, roll }  → Cesium attitude rendering
 *     → FlightTelemetry.attitude    → ArtificialHorizon PFD
 *
 * @author  GCS Engineering
 */

// ── Configuration ─────────────────────────────────────────────────────────────

export interface FlightDynamicsConfig {
  /**
   * Gain from yaw rate (deg/s) to target roll angle (deg).
   * targetRoll = yawRate * rollGain
   * Default: 0.8
   */
  rollGain: number;

  /**
   * Maximum roll (bank) angle in degrees.
   * Clamped after rollGain is applied.
   * Default: 35
   */
  maxRollDeg: number;

  /**
   * Maximum roll rate in degrees/second.
   * Controls how fast roll transitions to target.
   * Default: 120
   */
  maxRollRateDegPerSec: number;

  /**
   * Gain from vertical speed (m/s) to target pitch angle (deg).
   * targetPitch = verticalSpeed * pitchGain
   * Default: 3
   */
  pitchGain: number;

  /**
   * Maximum pitch angle in degrees.
   * Clamped after pitchGain is applied.
   * Default: 15
   */
  maxPitchDeg: number;

  /**
   * Maximum pitch rate in degrees/second.
   * Controls how fast pitch transitions to target.
   * Default: 60
   */
  maxPitchRateDegPerSec: number;
}

const DEFAULT_CONFIG: FlightDynamicsConfig = {
  rollGain:              0.8,
  maxRollDeg:            35,
  maxRollRateDegPerSec:  150,  // era 120 — transición de banco más reactiva
  pitchGain:             3.0,
  maxPitchDeg:           15,
  maxPitchRateDegPerSec: 80,   // era 60 — pitch responde más rápido al climb rate
};

// ── Output ────────────────────────────────────────────────────────────────────

export interface AttitudeOutput {
  /** Bank angle. Positive = right wing down (degrees). Range: [-maxRoll, +maxRoll] */
  rollDeg: number;
  /** Pitch angle. Positive = nose up (degrees). Range: [-maxPitch, +maxPitch] */
  pitchDeg: number;
  /** Heading (yaw) from NavigationController pass-through (degrees, [0, 360)). */
  yawDeg: number;
}

// ── FlightDynamics ────────────────────────────────────────────────────────────

export class FlightDynamics {
  private readonly _cfg: FlightDynamicsConfig;

  // ── Per-drone attitude state ──────────────────────────────────────────────

  /** Current smoothed roll angle (degrees). */
  private _roll: number = 0;
  /** Current smoothed pitch angle (degrees). */
  private _pitch: number = 0;
  /** Previous yaw for yaw-rate computation (degrees). */
  private _prevYaw: number;

  /**
   * Create a FlightDynamics instance for ONE drone.
   *
   * @param initialYaw  Drone heading at EN_ROUTE entry (degrees).
   * @param config      Optional overrides for default parameters.
   */
  constructor(initialYaw: number, config?: Partial<FlightDynamicsConfig>) {
    this._prevYaw = initialYaw;
    this._cfg = { ...DEFAULT_CONFIG, ...config };
  }

  // ── Public API ────────────────────────────────────────────────────────────

  /**
   * Advance attitude dynamics by one simulation tick.
   *
   * Must be called every rAF tick in EN_ROUTE when MISSION_RUNNING.
   * The caller (DroneMissionController) is responsible for gating.
   *
   * @param dt            Delta-time in seconds (capped at 100 ms upstream).
   * @param yaw           Current heading from NavigationController (degrees).
   * @param verticalSpeed Current climb rate from altitude controller (m/s).
   * @returns             Smooth attitude snapshot.
   */
  update(dt: number, yaw: number, verticalSpeed: number): AttitudeOutput {
    // ── STEP 2: Yaw rate → target roll ────────────────────────────────────
    // Unwrap yaw delta to [-180, +180] to handle wrap-around at 0°/360°.
    let yawDelta = yaw - this._prevYaw;
    while (yawDelta >  180) yawDelta -= 360;
    while (yawDelta < -180) yawDelta += 360;

    const yawRateDegS = dt > 0 ? yawDelta / dt : 0;
    this._prevYaw = yaw;

    // targetRoll = clamp(yawRate × rollGain, -maxRoll, +maxRoll)
    const targetRoll = this._clamp(
      yawRateDegS * this._cfg.rollGain,
      -this._cfg.maxRollDeg,
       this._cfg.maxRollDeg,
    );

    // ── STEP 3: Roll smoothing — max 120 deg/s rate ───────────────────────
    const rollError   = targetRoll - this._roll;
    const maxRollStep = this._cfg.maxRollRateDegPerSec * dt;
    this._roll += this._clamp(rollError, -maxRollStep, maxRollStep);

    // ── STEP 4: Vertical speed → target pitch ─────────────────────────────
    const targetPitch = this._clamp(
      verticalSpeed * this._cfg.pitchGain,
      -this._cfg.maxPitchDeg,
       this._cfg.maxPitchDeg,
    );

    // ── STEP 4 cont.: Pitch smoothing — max 60 deg/s rate ────────────────
    const pitchError   = targetPitch - this._pitch;
    const maxPitchStep = this._cfg.maxPitchRateDegPerSec * dt;
    this._pitch += this._clamp(pitchError, -maxPitchStep, maxPitchStep);

    // ── STEP 5: Yaw pass-through ──────────────────────────────────────────
    // Yaw is owned by NavigationController. We do NOT modify it.

    return {
      rollDeg:  this._roll,
      pitchDeg: this._pitch,
      yawDeg:   yaw,
    };
  }

  /**
   * Instantly reset attitude to level (roll = 0, pitch = 0).
   * Call on mission abort, completion, or when drone enters PAUSED/hover state.
   */
  reset(): void {
    this._roll  = 0;
    this._pitch = 0;
  }

  /** Read current roll without advancing time. */
  get roll(): number { return this._roll; }

  /** Read current pitch without advancing time. */
  get pitch(): number { return this._pitch; }

  // ── Utility ───────────────────────────────────────────────────────────────

  private _clamp(value: number, min: number, max: number): number {
    return value < min ? min : value > max ? max : value;
  }
}
