/**
 * DroneHealthMonitor.ts — Drone Health Analysis Engine
 *
 * Pure, synchronous module.  Takes a snapshot of drone state + telemetry
 * data and produces a normalized DroneHealthStatus ready for display.
 *
 * No React, no side effects, no subscriptions — purely functional.
 *
 * ── Health thresholds ───────────────────────────────────────────────────
 *
 *   BATTERY   good > 50%  |  warning 20–50%  |  critical < 20%
 *   GPS       good ≥ 10 sats  |  warning 7–9  |  critical < 7
 *             (when satellite count unavailable, derived from GPSFixType)
 *   LINK      good ≥ 70%  |  warning 40–69%  |  critical < 40%
 *             (simulated from connection state + normTelemetry)
 *   IMU       good = EKF healthy + finite pitch/roll
 *             critical = EKF degraded/bad OR NaN attitude
 *   MISSION   MissionLifecycleState label string pass-through
 */

import { GPSFixType } from '../../../telemetry';
import type { NormalizedTelemetry } from '../../../telemetry';
import { MISSION_STATE_LABELS } from '../../../mission';
import type { MissionState as MissionStateType } from '../../../mission';

// ─────────────────────────────────────────────────────────────────────────────
// Public types
// ─────────────────────────────────────────────────────────────────────────────

export type HealthStatus = 'good' | 'warning' | 'critical' | 'unknown';

export interface BatteryHealth {
  value: number;        // percent [0–100]
  status: HealthStatus;
}

export interface GPSHealth {
  sats: number;         // satellite count (estimated when not available)
  fixLabel: string;     // human-readable fix type e.g. "3D FIX", "NO FIX"
  status: HealthStatus;
}

export interface LinkHealth {
  quality: number;      // percent [0–100]
  label: string;        // "ONLINE" | "OFFLINE" | "DEGRADADO"
  status: HealthStatus;
}

export interface IMUHealth {
  label: string;        // "OK" | "EKF DEGRADADO" | "FALLO"
  status: HealthStatus;
}

export interface MissionHealth {
  state: string;        // Label from MISSION_STATE_LABELS
}

export interface DroneHealthStatus {
  battery: BatteryHealth;
  gps:     GPSHealth;
  link:    LinkHealth;
  imu:     IMUHealth;
  mission: MissionHealth;
}

// ─────────────────────────────────────────────────────────────────────────────
// Input
// ─────────────────────────────────────────────────────────────────────────────

export interface HealthInput {
  /** Battery charge percent [0–100].  Source: droneStore. */
  batteryPercent: number;
  /** GPS fix type from NormalizedTelemetry.gpsFixStatus. */
  gpsFixType: number;
  /**
   * Raw satellite count when available (from FlightTelemetry.gpsStatus).
   * Pass -1 when not available — will be estimated from gpsFixType.
   */
  satellitesVisible: number;
  /** True when MAVLink / simulation heartbeat is active. */
  connected: boolean;
  /** EKF health flag from NormalizedTelemetry. */
  ekfHealthy: boolean;
  /** Drone pitch in degrees — NaN treated as IMU failure. */
  pitchDeg: number;
  /** Drone roll in degrees — NaN treated as IMU failure. */
  rollDeg: number;
  /** Current mission lifecycle state. */
  missionLifecycleState: MissionStateType;
}

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const BAT_GOOD     = 50;  // % — above this → good
const BAT_WARN     = 20;  // % — above this (and ≤ good) → warning; below → critical

const GPS_GOOD     = 10;  // sats — ≥ this → good
const GPS_WARN     = 7;   // sats — ≥ this (and < good) → warning; below → critical

const LINK_GOOD    = 70;  // % — ≥ this → good
const LINK_WARN    = 40;  // % — ≥ this (and < good) → warning; below → critical

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function batteryStatus(pct: number): HealthStatus {
  if (pct > BAT_GOOD) return 'good';
  if (pct > BAT_WARN) return 'warning';
  return 'critical';
}

/**
 * Maps GPSFixType to an approximate satellite count when none is reported.
 * Used as fallback so the health model is always informative.
 */
function estimateSatellites(fixType: number): number {
  switch (fixType) {
    case GPSFixType.NO_GPS:    return 0;
    case GPSFixType.NO_FIX:    return 2;
    case GPSFixType.FIX_2D:    return 5;
    case GPSFixType.FIX_3D:    return 9;
    case GPSFixType.DGPS:      return 11;
    case GPSFixType.RTK_FLOAT: return 13;
    case GPSFixType.RTK_FIXED: return 15;
    default:                   return 0;
  }
}

