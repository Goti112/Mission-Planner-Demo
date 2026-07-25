/**
 * DroneTelemetry.ts
 *
 * Shared UI-facing types representing a drone's telemetry snapshot.
 *
 * Combines droneStore fields (flat drone state) and NormalizedTelemetry
 * pipeline values into a single descriptor that UI components can consume
 * without importing from multiple unrelated modules.
 *
 * NOTE: This is a read-only value object — never mutate its fields directly.
 * Update state through droneStore.updateDrone() or the TelemetryManager pipeline.
 */

import type { DroneMode } from '../modules/drone';
import type { MissionState } from '../modules/mission';

// ─────────────────────────────────────────────────────────────────────────────

/**
 * Unified telemetry snapshot for a single drone.
 *
 * Optional fields may be absent before the telemetry pipeline produces its
 * first value (e.g., before the first MAVLink or simulation tick).
 */
export interface DroneTelemetrySummary {
  // ── Identity ────────────────────────────────────────────────────────────
  droneId:   string;
  droneName: string;

  // ── Core state (from droneStore) ──────────────────────────────────────
  battery:  number;    // [0–100] %
  altitude: number;    // AGL in metres
  mode:     DroneMode;
  lat:      number;    // Decimal degrees
  lng:      number;    // Decimal degrees
  yaw:      number;    // Degrees [0–360)
  pitch:    number;    // Degrees
  roll:     number;    // Degrees

  // ── Mission lifecycle ──────────────────────────────────────────────────
  missionLifecycleState?: MissionState;

  // ── Normalized telemetry (from TelemetryManager pipeline) ─────────────
  groundSpeed?:   number;   // m/s
  verticalSpeed?: number;   // m/s
  distToWP?:      number;   // m — distance to next waypoint
  distToMAV?:     number;   // m — distance to home position
  gpsFixStatus?:  number;   // MAVLink GPS_FIX_TYPE [0–6]
  ekfHealthy?:    boolean;  // EKF estimator healthy flag

  // ── Connectivity ────────────────────────────────────────────────────────
  connected: boolean;
}
