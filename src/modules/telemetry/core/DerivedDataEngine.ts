/**
 * DerivedDataEngine.ts
 *
 * Computes FlightDerivedData from FlightTelemetry and mission context.
 *
 * Pure function with no side effects.
 * Called from TelemetryManager and FlightHUD to keep derived navigation math
 * outside React rendering code.
 *
 * It does not depend on React, Cesium, or any UI framework.
 */

import type {
  FlightTelemetry,
  FlightDerivedData,
  Waypoint,
} from './FlightTelemetryModel';
import { haversineDistanceM, calculateBearing } from './FlightTelemetryModel';

export interface DerivedPosition {
  readonly latitude: number;
  readonly longitude: number;
}

export interface DerivedDataContext {
  /** Home position registered at arm time. */
  homePosition: { latitude: number; longitude: number; altitudeMSLm: number } | null;
  /** Active mission waypoint. */
  activeWaypoint: Waypoint | null;
  /** Estimated total battery capacity in mAh, used to compute remaining flight time. */
  batteryCapacityMah: number;
  /** Previous geographic position used for travelled-distance integration. */
  previousPosition: DerivedPosition | null;
  /** Previous derived state used for cumulative values. */
  prev: FlightDerivedData;
}

const isUsablePosition = (position: DerivedPosition): boolean =>
  Number.isFinite(position.latitude) &&
  Number.isFinite(position.longitude) &&
  (position.latitude !== 0 || position.longitude !== 0);

const integrateTravelledDistance = (
  currentTotalDistanceM: number,
  previousPosition: DerivedPosition | null,
  currentPosition: DerivedPosition,
): number => {
  if (previousPosition === null || !isUsablePosition(previousPosition) || !isUsablePosition(currentPosition)) {
    return currentTotalDistanceM;
  }

  const stepDistanceM = haversineDistanceM(
    previousPosition.latitude,
    previousPosition.longitude,
    currentPosition.latitude,
    currentPosition.longitude,
  );

  return Number.isFinite(stepDistanceM)
    ? currentTotalDistanceM + stepDistanceM
    : currentTotalDistanceM;
};

/**
 * Computes all derived values from normalized telemetry.
 *
 * @param telemetry Normalized FlightTelemetry, either smoothed or raw.
 * @param context Additional context that does not come directly from the vehicle.
 * @returns Calculated FlightDerivedData.
 */
export function computeDerivedData(
  telemetry: FlightTelemetry,
  context:   DerivedDataContext,
): FlightDerivedData {
  const { navigation, velocity, battery } = telemetry;
  const { homePosition, activeWaypoint, batteryCapacityMah, previousPosition, prev } = context;

  const lat = navigation.latitude;
  const lon = navigation.longitude;

  // ── Distancia y bearing al waypoint activo ─────────────────────────────────
  let distanceToWaypointM: number | null    = null;
  let bearingToWaypointDeg: number | null   = null;
  let etaToWaypointSec: number | null       = null;

  if (activeWaypoint && (lat !== 0 || lon !== 0)) {
    distanceToWaypointM  = haversineDistanceM(lat, lon, activeWaypoint.latitude, activeWaypoint.longitude);
    bearingToWaypointDeg = calculateBearing(lat, lon, activeWaypoint.latitude, activeWaypoint.longitude);

    const speed = velocity.groundSpeedMs;
    if (speed > 0.5) {
      etaToWaypointSec = distanceToWaypointM / speed;
    }
  }

  // ── Distancia y bearing al home ────────────────────────────────────────────
  let distanceToHomeM: number | null   = null;
  let bearingToHomeDeg: number | null  = null;

  if (homePosition && (lat !== 0 || lon !== 0)) {
    distanceToHomeM  = haversineDistanceM(lat, lon, homePosition.latitude, homePosition.longitude);
    bearingToHomeDeg = calculateBearing(lat, lon, homePosition.latitude, homePosition.longitude);
  }

  // ── Total travelled distance (position integration) ───────────────────────
  const totalDistanceTravelledM = integrateTravelledDistance(
    prev.totalDistanceTravelledM,
    previousPosition,
    { latitude: lat, longitude: lon },
  );

  // ── Tiempo de vuelo estimado restante ─────────────────────────────────────
  let estimatedFlightTimeRemainingSec: number | null = null;

  const currentA = battery.currentA;
  const remainingPercent = battery.remainingPercent;

  if (currentA !== null && currentA > 0.1 && remainingPercent !== null) {
    const remainingMah = (remainingPercent / 100) * batteryCapacityMah;
    estimatedFlightTimeRemainingSec = (remainingMah / currentA) * 3.6;  // mAh / A → segundos
  }

  return {
    distanceToWaypointM,
    bearingToWaypointDeg,
    totalDistanceTravelledM,
    smoothedClimbRateMs: prev.smoothedClimbRateMs,  // Gestionado por SmoothingEngine
    etaToWaypointSec,
    estimatedFlightTimeRemainingSec,
    homePosition,
    distanceToHomeM,
    bearingToHomeDeg,
  };
}