function gpsFixLabel(fixType: number): string {
  switch (fixType) {
    case GPSFixType.NO_GPS:    return 'SIN GPS';
    case GPSFixType.NO_FIX:    return 'SIN FIX';
    case GPSFixType.FIX_2D:    return 'FIX 2D';
    case GPSFixType.FIX_3D:    return 'FIX 3D';
    case GPSFixType.DGPS:      return 'DGPS';
    case GPSFixType.RTK_FLOAT: return 'RTK FLOAT';
    case GPSFixType.RTK_FIXED: return 'RTK FIJO';
    case GPSFixType.STATIC:    return 'ESTÁTICO';
    case GPSFixType.PPP:       return 'PPP';
    default:                   return 'DESCONOCIDO';
  }
}

function gpsStatus(sats: number): HealthStatus {
  if (sats >= GPS_GOOD) return 'good';
  if (sats >= GPS_WARN) return 'warning';
  return 'critical';
}

function linkQuality(connected: boolean): number {
  // In this simulation environment RSSI is not available.
  // Derive a synthetic quality value:
  //   connected  → simulate strong link (90%)
  //   !connected → 0%
  return connected ? 90 : 0;
}

function linkStatus(quality: number): HealthStatus {
  if (quality >= LINK_GOOD) return 'good';
  if (quality >= LINK_WARN) return 'warning';
  return 'critical';
}

function linkLabel(quality: number): string {
  if (quality >= LINK_GOOD) return 'ONLINE';
  if (quality >= LINK_WARN) return 'DEGRADADO';
  return 'OFFLINE';
}

function imuAnalysis(ekfHealthy: boolean, pitchDeg: number, rollDeg: number): IMUHealth {
  const attitudeInvalid = !isFinite(pitchDeg) || !isFinite(rollDeg);
  if (!ekfHealthy || attitudeInvalid) {
    return { label: 'FALLO', status: 'critical' };
  }
  return { label: 'OK', status: 'good' };
}

// ─────────────────────────────────────────────────────────────────────────────
// Main export
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Computes a full DroneHealthStatus from raw drone + telemetry data.
 * Call on every render — pure, zero side-effects, sub-millisecond.
 */
export function computeHealth(input: HealthInput): DroneHealthStatus {
  // ── Battery ──────────────────────────────────────────────────────────
  const bat: BatteryHealth = {
    value:  input.batteryPercent,
    status: batteryStatus(input.batteryPercent),
  };

  // ── GPS ──────────────────────────────────────────────────────────────
  const sats = input.satellitesVisible >= 0
    ? input.satellitesVisible
    : estimateSatellites(input.gpsFixType);

  const gps: GPSHealth = {
    sats,
    fixLabel: gpsFixLabel(input.gpsFixType),
    status:   gpsStatus(sats),
  };

  // ── Link ─────────────────────────────────────────────────────────────
  const quality = linkQuality(input.connected);
  const link: LinkHealth = {
    quality,
    label:  linkLabel(quality),
    status: linkStatus(quality),
  };

  // ── IMU ──────────────────────────────────────────────────────────────
  const imu = imuAnalysis(input.ekfHealthy, input.pitchDeg, input.rollDeg);

  // ── Mission ──────────────────────────────────────────────────────────
  const mission: MissionHealth = {
    state: MISSION_STATE_LABELS[input.missionLifecycleState] ?? input.missionLifecycleState,
  };

  return { battery: bat, gps, link, imu, mission };
}

/**
 * Convenience: builds a HealthInput from the data available to UI components.
 *
 * @param batteryPercent  From droneStore drone.battery
 * @param normTelemetry   From useDroneTelemetry hook (null when no drone selected)
 * @param pitchDeg        From droneStore drone.pitch
 * @param rollDeg         From droneStore drone.roll
 * @param missionState    From droneStore drone.missionLifecycleState
 * @param satellitesVisible  From FlightTelemetry snapshot (-1 = unavailable)
 */
export function buildHealthInput(
  batteryPercent:     number,
  normTelemetry:      NormalizedTelemetry | null,
  pitchDeg:           number,
  rollDeg:            number,
  missionState:       MissionStateType,
  satellitesVisible:  number = -1,
): HealthInput {
  return {
    batteryPercent,
    gpsFixType:         normTelemetry?.gpsFixStatus    ?? GPSFixType.NO_GPS,
    satellitesVisible,
    connected:          normTelemetry?.connected       ?? false,
    ekfHealthy:         normTelemetry?.ekfHealthy      ?? false,
    pitchDeg,
    rollDeg,
    missionLifecycleState: missionState,
  };
}
