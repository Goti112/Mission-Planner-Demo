/* ═══════════════════════════════════════════════════════════════
   DroneEntity — Engine-agnostic representation of a single drone
   ═══════════════════════════════════════════════════════════════

   Each DroneEntity wraps a drone's runtime data without importing
   rendering engine types.

   Usage:
     const entity = new DroneEntity(droneFromStore, modelUrl, defaultSpeed)
     entity.setState(DroneState.TAKING_OFF)
     entity.syncFromStore(updatedDrone) // pull latest position
   ═══════════════════════════════════════════════════════════════ */

import { DroneState } from './DroneState'
import type { Drone } from '../types/drone'

export interface DronePosition {
  lat: number
  lng: number
  altitude: number
}

export interface DroneOrientation {
  pitch: number
  roll: number
  yaw: number
}

export class DroneEntity {
  readonly id: string
  readonly name: string
  readonly modelUrl: string

  private _state: DroneState = DroneState.IDLE
  private _position: DronePosition
  private _orientation: DroneOrientation

  /** Configurable cruise speed in m/s (overridable per mission/waypoint) */
  speed: number

  constructor(drone: Drone, modelUrl: string, defaultSpeed: number) {
    this.id = drone.id
    this.name = drone.name
    this.modelUrl = modelUrl
    this.speed = defaultSpeed
    this._position = { lat: drone.lat, lng: drone.lng, altitude: drone.altitude }
    this._orientation = { pitch: drone.pitch, roll: drone.roll, yaw: drone.yaw }
  }

  /* ── Getters ──
     Return the internal object directly for zero-allocation reads.
     Callers MUST NOT mutate the returned object. */

  get state(): DroneState {
    return this._state
  }

  get position(): Readonly<DronePosition> {
    return this._position
  }

  get orientation(): Readonly<DroneOrientation> {
    return this._orientation
  }

  /* ── Mutators ── */

  setState(state: DroneState): void {
    this._state = state
  }

  updatePosition(lat: number, lng: number, altitude: number): void {
    this._position = { lat, lng, altitude }
  }

  updateOrientation(pitch: number, roll: number, yaw: number): void {
    this._orientation = { pitch, roll, yaw }
  }

  /**
   * Pull latest position & orientation from a Zustand drone record.
   * Called every tick / frame to keep the entity in sync with the store.
   */
  syncFromStore(drone: Drone): void {
    this._position = { lat: drone.lat, lng: drone.lng, altitude: drone.altitude }
    this._orientation = { pitch: drone.pitch, roll: drone.roll, yaw: drone.yaw }
  }
}
