/* ═══════════════════════════════════════════
   Drone Types — Multi-drone system
   ═══════════════════════════════════════════ */

import { DroneState } from '../core/DroneState'
import type { MissionState } from '../../mission/core/MissionState'

/** Flight mode of a drone — superset of common ArduCopter / ArduPlane / PX4 modes. */
export type DroneMode =
  | 'MANUAL'
  | 'STABILIZE'
  | 'ACRO'
  | 'ALT_HOLD'
  | 'LOITER'
  | 'AUTO'
  | 'GUIDED'
  | 'RTL'
  | 'SMART_RTL'
  | 'CIRCLE'
  | 'LAND'
  | 'DRIFT'
  | 'SPORT'
  | 'FLIP'
  | 'POSHOLD'
  | 'BRAKE'
  | 'THROW'
  | 'AVOID_ADSB'
  | 'GUIDED_NOGPS'
  | 'AUTOTUNE'
  | 'FLOWHOLD'
  | 'FOLLOW'
  | 'ZIGZAG'
  | 'SYSTEMID'
  | 'AUTOROTATE'
  | 'AUTO_RTL'
  | 'TURTLE'
  | 'RATE_ACRO'
  | 'POSITION'
  | 'MISSION'
  | 'HOLD'
  | 'OFFBOARD'
  | 'TAKEOFF'
  | 'FBWA'
  | 'FBWB'
  | 'CRUISE'
  | 'TRAINING'
  | 'INITIALISING'
  | 'QSTABILIZE'
  | 'QHOVER'
  | 'QLOITER'
  | 'QLAND'
  | 'QRTL'
  | 'QAUTOTUNE'
  | 'QACRO'
  | 'THERMAL'
  | 'LOITER2QLAND'
  | 'AUTOLAND'
  | 'UNKNOWN'

/**
 * Single drone state.
 *
 * `active` flags the drone that is currently being controlled /
 * monitored in the UI. Only ONE drone should be active at any time;
 * the store enforces this invariant.
 */
export interface Drone {
  id: string
  name: string
  lat: number
  lng: number
  /** Altitude AGL (above home for real drone, above origin for simulation), in metres. */
  altitude: number
  /**
   * Absolute altitude above Mean Sea Level (MSL) in metres.
   * Populated from GLOBAL_POSITION_INT.alt when real telemetry is available.
   * Preferred by the FPV/3D camera to avoid dependence on async terrain sampling.
   */
  altitudeMSL?: number
  battery: number
  mode: DroneMode
  /** True for the drone the operator is currently focused on */
  active: boolean
  /** Orientation — Euler angles in degrees */
  pitch: number
  roll: number
  yaw: number
  /** Current mission execution state (managed by DroneMissionController) */
  missionState?: DroneState
  /** Mission lifecycle state (managed by MissionStateController) */
  missionLifecycleState?: MissionState
  /** Airspeed in m/s */
  airspeed: number
  /** Ground speed in m/s */
  groundspeed: number
}

/** Partial update payload for a drone (id required) */
export type DroneUpdate = Partial<Omit<Drone, 'id'>> & { id: string }
