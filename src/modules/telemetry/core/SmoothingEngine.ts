/**
 * SmoothingEngine.ts
 *
 * Motor de suavizado de telemetría para el HUD.
 *
 * Aplica filtros EMA (Exponential Moving Average) por campo.
 * Clase pura — sin React, sin DOM, sin efectos secundarios.
 *
 * Separado del render para:
 *   - Testabilidad independiente
 *   - Reemplazable (Kalman, Bézier) sin tocar instrumentos
 *   - Ajuste de α por campo desde configuración
 *
 * Nota sobre EMA circular (yaw / heading):
 *   El promedio de 355° y 5° debe ser 0°, no 180°.
 *   Se usa la técnica del error angular mínimo:
 *     Δ = normalize(nuevo - prev, [-180, 180])
 *     resultado = prev + α × Δ
 */

import type {
  FlightTelemetry,
  AttitudeTelemetry,
  VelocityTelemetry,
  NavigationTelemetry,
} from './FlightTelemetryModel';

/** Factores de suavizado por campo. α ∈ (0,1]. Mayor = más reactivo. */
export interface SmoothingConfig {
  pitch:      number;  // Recomendado: 0.35
  roll:       number;  // Recomendado: 0.35
  yaw:        number;  // Recomendado: 0.45 (circular)
  heading:    number;  // Recomendado: 0.50 (circular)
  climbRate:  number;  // Recomendado: 0.20 (VSI suave pero más reactivo)
  groundSpeed:number;  // Recomendado: 0.40
  airSpeed:   number;  // Recomendado: 0.40
  // altitud NO se suaviza — debe ser siempre el valor real
}

export const DEFAULT_SMOOTHING_CONFIG: SmoothingConfig = {
  pitch:       0.35,  // era 0.30 — subido para reducir lag aparente (~3 frames → ~2.5 frames)
  roll:        0.35,  // era 0.30 — mismo razonamiento
  yaw:         0.45,  // era 0.40 — heading más reactivo
  heading:     0.50,  // sin cambio
  climbRate:   0.20,  // era 0.15 — sigue suave para el VSI pero menos lag
  groundSpeed: 0.40,  // sin cambio
  airSpeed:    0.40,  // sin cambio
};

/**
 * Versión suavizada de FlightTelemetry.
 * Contiene solo los campos que se suavizan; el resto se pasa sin cambios.
 *
 * La altitud, GPS, batería, EKF y estado del vehículo NO se suavizan.
 */
/** Alias de FlightTelemetry con campos de actitud/velocidad ya suavizados. */
export type SmoothedTelemetry = FlightTelemetry;

export class SmoothingEngine {
  private config: SmoothingConfig;

  // Estado interno del EMA (valores previos).
  private prev: {
    pitchDeg:        number;
    rollDeg:         number;
    yawDeg:          number;
    headingDeg:      number;
    climbRateMs:     number;
    groundSpeedMs:   number;
    airSpeedMs:      number;
    initialized:     boolean;
  };

  constructor(config: SmoothingConfig = DEFAULT_SMOOTHING_CONFIG) {
    this.config = config;
    this.prev = {
      pitchDeg:      0,
      rollDeg:       0,
      yawDeg:        0,
      headingDeg:    0,
      climbRateMs:   0,
      groundSpeedMs: 0,
      airSpeedMs:    0,
      initialized:   false,
    };
  }

  /**
   * Aplica suavizado a la telemetría raw y devuelve una copia suavizada.
   * Debe llamarse en cada frame del rAF loop.
   *
   * @param raw   FlightTelemetry directamente del store (no mutada).
   * @returns     FlightTelemetry con campos de actitud y velocidad suavizados.
   */
  update(raw: FlightTelemetry): SmoothedTelemetry {
    // En el primer frame, inicializar con los valores actuales (evita arranque brusco).
    if (!this.prev.initialized) {
      this.prev.pitchDeg      = raw.attitude.pitchDeg;
      this.prev.rollDeg       = raw.attitude.rollDeg;
      this.prev.yawDeg        = raw.attitude.yawDeg;
      this.prev.headingDeg    = raw.navigation.headingDeg;
      this.prev.climbRateMs   = raw.velocity.verticalSpeedMs;
      this.prev.groundSpeedMs = raw.velocity.groundSpeedMs;
      this.prev.airSpeedMs    = raw.velocity.airSpeedMs ?? 0;
      this.prev.initialized   = true;
    }

    // Aplicar EMA lineal a campos no circulares.
    const pitchDeg      = this.ema(this.prev.pitchDeg,      raw.attitude.pitchDeg,        this.config.pitch);
    const rollDeg       = this.ema(this.prev.rollDeg,       raw.attitude.rollDeg,          this.config.roll);
    const climbRateMs   = this.ema(this.prev.climbRateMs,   raw.velocity.verticalSpeedMs,  this.config.climbRate);
    const groundSpeedMs = this.ema(this.prev.groundSpeedMs, raw.velocity.groundSpeedMs,    this.config.groundSpeed);
    const airSpeedMs    = this.ema(this.prev.airSpeedMs,    raw.velocity.airSpeedMs ?? 0,  this.config.airSpeed);

    // EMA circular para yaw y heading.
    const yawDeg     = this.emaCircular(this.prev.yawDeg,     raw.attitude.yawDeg,      this.config.yaw);
    const headingDeg = this.emaCircular(this.prev.headingDeg, raw.navigation.headingDeg, this.config.heading);

    // Persistir para el siguiente frame.
    this.prev.pitchDeg      = pitchDeg;
    this.prev.rollDeg       = rollDeg;
    this.prev.yawDeg        = yawDeg;
    this.prev.headingDeg    = headingDeg;
    this.prev.climbRateMs   = climbRateMs;
    this.prev.groundSpeedMs = groundSpeedMs;
    this.prev.airSpeedMs    = airSpeedMs;

    // Construir la telemetría suavizada. Spread del raw para no mutar el original.
    return {
      ...raw,
      attitude: {
        ...raw.attitude,
        pitchDeg,
        rollDeg,
        yawDeg,
      } as AttitudeTelemetry,
      velocity: {
        ...raw.velocity,
        verticalSpeedMs: climbRateMs,
        groundSpeedMs,
        airSpeedMs: raw.velocity.airSpeedMs !== null ? airSpeedMs : null,
      } as VelocityTelemetry,
      navigation: {
        ...raw.navigation,
        headingDeg,
      } as NavigationTelemetry,
    };
  }

  /** Resetea el estado interno (útil al cambiar de vehículo). */
  reset(): void {
    this.prev.initialized = false;
  }

  /** Actualiza la configuración de α en tiempo de ejecución. */
  setConfig(config: Partial<SmoothingConfig>): void {
    this.config = { ...this.config, ...config };
  }

  // ── Helpers privados ──────────────────────────────────────────────

  /** EMA lineal estándar. */
  private ema(prev: number, current: number, alpha: number): number {
    return alpha * current + (1 - alpha) * prev;
  }

  /**
   * EMA circular para ángulos [0, 360).
   * Evita el salto 359° → 0° al promediar.
   */
  private emaCircular(prev: number, current: number, alpha: number): number {
    let delta = current - prev;
    // Normalizar delta a [-180, 180].
    if (delta >  180) delta -= 360;
    if (delta < -180) delta += 360;
    let result = prev + alpha * delta;
    // Mantener en [0, 360).
    if (result <   0) result += 360;
    if (result >= 360) result -= 360;
    return result;
  }
}
