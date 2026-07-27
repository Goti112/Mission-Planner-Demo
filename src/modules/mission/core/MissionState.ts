/* ═══════════════════════════════════════════════════════════════
   MissionState — Finite state machine for the mission lifecycle
   ═══════════════════════════════════════════════════════════════

   This is the AUTHORITATIVE lifecycle tracker for every drone.
   It is more granular than the existing DroneState (which only has
   TAKING_OFF, EN_ROUTE, PAUSED, COMPLETED, ABORTED) and adds
   ARMING, RETURN_HOME, and LANDING phases.

   ── States ──────────────────────────────────────────────────

     IDLE            – No mission assigned; drone grounded / idle.
     ARMING          – Pre-flight checks; waiting for motor arm.
     TAKEOFF         – Climbing to mission-start altitude.
     MISSION_RUNNING – Actively traversing waypoints.
     PAUSED          – Hovering in place; mission paused by user.
     RETURN_HOME     – Flying back to home/launch position.
     LANDING         – Descending to ground from RTH or mission end.
     COMPLETED       – Mission finished successfully.
     ABORTED         – Mission cancelled or error; drone halted.

   ── Allowed transitions ────────────────────────────────────

     IDLE            → ARMING
     ARMING          → TAKEOFF, ABORTED
     TAKEOFF         → MISSION_RUNNING, ABORTED
     MISSION_RUNNING → PAUSED, RETURN_HOME, COMPLETED, ABORTED
     PAUSED          → MISSION_RUNNING, RETURN_HOME, ABORTED
     RETURN_HOME     → LANDING, ABORTED
     LANDING         → COMPLETED, ABORTED
     COMPLETED       → IDLE   (reset for next mission)
     ABORTED         → IDLE   (reset for next mission)

   Uses `as const` object + type union (no TS enum) because
   tsconfig has `erasableSyntaxOnly: true`.

   @author  GCS Engineering
   ═══════════════════════════════════════════════════════════════ */

// ── State identifiers ───────────────────────────────────────────────────

export const MissionState = {
  /** No mission assigned; drone grounded / idle. */
  IDLE:            'IDLE',
  /** Pre-flight checks; waiting for motor arm. */
  ARMING:          'ARMING',
  /** Climbing to mission-start altitude. */
  TAKEOFF:         'TAKEOFF',
  /** Actively traversing waypoints. */
  MISSION_RUNNING: 'MISSION_RUNNING',
  /** Hovering in place; mission paused by user. */
  PAUSED:          'PAUSED',
  /** Flying back to home/launch position. */
  RETURN_HOME:     'RETURN_HOME',
  /** Descending to ground. */
  LANDING:         'LANDING',
  /** Mission finished successfully. */
  COMPLETED:       'COMPLETED',
  /** Mission cancelled or error; drone halted. */
  ABORTED:         'ABORTED',
} as const;

export type MissionState = typeof MissionState[keyof typeof MissionState];

// ── Transition map ──────────────────────────────────────────────────────

/**
 * Valid transitions from each state.
 * If a transition is not in this map it is BLOCKED.
 */
export const MISSION_STATE_TRANSITIONS: Record<MissionState, readonly MissionState[]> = {
  [MissionState.IDLE]:            [MissionState.ARMING],
  [MissionState.ARMING]:          [MissionState.TAKEOFF, MissionState.ABORTED],
  [MissionState.TAKEOFF]:         [MissionState.MISSION_RUNNING, MissionState.ABORTED],
  [MissionState.MISSION_RUNNING]: [MissionState.PAUSED, MissionState.RETURN_HOME, MissionState.COMPLETED, MissionState.ABORTED],
  [MissionState.PAUSED]:          [MissionState.MISSION_RUNNING, MissionState.RETURN_HOME, MissionState.ABORTED],
  [MissionState.RETURN_HOME]:     [MissionState.LANDING, MissionState.ABORTED],
  [MissionState.LANDING]:         [MissionState.COMPLETED, MissionState.ABORTED],
  [MissionState.COMPLETED]:       [MissionState.IDLE],
  [MissionState.ABORTED]:         [MissionState.IDLE],
};

// ── Helpers ─────────────────────────────────────────────────────────────

/**
 * Returns `true` if transitioning from `from` → `to` is valid.
 */
export function isValidTransition(from: MissionState, to: MissionState): boolean {
  return MISSION_STATE_TRANSITIONS[from].includes(to);
}

/**
 * States where the drone is in-flight (engines active, movement expected).
 */
export const ACTIVE_FLIGHT_STATES: readonly MissionState[] = [
  MissionState.TAKEOFF,
  MissionState.MISSION_RUNNING,
  MissionState.RETURN_HOME,
  MissionState.LANDING,
] as const;

/**
 * States where position updates from the mission controller are allowed.
 * Includes PAUSED because hover override is a position update (speed=0).
 */
export const MOVABLE_STATES: readonly MissionState[] = [
  MissionState.TAKEOFF,
  MissionState.MISSION_RUNNING,
  MissionState.PAUSED,
  MissionState.RETURN_HOME,
  MissionState.LANDING,
] as const;

/**
 * Is the drone actively flying (engines on, possibly moving)?
 */
export function isActiveFlightState(state: MissionState): boolean {
  return (ACTIVE_FLIGHT_STATES as readonly string[]).includes(state);
}

/**
 * Can the mission controller push position updates in this state?
 */
export function isMovableState(state: MissionState): boolean {
  return (MOVABLE_STATES as readonly string[]).includes(state);
}

// ── Spanish UI labels ───────────────────────────────────────────────────

/**
 * Human-readable labels (Spanish) for each mission state.
 * Used in drone pills, telemetry panel, mission sidebar.
 */
export const MISSION_STATE_LABELS: Record<MissionState, string> = {
  [MissionState.IDLE]:            'Inactivo',
  [MissionState.ARMING]:          'Armando',
  [MissionState.TAKEOFF]:         'Despegando',
  [MissionState.MISSION_RUNNING]: 'En misión',
  [MissionState.PAUSED]:          'Pausado',
  [MissionState.RETURN_HOME]:     'Retorno',
  [MissionState.LANDING]:         'Aterrizando',
  [MissionState.COMPLETED]:       'Completado',
  [MissionState.ABORTED]:         'Abortado',
};

/**
 * CSS-friendly colour tokens for each state (for UI indicators).
 */
export const MISSION_STATE_COLORS: Record<MissionState, string> = {
  [MissionState.IDLE]:            'var(--mission-text-muted, #888)',
  [MissionState.ARMING]:          'var(--mission-warning, #f0ad4e)',
  [MissionState.TAKEOFF]:         'var(--mission-info, #5bc0de)',
  [MissionState.MISSION_RUNNING]: 'var(--mission-success, #5cb85c)',
  [MissionState.PAUSED]:          'var(--mission-warning, #f0ad4e)',
  [MissionState.RETURN_HOME]:     'var(--mission-info, #5bc0de)',
  [MissionState.LANDING]:         'var(--mission-info, #5bc0de)',
  [MissionState.COMPLETED]:       'var(--mission-success, #5cb85c)',
  [MissionState.ABORTED]:         'var(--mission-danger, #d9534f)',
};
