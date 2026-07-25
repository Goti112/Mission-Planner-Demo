/* ═══════════════════════════════════════════════════════════════
   missionStore — Zustand store for mission & waypoint management
   ═══════════════════════════════════════════════════════════════

   ┌──────────────────────────────────────────────────────────┐
   │  HOW WAYPOINTS ARE STORED AND MANAGED                    │
   │                                                          │
   │  Missions live in `Record<string, Mission>` keyed by     │
   │  mission id — O(1) lookups, same pattern as droneStore.  │
   │  Each mission contains an ordered `waypoints[]` array.   │
   │                                                          │
   │  CRUD operations:                                        │
   │    createMission  → adds a new empty mission for a drone │
   │    addWaypoint    → pushes a waypoint to the end         │
   │    updateWaypoint → patches lat/lng/alt/holdTime/speed   │
   │    removeWaypoint → filters out by waypoint id           │
   │    reorderWaypoints → splice-based reorder               │
   │    deleteMission  → removes the entire mission           │
   └──────────────────────────────────────────────────────────┘

   ┌──────────────────────────────────────────────────────────┐
   │  HOW THE DRONE MOVES ALONG THE MISSION                   │
   │                                                          │
   │  All position computation is handled by                  │
   │  DroneMissionController + WaypointNavigator.             │
   │  This store only tracks mission metadata:                │
   │    • status (idle/running/paused/completed)              │
   │    • currentWpIndex (for UI progress display)            │
   │    • progress (0–1 segment interpolation for UI)         │
   └──────────────────────────────────────────────────────────┘
   ═══════════════════════════════════════════════════════════════ */

import { create } from 'zustand'
import type { Mission, MissionStoreState } from '../../../types/mission'
import { useDroneStore } from '../../drone/store/droneStore'

/** Produce a short unique id */
let _seq = 0
function uid(prefix = 'msn'): string {
  return `${prefix}-${Date.now().toString(36)}-${(++_seq).toString(36)}`
}

/* ═══════════════════════════════════════════════════════════════
   Immutable helper — replace a single mission in the record
   ═══════════════════════════════════════════════════════════════ */
function patchMission(
  missions: Record<string, Mission>,
  id: string,
  patch: Partial<Mission>,
): Record<string, Mission> {
  const existing = missions[id]
  if (!existing) return missions
  return { ...missions, [id]: { ...existing, ...patch } }
}

/* ═══════════════════════════════════════════════════════════════
   Zustand Store
   ═══════════════════════════════════════════════════════════════ */
export const useMissionStore = create<MissionStoreState>((set, get) => ({
  missions: {},

  /* ──────────────────────────────────────────────────────────
     Mission CRUD
     ────────────────────────────────────────────────────────── */

  createMission: (name, droneId) => {
    const id = uid()
    const mission: Mission = {
      id,
      name,
      droneId,
      waypoints: [],
      status: 'idle',
      currentWpIndex: 0,
      progress: 0,
    }
    set((s) => ({ missions: { ...s.missions, [id]: mission } }))
    return id
  },

  deleteMission: (missionId) =>
    set((s) => {
      const rest = { ...s.missions }
      delete rest[missionId]
      return { missions: rest }
    }),

  renameMission: (missionId, name) =>
    set((s) => ({ missions: patchMission(s.missions, missionId, { name }) })),

  /* ──────────────────────────────────────────────────────────
     Waypoint management
     ────────────────────────────────────────────────────────── */

  addWaypoint: (missionId, wp) =>
    set((s) => {
      const m = s.missions[missionId]
      if (!m) return s
      return {
        missions: patchMission(s.missions, missionId, {
          waypoints: [...m.waypoints, wp],
        }),
      }
    }),

  updateWaypoint: (missionId, wpId, patch) =>
    set((s) => {
      const m = s.missions[missionId]
      if (!m) return s
      return {
        missions: patchMission(s.missions, missionId, {
          waypoints: m.waypoints.map((wp) =>
            wp.id === wpId ? { ...wp, ...patch } : wp,
          ),
        }),
      }
    }),

  removeWaypoint: (missionId, wpId) =>
    set((s) => {
      const m = s.missions[missionId]
      if (!m) return s
      return {
        missions: patchMission(s.missions, missionId, {
          waypoints: m.waypoints.filter((wp) => wp.id !== wpId),
        }),
      }
    }),

  reorderWaypoints: (missionId, fromIndex, toIndex) =>
    set((s) => {
      const m = s.missions[missionId]
      if (!m) return s
      const wps = [...m.waypoints]
      const [removed] = wps.splice(fromIndex, 1)
      wps.splice(toIndex, 0, removed)
      return {
        missions: patchMission(s.missions, missionId, { waypoints: wps }),
      }
    }),

  /* ──────────────────────────────────────────────────────────
     Execution controls
     ────────────────────────────────────────────────────────── */

  startMission: (missionId) => {
    const m = get().missions[missionId]
    if (!m) return
    const drone = useDroneStore.getState().drones[m.droneId]
    const sLat = drone?.lat ?? m.waypoints[0]?.lat ?? 0
    const sLng = drone?.lng ?? m.waypoints[0]?.lng ?? 0
    const sAlt = drone?.altitude ?? m.waypoints[0]?.altitude ?? 0
    set((s) => ({
      missions: patchMission(s.missions, missionId, {
        status: 'running',
        currentWpIndex: 0,
        progress: 0,
        startLat: sLat,
        startLng: sLng,
        startAlt: sAlt,
      }),
    }))
  },

  pauseMission: (missionId) =>
    set((s) => ({
      missions: patchMission(s.missions, missionId, { status: 'paused' }),
    })),

  resumeMission: (missionId) =>
    set((s) => ({
      missions: patchMission(s.missions, missionId, { status: 'running' }),
    })),

  stopMission: (missionId) =>
    set((s) => ({
      missions: patchMission(s.missions, missionId, {
        status: 'idle',
        currentWpIndex: 0,
        progress: 0,
      }),
    })),

  /* ──────────────────────────────────────────────────────────
     Progress updates — called by DroneMissionController

     The controller owns position computation via
     WaypointNavigator. These methods only update the
     store metadata so the UI can display progress.
     ────────────────────────────────────────────────────────── */

  updateMissionProgress: (missionId, currentWpIndex, progress) =>
    set((s) => ({
      missions: patchMission(s.missions, missionId, {
        currentWpIndex,
        progress,
      }),
    })),

  completeMission: (missionId) =>
    set((s) => ({
      missions: patchMission(s.missions, missionId, {
        status: 'completed',
        progress: 1,
      }),
    })),

  /* ──────────────────────────────────────────────────────────
     Queries (non-reactive — call inside selectors or callbacks)
     ────────────────────────────────────────────────────────── */
  getMissionsForDrone: (droneId) =>
    Object.values(get().missions).filter((m) => m.droneId === droneId),

  getActiveMissionForDrone: (droneId) =>
    Object.values(get().missions).find(
      (m) => m.droneId === droneId && m.status === 'running',
    ),
}))
