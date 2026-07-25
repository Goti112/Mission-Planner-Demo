/**
 * MissionValidator.ts — Pre-flight Mission Safety Validation
 *
 * Runs a set of safety checks before allowing a mission to start.
 * Pure, synchronous, side-effect-free validation logic.
 *
 * Consumers:
 *   - PlanRoute.tsx intercepts handleStartMission and calls validateMission()
 *     before delegating to DroneMissionController.startMission()
 *
 * Rules summary:
 *   ERRORS  (block mission start):
 *     • < 2 waypoints
 *     • Invalid waypoint coordinates (NaN / out of range)
 *     • Waypoint altitude outside [10, 500] m
 *     • Battery < 20 %
 *     • No GPS fix (in connected mode)
 *     • Consecutive waypoints < 2 m apart
 *
 *   WARNINGS (allow start after confirmation):
 *     • Battery 20–30 %
 *     • Consecutive waypoints > 2 000 m apart
 *     • Altitude delta > 80 m between consecutive waypoints
 *     • First waypoint altitude lower than current drone altitude
 */

import { haversineDistanceM } from '../../telemetry';
import type { Mission } from '../../../types/mission';

// ─────────────────────────────────────────────────────────────────────────────
// Public types
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Contextual drone state passed from the UI layer into the validator.
 * Callers should supply the best available data; fallbacks are documented.
 */
export interface DroneValidationContext {
  /** Battery charge in percent [0–100]. Source: droneStore or telemetry snapshot. */
  batteryPercent: number;
  /**
   * True when the drone has a sufficient GPS fix (>= 3-D fix).
   * Defaults to true in simulation mode (no hardware GPS).
   */
  hasGpsFix: boolean;
  /** Current drone position — used for first-waypoint altitude check. */
  currentLat: number;
  currentLng: number;
  currentAltitude: number;
}

/**
 * Result returned by validateMission().
 *
 * `isValid` — false only when there are hard errors that prevent a safe flight.
 * A result with warnings but no errors has `isValid: true`.
 */
export interface ValidationResult {
  /** False when one or more errors are present. */
  isValid: boolean;
  /** Critical issues that must be fixed before the mission can start. */
  errors: string[];
  /** Non-critical issues; the operator should review them before proceeding. */
  warnings: string[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Validation constants
// ─────────────────────────────────────────────────────────────────────────────

const MIN_WAYPOINTS            = 2;
const MIN_ALTITUDE_M           = 10;
const MAX_ALTITUDE_M           = 5000;
const MAX_ALT_DELTA_M          = 80;   // consecutive wp altitude delta warning
const BATTERY_ERROR_THRESHOLD  = 20;   // % — hard error below this
const BATTERY_WARN_THRESHOLD   = 30;   // % — warning below this
const MIN_WP_SPACING_M         = 2;    // m  — too close: likely a duplicate
const MAX_WP_SPACING_M         = 2000; // m  — very long leg: warn operator

// ─────────────────────────────────────────────────────────────────────────────
// Core function
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Validates a mission against a set of pre-flight safety rules.
 *
 * @param mission  The mission object from missionStore.
 * @param ctx      Real-time drone state from the UI layer.
 * @returns        A ValidationResult with errors, warnings, and an isValid flag.
 */
export function validateMission(
  mission: Mission,
  ctx: DroneValidationContext,
): ValidationResult {
  const errors:   string[] = [];
  const warnings: string[] = [];

  const { waypoints } = mission;

  // ── Rule 1: Minimum waypoint count ──────────────────────────────────────
  if (waypoints.length < MIN_WAYPOINTS) {
    errors.push(
      `La misión necesita al menos ${MIN_WAYPOINTS} waypoints (tiene ${waypoints.length}).`,
    );
  }

  // ── Rule 2 & 3: Per-waypoint coordinate and altitude checks ──────────────
  waypoints.forEach((wp, i) => {
    const label = `Waypoint ${i + 1}`;

    // Coordinate validity
    if (
      !isFinite(wp.lat) || wp.lat < -90  || wp.lat > 90 ||
      !isFinite(wp.lng) || wp.lng < -180 || wp.lng > 180
    ) {
      errors.push(`${label} tiene coordenadas inválidas (lat=${wp.lat}, lng=${wp.lng}).`);
    }

    // Altitude range
    if (!isFinite(wp.altitude) || wp.altitude < MIN_ALTITUDE_M || wp.altitude > MAX_ALTITUDE_M) {
      errors.push(
        `${label} tiene una altitud fuera del rango permitido [${MIN_ALTITUDE_M}–${MAX_ALTITUDE_M} m]: ${wp.altitude} m.`,
      );
    }
  });

  // ── Rule 4: Consecutive waypoint spacing and altitude delta ──────────────
  for (let i = 0; i < waypoints.length - 1; i++) {
    const a = waypoints[i];
    const b = waypoints[i + 1];

    // Only check spacing if both coordinates are valid
    if (
      isFinite(a.lat) && isFinite(a.lng) &&
      isFinite(b.lat) && isFinite(b.lng)
    ) {
      const distM = haversineDistanceM(a.lat, a.lng, b.lat, b.lng);

      if (distM < MIN_WP_SPACING_M) {
        errors.push(
          `Waypoints ${i + 1} y ${i + 2} están a ${distM.toFixed(1)} m de distancia — demasiado cercanos (mínimo ${MIN_WP_SPACING_M} m).`,
        );
      } else if (distM > MAX_WP_SPACING_M) {
        warnings.push(
          `Waypoints ${i + 1} y ${i + 2} están a ${(distM / 1000).toFixed(1)} km — tramo muy largo, considera añadir puntos intermedios.`,
        );
      }
    }

    // Altitude delta between consecutive waypoints
    if (isFinite(a.altitude) && isFinite(b.altitude)) {
      const altDelta = Math.abs(b.altitude - a.altitude);
      if (altDelta > MAX_ALT_DELTA_M) {
        warnings.push(
          `Cambio brusco de altitud entre waypoints ${i + 1} y ${i + 2}: ${altDelta.toFixed(0)} m (recomendado < ${MAX_ALT_DELTA_M} m).`,
        );
      }
    }
  }

  // ── Rule 5: Battery level ─────────────────────────────────────────────────
  if (ctx.batteryPercent < BATTERY_ERROR_THRESHOLD) {
    errors.push(
      `Batería crítica: ${ctx.batteryPercent.toFixed(0)} %. Requiere al menos ${BATTERY_ERROR_THRESHOLD} % para iniciar una misión.`,
    );
  } else if (ctx.batteryPercent < BATTERY_WARN_THRESHOLD) {
    warnings.push(
      `Batería baja: ${ctx.batteryPercent.toFixed(0)} %. Se recomienda recargar antes del vuelo.`,
    );
  }

  // ── Rule 6: GPS fix ────────────────────────────────────────────────────────
  if (!ctx.hasGpsFix) {
    errors.push(
      'GPS no disponible o sin fix 3-D. No es seguro iniciar la misión.',
    );
  }

  // ── Rule 7: First waypoint altitude vs. drone current altitude ─────────────
  if (waypoints.length > 0 && isFinite(waypoints[0].altitude)) {
    if (waypoints[0].altitude < ctx.currentAltitude) {
      warnings.push(
        `El primer waypoint (${waypoints[0].altitude} m) está por debajo de la altitud actual del dron (${ctx.currentAltitude.toFixed(0)} m).`,
      );
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
  };
}
