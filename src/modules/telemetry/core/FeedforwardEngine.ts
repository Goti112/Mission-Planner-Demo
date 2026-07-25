/**
 * FeedforwardEngine.ts
 *
 * Inspirado en el término feedforward de Betaflight:
 *   FF_output = K_FF × d(setpoint)/dt
 *
 * Aplicado al PFD: en lugar de mostrar el mismo snapshot EMA 3 veces
 * entre actualizaciones de telemetría (20 Hz → 60 Hz render),
 * extrapolamos los campos de actitud hacia delante usando su velocidad
 * de cambio estimada. El resultado se escribe in-place en un objeto
 * pre-allocado — cero asignaciones en el render path.
 *
 * Campos extrapolados: pitch, roll, yaw, heading, climbRate,
 *                      groundSpeed, airSpeed.
 * Campos NO extrapolados: altitude (siempre valor real), battery,
 *                         GPS, mode, arm state.
 *
 * Clase pura — sin React, sin DOM. Testeable de forma aislada.
 */

import type { FlightTelemetry } from './FlightTelemetryModel';

// ── Configuración ─────────────────────────────────────────────────────────

/**
 * K_FF: fracción del Δt usada para proyectar adelante.
 *   1.0 = extrapolación completa (máxima fluidez, riesgo de over-shoot leve).
 *   0.8 = conservador (recomendado para primer deploy).
 *   0.0 = sin feedforward (comportamiento original).
 *
 * Cap de proyección: nunca proyectar más allá de MAX_PREDICT_MS.
 * Después de ese umbral el instrumento mantiene el último valor EMA.
 */
export const FF_DEFAULT_GAIN    = 0.8;
export const FF_MAX_PREDICT_MS  = 120; // ms — cubre 1 ciclo de 20 Hz + margen

export interface FeedforwardConfig {
  gain:         number;   // K_FF ∈ [0, 1]
  maxPredictMs: number;   // ventana máxima de extrapolación
}

export const DEFAULT_FF_CONFIG: FeedforwardConfig = {
  gain:         FF_DEFAULT_GAIN,
  maxPredictMs: FF_MAX_PREDICT_MS,
};

// ── Motor ─────────────────────────────────────────────────────────────────

/** Velocidades de cambio estimadas para cada campo extrapolable. */
interface VelocityState {
  pitchDegPerMs:       number;
  rollDegPerMs:        number;
  yawDegPerMs:         number;   // menor arco — normalizado
  headingDegPerMs:     number;   // menor arco — normalizado
  climbRateMsPerMs:    number;
  groundSpeedMsPerMs:  number;
  airSpeedMsPerMs:     number;
  lastUpdateMs:        number;   // performance.now() de la última telemetría
  initialized:         boolean;
}

export class FeedforwardEngine {
  private readonly _cfg: FeedforwardConfig;
  private _vel: VelocityState = {
    pitchDegPerMs:      0,
    rollDegPerMs:       0,
    yawDegPerMs:        0,
    headingDegPerMs:    0,
    climbRateMsPerMs:   0,
    groundSpeedMsPerMs: 0,
    airSpeedMsPerMs:    0,
    lastUpdateMs:       0,
    initialized:        false,
  };

  private _prevSmoothed: Readonly<FlightTelemetry> | null = null;
  // ── DEBUG (remove when fixed) ────────────────────────────────────────────
  private _dbgVelCount = 0;

  constructor(config: FeedforwardConfig = DEFAULT_FF_CONFIG) {
    this._cfg = config;
  }

