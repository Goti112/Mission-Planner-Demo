/* ═══════════════════════════════════════════════════════════════
   Mission Types — Waypoints & flight mission definitions
   ═══════════════════════════════════════════════════════════════

   HOW WAYPOINTS ARE STORED
   ────────────────────────
   Each waypoint is a simple geo-coordinate with an optional hold
   time (seconds the drone should hover at that point before
   proceeding to the next waypoint).

   A Mission is an ordered list of waypoints.  Each mission is
   assigned to a specific drone via `droneId`.

   RUNTIME STATE
   ─────────────
   `MissionStatus` tracks execution:
     • idle     — mission defined but not started
     • running  — drone is actively moving waypoint-to-waypoint
     • paused   — execution suspended (can resume)
     • completed — drone reached the final waypoint
   ═══════════════════════════════════════════════════════════════ */

/**
 * A single waypoint in a flight mission.
 *
 * - `id`       — unique identifier (UUID or sequential)
 * - `lat/lng`  — WGS-84 geographic coordinates
 * - `altitude` — metres above ground level (AGL)
 * - `holdTime` — optional seconds to hover at this point
 * - `speed`    — optional speed in m/s to approach this waypoint
 */
export interface Waypoint {
  id: string
  lat: number
  lng: number
  altitude: number
  /** Seconds to hold position at this waypoint (0 = fly through) */
  holdTime?: number
  /** Speed in m/s to approach this waypoint (overrides mission default) */
  speed?: number
  /** Planner command override for LIVE mission upload. */
  command?: 'WAYPOINT' | 'LAND'
}

/** Runtime status of a mission */
export type MissionStatus = 'idle' | 'running' | 'paused' | 'completed'

/**
 * A flight mission composed of an ordered array of waypoints.
 *
 * - `droneId`         — the drone assigned to fly this mission
 * - `waypoints`       — ordered path; index 0 is the first target
 * - `status`          — current execution state
 * - `currentWpIndex`  — index of the waypoint the drone is
 *                        currently flying toward (or holding at)
 * - `progress`        — 0..1 interpolation between current and
 *                        next waypoint during execution
 */
export interface Mission {
  id: string
  name: string
  droneId: string
  waypoints: Waypoint[]
  status: MissionStatus
  /** Index of the waypoint the drone is currently heading to */
  currentWpIndex: number
  /** 0–1 interpolation factor between waypoints during sim */
  progress: number
  /** Drone's lat when the mission was started (origin of first segment) */
  startLat?: number
  /** Drone's lng when the mission was started */
  startLng?: number
  /** Drone's altitude when the mission was started */
  startAlt?: number
}

/**
 * Shape of the mission Zustand store.
 *
 * Missions are stored as `Record<string, Mission>` for O(1)
 * lookups, same pattern as the drone store.
 */
export interface MissionStoreState {
  missions: Record<string, Mission>

  /* ── Mission CRUD ── */
  createMission: (name: string, droneId: string) => string
  deleteMission: (missionId: string) => void
  renameMission: (missionId: string, name: string) => void

  /* ── Waypoint management ── */
  addWaypoint: (missionId: string, wp: Waypoint) => void
  updateWaypoint: (missionId: string, wpId: string, patch: Partial<Omit<Waypoint, 'id'>>) => void
  removeWaypoint: (missionId: string, wpId: string) => void
  reorderWaypoints: (missionId: string, fromIndex: number, toIndex: number) => void

  /* ── Execution controls ── */
  startMission: (missionId: string) => void
  pauseMission: (missionId: string) => void
  resumeMission: (missionId: string) => void
  stopMission: (missionId: string) => void

  /** Called by DroneMissionController to update progress metadata for UI */
  updateMissionProgress: (missionId: string, currentWpIndex: number, progress: number) => void
  /** Called by DroneMissionController when all waypoints are completed */
  completeMission: (missionId: string) => void

  /* ── Queries ── */
  getMissionsForDrone: (droneId: string) => Mission[]
  getActiveMissionForDrone: (droneId: string) => Mission | undefined
}
