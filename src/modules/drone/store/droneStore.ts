import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Drone, DroneMode } from '../types/drone'
import { DroneState } from '../core/DroneState'
import { MissionState } from '../../mission/core/MissionState'

export type { Drone, DroneMode }

interface DroneStoreState {
  drones: Record<string, Drone>
  addDrone: (drone: Drone) => void
  removeDrone: (id: string) => void
  updateDrone: (id: string, patch: Partial<Drone>) => void
  setActiveDrone: (id: string) => void
  /**
   * @deprecated Placeholder — not connected to any controller.
   * Future versions should route through DroneMissionController.
   */
  sendCommand: (
    id: string,
    command: 'takeoff' | 'land' | 'return' | 'changeMode',
    mode?: DroneMode
  ) => void
}

/* Default drone — seed data for simulation.
   Always starts grounded at central Madrid (40.4168, -3.7038).
   Not persisted: simulation positions are volatile and must always
   reset to home on every app load to avoid stale-coordinates bugs. */
const DEFAULT_DRONES: Drone[] = [
  {
    id: 'drone-1',
    name: 'AllDrone 440-A',
    active: true,
    lat: 40.4168,
    lng: -3.7038,
    altitude: 0,
    yaw: 0,
    pitch: 0,
    roll: 0,
    battery: 100,
    airspeed: 0,
    groundspeed: 0,
    mode: 'MANUAL',
    missionState: DroneState.IDLE,
    missionLifecycleState: MissionState.IDLE,
  },
]

function buildRecord(drones: Drone[]): Record<string, Drone> {
  const rec: Record<string, Drone> = {}
  for (const d of drones) rec[d.id] = d
  return rec
}

function sanitizePersistedDrones(persisted: Record<string, Drone>): Record<string, Drone> {
  const defaults = buildRecord(DEFAULT_DRONES)
  const normalized: Record<string, Drone> = { ...persisted }

  // Guarantee baseline simulation fleet after browser reloads.
  for (const base of DEFAULT_DRONES) {
    const persistedDrone = normalized[base.id]
    if (!persistedDrone) {
      normalized[base.id] = { ...base }
      continue
    }

    // Keep runtime telemetry fields, but enforce deterministic spawn/home
    // coordinates for the built-in simulation drones.
    normalized[base.id] = {
      ...persistedDrone,
      id: base.id,
      name: base.name,
      lat: base.lat,
      lng: base.lng,
      altitude: Number.isFinite(persistedDrone.altitude) ? persistedDrone.altitude : base.altitude,
    }
  }

  // Ensure a single active drone.
  const activeIds = Object.values(normalized)
    .filter((drone) => drone.active)
    .map((drone) => drone.id)

  if (activeIds.length === 0) {
    if (normalized['drone-1']) normalized['drone-1'] = { ...normalized['drone-1'], active: true }
  } else if (activeIds.length > 1) {
    const winner = activeIds[0]
    for (const id of Object.keys(normalized)) {
      normalized[id] = { ...normalized[id], active: id === winner }
    }
  }

  // Drop corrupted entries that may appear from stale/cross-version persistence.
  for (const [id, drone] of Object.entries(normalized)) {
    const hasFiniteCoords = Number.isFinite(drone.lat) && Number.isFinite(drone.lng)
    if (!hasFiniteCoords) {
      const fallback = defaults[id]
      if (fallback) normalized[id] = { ...fallback, active: drone.active }
      else delete normalized[id]
    }
  }

  return normalized
}

export const useDroneStore = create<DroneStoreState>()(
  persist(
    (set, get) => ({
    drones: buildRecord(DEFAULT_DRONES),

    addDrone: (drone) =>
      set((s) => ({ drones: { ...s.drones, [drone.id]: drone } })),

    removeDrone: (id) =>
      set((s) => {
        const rest = { ...s.drones }
        delete rest[id]
        return { drones: rest }
      }),

    updateDrone: (id, patch) =>
      set((s) => {
        const existing = s.drones[id]
        if (!existing) return s
        return { drones: { ...s.drones, [id]: { ...existing, ...patch } } }
      }),

    setActiveDrone: (id) =>
      set((s) => {
        const updated: Record<string, Drone> = {}
        for (const [did, drone] of Object.entries(s.drones)) {
          updated[did] = { ...drone, active: did === id }
        }
        return { drones: updated }
      }),

      sendCommand: (id, command, mode) => {
        if (command === 'takeoff') get().updateDrone(id, { mode: 'AUTO', altitude: 10 })
        else if (command === 'land') get().updateDrone(id, { mode: 'LAND', altitude: 0 })
        else if (command === 'return') get().updateDrone(id, { mode: 'RTL' })
        else if (command === 'changeMode' && mode) get().updateDrone(id, { mode })
      },
    }),
    {
      name: 'gcs-drones',
      onRehydrateStorage: () => (state) => {
        if (!state) return
        state.drones = sanitizePersistedDrones(state.drones)
      },
    }
  )
)