  /**
   * Llamar en cada actualización de telemetría (20–50 Hz).
   * Calcula la velocidad de cambio (derivada) de cada campo.
   *
   * @param smoothed  Snapshot EMA recién calculado por SmoothingEngine.
   * @param nowMs     performance.now() en el momento de la actualización.
   */
  recordSnapshot(smoothed: Readonly<FlightTelemetry>, nowMs: number): void {
    if (!this._vel.initialized) {
      // Primer frame: inicializar velocidades a cero, registrar timestamp.
      // Also store prevSmoothed so the next call can compute Δ correctly.
      this._vel.pitchDegPerMs      = 0;
      this._vel.rollDegPerMs       = 0;
      this._vel.yawDegPerMs        = 0;
      this._vel.headingDegPerMs    = 0;
      this._vel.climbRateMsPerMs   = 0;
      this._vel.groundSpeedMsPerMs = 0;
      this._vel.airSpeedMsPerMs    = 0;
      this._vel.lastUpdateMs       = nowMs;
      this._vel.initialized        = true;
      this._prevSmoothed           = smoothed;
      return;
    }

    const dt = nowMs - this._vel.lastUpdateMs;
    if (dt <= 0) return; // reloj no avanzó (duplicado o backwards)

    // ── Minimum-interval gate ──────────────────────────────────────────
    // With emitAllFrames=true the manager calls recordSnapshot for EVERY
    // message type: ATTITUDE (10 Hz), VFR_HUD (4 Hz), GLOBAL_POSITION_INT
    // (4 Hz).  When VFR_HUD or GPS arrive just 1–5 ms after an ATTITUDE
    // packet, dt is tiny but the EMA has converged slightly, so
    //
    //   vel = (EMA_residual_Δ) / (1 ms)  →  spike into the cap (1 deg/ms)
    //
    // and the FF projection then runs for the full 96 ms window at that
    // capped rate, putting the PFD up to 96° off.  The PFD either "goes
    // crazy" or appears frozen (overcorrection oscillating so fast it blurs).
    //
    // Fix: only recompute velocities when at least MIN_FF_DT_MS have elapsed
    // since the last valid estimate.  The ATTITUDE-to-ATTITUDE interval is
    // ~100 ms, which always clears this gate.  VFR_HUD / GPS packets that
    // arrive <80 ms after the last update are silently skipped: we advance
    // _prevSmoothed so the next valid call computes Δ from the latest state,
    // but leave lastUpdateMs unchanged so FF projection timing stays correct.
    const MIN_FF_DT_MS = 30; // ≥ max burst-window; ATTITUDE→ATTITUDE is ~100 ms
    if (dt < MIN_FF_DT_MS) {
      this._prevSmoothed = smoothed; // keep reference current for next valid Δ
      return;                        // lastUpdateMs intentionally NOT updated
    }

    const prev = this._prevSmoothed!;

    // ── Angular velocity cap ───────────────────────────────────────────
    // Live telemetry sources may emit attitude and navigation packets at
    // GLOBAL_POSITION_INT (10 Hz).  When VFR_HUD arrives 1-5 ms after an
    // ATTITUDE packet, dt is tiny while heading jumps from 0° (the pre-
    // connection default) to the real compass value — producing an
    // instantaneous velocity of 100-200 deg/ms.
    //
    // An EMA would carry that spike for 1-2 s, causing the compass indicator
    // to spin wildly on every connection.  Using the raw derivative and
    // capping at 1 deg/ms (1 000 deg/s) avoids this: any initialization
    // spike is absorbed by the cap, and on the very next stable ATTITUDE
    // packet the raw derivative resets to ~0 immediately — no persistence.
    //
    // 1 000 deg/s comfortably exceeds the fastest aerobatic yaw rates
    // (~720 deg/s), so legitimate manoeuvre velocities are never clipped.
    const MAX_ANG = 1.0; // deg/ms
    const ca = (v: number): number => v > MAX_ANG ? MAX_ANG : v < -MAX_ANG ? -MAX_ANG : v;

    // Velocidad lineal para campos no circulares.
    this._vel.pitchDegPerMs      = ca((smoothed.attitude.pitchDeg      - prev.attitude.pitchDeg)      / dt);
    this._vel.rollDegPerMs       = ca((smoothed.attitude.rollDeg       - prev.attitude.rollDeg)       / dt);
    this._vel.climbRateMsPerMs   =    (smoothed.velocity.verticalSpeedMs - prev.velocity.verticalSpeedMs) / dt;
    this._vel.groundSpeedMsPerMs =    (smoothed.velocity.groundSpeedMs   - prev.velocity.groundSpeedMs)   / dt;
    const prevAir = prev.velocity.airSpeedMs ?? 0;
    const currAir = smoothed.velocity.airSpeedMs ?? 0;
    this._vel.airSpeedMsPerMs    =    (currAir - prevAir) / dt;

    // Velocidad angular para campos circulares (menor arco, evita 359°→1° spin).
    this._vel.yawDegPerMs     = ca(FeedforwardEngine._angularVel(prev.attitude.yawDeg,       smoothed.attitude.yawDeg,      dt));
    this._vel.headingDegPerMs = ca(FeedforwardEngine._angularVel(prev.navigation.headingDeg, smoothed.navigation.headingDeg, dt));

    this._vel.lastUpdateMs = nowMs;
    this._prevSmoothed     = smoothed;

    // ── DEBUG LOGGING (remove when fixed) ────────────────────────────
    this._dbgVelCount++;
    if (this._dbgVelCount % 10 === 1) {
      console.log(
        `[FF.recordSnapshot] #${this._dbgVelCount}` +
        ` dt=${dt.toFixed(0)}ms` +
        ` | pitchVel=${this._vel.pitchDegPerMs.toFixed(4)} deg/ms` +
        ` rollVel=${this._vel.rollDegPerMs.toFixed(4)} deg/ms` +
        ` yawVel=${this._vel.yawDegPerMs.toFixed(4)} deg/ms`,
      );
    }
  }

