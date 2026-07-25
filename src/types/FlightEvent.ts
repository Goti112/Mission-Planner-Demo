/**
 * FlightEvent.ts — Core type for flight event log entries
 *
 * Every significant drone event (mission lifecycle, waypoints,
 * altitude transitions, safety alerts) is recorded as a FlightEvent.
 *
 * The type string acts as a category key — UI coloring and filtering
 * is based on it. Use SCREAMING_SNAKE_CASE convention.
 *
 * Example event types:
 *   MISSION_START, MISSION_PAUSE, MISSION_RESUME, MISSION_ABORT,
 *   MISSION_COMPLETE, TAKEOFF, TAKEOFF_COMPLETE, WAYPOINT_REACHED,
 *   ALTITUDE_CHANGE, BATTERY_LOW, BATTERY_CRITICAL
 */

export interface FlightEvent {
  /** Unix timestamp in milliseconds (Date.now()). */
  timestamp: number
  /** ID of the drone that generated this event. */
  droneId: string
  /**
   * Event category string. SCREAMING_SNAKE_CASE.
   * Used for UI coloring and filtering.
   */
  type: string
  /** Human-readable description for the operator. */
  message: string
}
