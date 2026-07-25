/**
 * FailsafeTypes.ts — Type definitions for the Fail-Safe System
 *
 * ════════════════════════════════════════════════════════════════════════
 * FAILSAFE SYSTEM — Similar to PX4 / ArduPilot failsafe architecture
 * ════════════════════════════════════════════════════════════════════════
 *
 * Defines:
 *   FailsafeLevel     — severity of the condition (warning / critical)
 *   FailsafeAction    — automated response (RTH / LAND / HOVER / DESCEND)
 *   FailsafeCondition — what triggered the failsafe
 *   FailsafeEvent     — a single failsafe record (active or resolved)
 *   FailsafeInput     — telemetry snapshot evaluated each cycle
 *   FailsafeThresholds — configurable trigger thresholds
 *
 * Zero dependencies — pure type declarations.
 */

// ── Level ─────────────────────────────────────────────────────────────────────

/** Severity of a failsafe condition. */
export type FailsafeLevel = 'warning' | 'critical'

// ── Action ────────────────────────────────────────────────────────────────────

/**
 * Automated action triggered when a failsafe fires.
 *
 * RTH     — Abort mission and return to home (RTL mode).
 * LAND    — Abort mission and land at current position immediately.
 * HOVER   — Pause mission and hold position (LOITER mode).
 * DESCEND — Reduce altitude to safe limit without aborting mission.
 */
export type FailsafeAction = 'RTH' | 'LAND' | 'HOVER' | 'DESCEND'

// ── Condition ────────────────────────────────────────────────────────────────

/**
 * The triggering condition that caused the failsafe.
 *
 * SIGNAL_LOST       — Telemetry link timeout / no heartbeat.
 * LOW_BATTERY       — Battery below warning threshold (default 20 %).
 * CRITICAL_BATTERY  — Battery below critical threshold (default 10 %).
 * GPS_LOST          — Satellite count below minimum (default 6).
 * GEO_LIMIT         — Drone has exceeded geofence radius from home.
 * ALTITUDE_LIMIT    — Drone has exceeded maximum altitude AGL.
 */
export type FailsafeCondition =
  | 'SIGNAL_LOST'
  | 'LOW_BATTERY'
  | 'CRITICAL_BATTERY'
  | 'GPS_LOST'
  | 'GEO_LIMIT'
  | 'ALTITUDE_LIMIT'

// ── Event ─────────────────────────────────────────────────────────────────────

/** A single failsafe event — may be active or resolved. */
export interface FailsafeEvent {
  /** Unique event identifier. */
  id: string
  /** ID of the drone that triggered the failsafe. */
  droneId: string
  /** What condition caused the failsafe. */
  condition: FailsafeCondition
  /** Severity level. */
  level: FailsafeLevel
  /** The automated action taken. */
  action: FailsafeAction
  /** Human-readable description for the operator. */
  message: string
  /** Unix ms when the failsafe was triggered. */
  triggeredAt: number
  /** Unix ms when the condition cleared (undefined while still active). */
  resolvedAt?: number
  /** True while the condition is still present. */
  active: boolean
}

// ── Input ─────────────────────────────────────────────────────────────────────

/**
 * Telemetry snapshot provided to FailsafeManager.evaluate() on each cycle.
 *
 * Built by useFailsafeMonitor from droneStore + DroneStateManager.
 * All values must be concrete numbers (no undefined / NaN).
 */
export interface FailsafeInput {
  /** ID of the drone being evaluated. */
  droneId: string
  /** Battery charge percent [0–100]. */
  batteryPercent: number
  /** Number of GPS satellites visible. */
  satelliteCount: number
  /** Current altitude AGL in metres. */
  altitudeM: number
  /** Current latitude in decimal degrees. */
  lat: number
  /** Current longitude in decimal degrees. */
  lng: number
  /**
   * True when the telemetry link is considered alive.
   * In simulation: always true unless simulateSignalLoss is set.
   * In real MAVLink: based on connection store status.
   */
  connected: boolean
  /**
   * Unix ms of the last received telemetry position update.
   * Used as secondary signal-loss check.
   */
  lastTelemetryMs: number
  /**
   * True when the drone is actively airborne.
   * Used to suppress failsafes that are irrelevant on the ground
   * (e.g. GEO_LIMIT, SIGNAL_LOST, ALTITUDE_LIMIT).
   */
  isAirborne: boolean
}

// ── Thresholds ────────────────────────────────────────────────────────────────

/** Configurable trigger thresholds for each failsafe rule. */
export interface FailsafeThresholds {
  /** Battery % at or below which LOW_BATTERY fires. Default: 20. */
  batteryLowPct: number
  /** Battery % at or below which CRITICAL_BATTERY fires. Default: 10. */
  batteryCriticalPct: number
  /** Satellite count below which GPS_LOST fires. Default: 6. */
  gpsMinSats: number
  /**
   * Maximum AGL altitude in metres above which ALTITUDE_LIMIT fires.
   * Default: 120 (EU regulatory limit for non-commercial sUAS).
   */
  altMaxM: number
  /**
   * Maximum distance from home in metres above which GEO_LIMIT fires.
   * Default: 5000.
   */
  geoLimitM: number
  /**
   * Telemetry silence duration in ms after which SIGNAL_LOST fires.
   * Default: 5000 (5 seconds).
   */
  signalTimeoutMs: number
}

/** Default thresholds matching standard ArduPilot/PX4 recommendations. */
export const DEFAULT_THRESHOLDS: FailsafeThresholds = {
  batteryLowPct:      20,
  batteryCriticalPct: 10,
  gpsMinSats:         6,
  altMaxM:            120,
  geoLimitM:          5000,
  signalTimeoutMs:    5000,
}