  /**
   * Aplica extrapolación feedforward al snapshot pre-allocado `out`.
   * Llamar en CADA frame del rAF (60 Hz). CERO asignaciones.
   *
   * @param smoothed  Último snapshot EMA confirmado (no mutado).
   * @param out       Objeto pre-allocado que se muta in-place.
   * @param nowMs     performance.now() del frame actual.
   */
  extrapolate(
    smoothed: Readonly<FlightTelemetry>,
    out:      FlightTelemetry,
    nowMs:    number,
  ): void {
    if (!this._vel.initialized || this._cfg.gain === 0) {
      // sin datos de velocidad: copiar el snapshot EMA tal cual
      FeedforwardEngine._copyInPlace(smoothed, out);
      return;
    }

    // Δt desde la última telemetría, acotado por MAX_PREDICT_MS
    const rawDt = nowMs - this._vel.lastUpdateMs;
    const dt    = Math.min(rawDt, this._cfg.maxPredictMs) * this._cfg.gain;

    // Campos de actitud — extrapolados (menor arco para circulares)
    out.attitude.pitchDeg = smoothed.attitude.pitchDeg + this._vel.pitchDegPerMs * dt;
    out.attitude.rollDeg  = smoothed.attitude.rollDeg  + this._vel.rollDegPerMs  * dt;
    out.attitude.yawDeg   = FeedforwardEngine._wrapDeg(
      smoothed.attitude.yawDeg + this._vel.yawDegPerMs * dt,
    );
    out.navigation.headingDeg = FeedforwardEngine._wrapDeg(
      smoothed.navigation.headingDeg + this._vel.headingDegPerMs * dt,
    );

    // Campos de velocidad — extrapolados
    out.velocity.verticalSpeedMs = smoothed.velocity.verticalSpeedMs + this._vel.climbRateMsPerMs   * dt;
    out.velocity.groundSpeedMs   = Math.max(0, smoothed.velocity.groundSpeedMs + this._vel.groundSpeedMsPerMs * dt);
    out.velocity.airSpeedMs      = smoothed.velocity.airSpeedMs === null
      ? null
      : Math.max(0, smoothed.velocity.airSpeedMs + this._vel.airSpeedMsPerMs * dt);

    // Campos passthrough — siempre valor real confirmado (no extrapolado)
    out.attitude.pitchRateDegS = smoothed.attitude.pitchRateDegS;
    out.attitude.rollRateDegS  = smoothed.attitude.rollRateDegS;
    out.attitude.yawRateDegS   = smoothed.attitude.yawRateDegS;
    out.velocity.velNorthMs    = smoothed.velocity.velNorthMs;
    out.velocity.velEastMs     = smoothed.velocity.velEastMs;
    out.velocity.velDownMs     = smoothed.velocity.velDownMs;
    out.altitude               = smoothed.altitude;           // SIEMPRE REAL
    out.navigation.latitude    = smoothed.navigation.latitude;
    out.navigation.longitude   = smoothed.navigation.longitude;
    out.navigation.courseOverGroundDeg  = smoothed.navigation.courseOverGroundDeg;
    out.navigation.currentWaypointIndex = smoothed.navigation.currentWaypointIndex;
    out.navigation.distanceToWaypointM  = smoothed.navigation.distanceToWaypointM;
    out.navigation.bearingToWaypointDeg = smoothed.navigation.bearingToWaypointDeg;
    out.vehicleStatus          = smoothed.vehicleStatus;      // SIEMPRE REAL
    out.gpsStatus              = smoothed.gpsStatus;          // SIEMPRE REAL
    out.battery                = smoothed.battery;            // SIEMPRE REAL
    out.ekf                    = smoothed.ekf;                // SIEMPRE REAL
    out.controlSurfaces        = smoothed.controlSurfaces;   // SIEMPRE REAL
    out.controlSurfacesSource  = smoothed.controlSurfacesSource;
    out.statusTextMessages     = smoothed.statusTextMessages;
    out.timestamp              = smoothed.timestamp;
  }

  /**
   * Reset — llamar cuando cambia el dron activo o se pierde conexión.
   */
  reset(): void {
    this._vel.initialized = false;
    this._prevSmoothed    = null;
  }

  // ── Helpers estáticos ────────────────────────────────────────────────

  /** Normaliza ángulo a [-180, 180]. */
  private static _normDeg(a: number): number {
    let r = a % 360;
    if (r > 180)  r -= 360;
    if (r < -180) r += 360;
    return r;
  }

  /** Wrap a [0, 360). */
  private static _wrapDeg(a: number): number {
    let r = a % 360;
    if (r < 0) r += 360;
    return r;
  }

  /** Velocidad angular (deg/ms) tomando el arco mínimo. */
  private static _angularVel(prev: number, curr: number, dt: number): number {
    return FeedforwardEngine._normDeg(curr - prev) / dt;
  }

  /**
   * Copia todos los campos de `src` a `dst` in-place.
   * Usada cuando FF está deshabilitado (gain=0) — zero alloc.
   */
  private static _copyInPlace(src: Readonly<FlightTelemetry>, dst: FlightTelemetry): void {
    dst.timestamp     = src.timestamp;
    dst.attitude      = src.attitude;
    dst.velocity      = src.velocity;
    dst.altitude      = src.altitude;
    dst.navigation    = src.navigation;
    dst.vehicleStatus = src.vehicleStatus;
    dst.gpsStatus     = src.gpsStatus;
    dst.battery       = src.battery;
    dst.ekf           = src.ekf;
    dst.controlSurfaces = src.controlSurfaces;
    dst.controlSurfacesSource = src.controlSurfacesSource;
    dst.statusTextMessages = src.statusTextMessages;
  }
}
