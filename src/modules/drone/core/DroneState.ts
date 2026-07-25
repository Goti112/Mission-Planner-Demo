/* ═══════════════════════════════════════════════════════════════
   DroneState — Finite state machine for drone mission lifecycle
   ═══════════════════════════════════════════════════════════════

   State transitions:

     IDLE ──► TAKING_OFF ──► EN_ROUTE ──► COMPLETED
                               │  ▲
                               ▼  │
                             PAUSED

     Any active state ──► RTL_ASCEND ──► RTL_RETURN ──► RTL_LAND
                                                              │
                                                         COMPLETED

     Any state ──► ABORTED ──► IDLE

   IMPORTANT: Missions do NOT start automatically.
   The drone stays in IDLE until the user explicitly
   calls DroneMissionController.startMission().
   ═══════════════════════════════════════════════════════════════ */

export const DroneState = {
  /** Drone is powered on, waiting — no mission assigned or active */
  IDLE: 'IDLE',
  /** Drone is climbing to mission-start altitude */
  TAKING_OFF: 'TAKING_OFF',
  /** Drone is actively traversing waypoints */
  EN_ROUTE: 'EN_ROUTE',
  /** Drone is holding position (mission paused by user) */
  PAUSED: 'PAUSED',
  /** All waypoints reached — mission finished successfully */
  COMPLETED: 'COMPLETED',
  /** Mission cancelled by user — drone halts in place */
  ABORTED: 'ABORTED',
  // ── RTL (Return-To-Launch) states ──────────────────────────────────────
  /** RTL phase 1 — climbing vertically to safe RTL altitude */
  RTL_ASCEND: 'RTL_ASCEND',
  /** RTL phase 2 — flying horizontally back to home position */
  RTL_RETURN: 'RTL_RETURN',
  /** RTL phase 3 — descending and landing at home position */
  RTL_LAND: 'RTL_LAND',
} as const

export type DroneState = typeof DroneState[keyof typeof DroneState]
