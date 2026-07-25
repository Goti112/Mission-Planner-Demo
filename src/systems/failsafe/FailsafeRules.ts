/**
 * FailsafeRules.ts — Pure failsafe condition checkers
 *
 * ════════════════════════════════════════════════════════════════════════
 * FAILSAFE RULE ENGINE — Zero side-effects, purely functional
 * ════════════════════════════════════════════════════════════════════════
 *
 * Each exported function receives the current telemetry snapshot plus
 * thresholds and returns a boolean: true = condition is present.
 *
 * Rules are evaluated by FailsafeManager on every cycle (~1 Hz).
 * Priority order (highest to lowest):
 *   1. CRITICAL_BATTERY → LAND  (safety-critical, immediate)
 *   2. SIGNAL_LOST      → RTH   (critical, loss of control link)
 *   3. LOW_BATTERY      → RTH   (warning, return before critical)
 *   4. GPS_LOST         → HOVER (warning, prevent navigation errors)
 *   5. GEO_LIMIT        → RTH   (warning, geofence breach)
 *   6. ALTITUDE_LIMIT   → DESCEND (warning, regulatory compliance)
 *
 * Design constraints:
 *   • No React, no Zustand, no side-effects.
 *   • TypeScript strict, no enums (erasableSyntaxOnly).
 *   • Uses haversineDistanceM from existing FlightTelemetryModel.
 */

import { haversineDistanceM } from '../../modules/telemetry'
import type { FailsafeInput, FailsafeThresholds } from './FailsafeTypes'

// ── Individual rule checkers ───────────────────────────────────────────────────

/**
 * SIGNAL_LOST — True when the drone is airborne and the telemetry link
 * has been silent for longer than `signalTimeoutMs`, or when the link
 * is explicitly marked as disconnected.
 *
 * Ground-aware: no false positives while drone is on the ground.
 */
export function checkSignalLoss(
  input: FailsafeInput,
  thresholds: FailsafeThresholds,
): boolean {
  if (!input.isAirborne) return false
  if (!input.connected) return true
  const silentMs = Date.now() - input.lastTelemetryMs
  return silentMs > thresholds.signalTimeoutMs
}

/**
 * LOW_BATTERY — True when battery is between critical and low thresholds.
 *
 * This is intentionally mutually exclusive with CRITICAL_BATTERY;
 * if both would fire, the manager evaluates CRITICAL first and LOW
 * never fires simultaneously.
 *
 * Ground-aware: no false positives while drone is on the ground (e.g. after
 * a simulation mission ends with depleted battery sitting idle).
 */
export function checkBatteryLow(
  input: FailsafeInput,
  thresholds: FailsafeThresholds,
): boolean {
  if (!input.isAirborne) return false
  return (
    input.batteryPercent <= thresholds.batteryLowPct &&
    input.batteryPercent > thresholds.batteryCriticalPct
  )
}

/**
 * CRITICAL_BATTERY — True when battery is at or below the critical threshold.
 *
 * Triggers LAND regardless of mission state. This is the most severe
 * battery failsafe.
 *
 * Ground-aware: no false positives while drone is on the ground (e.g. after
 * a simulation mission ends with depleted battery sitting idle).
 */
export function checkBatteryCritical(
  input: FailsafeInput,
  thresholds: FailsafeThresholds,
): boolean {
  if (!input.isAirborne) return false
  return input.batteryPercent <= thresholds.batteryCriticalPct
}

/**
 * GPS_LOST — True when satellite count is below the minimum required
 * for safe autonomous flight.
 *
 * A satellite count below 6 indicates the GPS solution is unreliable
 * for position hold or waypoint navigation.
 *
 * Ground-aware: no false positive before telemetry has started (satCount=0
 * from DEFAULT_FLIGHT_TELEMETRY) or while the drone is on the ground.
 */
export function checkGpsLost(
  input: FailsafeInput,
  thresholds: FailsafeThresholds,
): boolean {
  if (!input.isAirborne) return false
  return input.satelliteCount < thresholds.gpsMinSats
}

/**
 * GEO_LIMIT — True when the drone is airborne and has exceeded the
 * configured geofence radius from its home position.
 *
 * Ground-aware: no false positive when parked at home.
 *
 * @param homeLat  Home latitude (degrees).
 * @param homeLng  Home longitude (degrees).
 */
export function checkGeoLimit(
  input: FailsafeInput,
  thresholds: FailsafeThresholds,
  homeLat: number,
  homeLng: number,
): boolean {
  if (!input.isAirborne) return false
  const distM = haversineDistanceM(input.lat, input.lng, homeLat, homeLng)
  return distM > thresholds.geoLimitM
}

/**
 * ALTITUDE_LIMIT — True when the drone is airborne and has exceeded
 * the configured maximum AGL altitude.
 *
 * Default limit of 120 m aligns with EU Regulation 2019/947 open category
 * (class A1/A2/A3 maximum operating altitude).
 */
export function checkAltitudeLimit(
  input: FailsafeInput,
  thresholds: FailsafeThresholds,
): boolean {
  return input.isAirborne && input.altitudeM > thresholds.altMaxM
}
