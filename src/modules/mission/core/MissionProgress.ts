/* ═══════════════════════════════════════════════════════════════
   MissionProgress — Per-drone real-time mission navigation data
   ═══════════════════════════════════════════════════════════════

   Produced by MissionProgressCalculator every update tick.
   Consumed by TelemetryPanelAdvanced, MissionSummary, GCSNavBar.

   All distances in metres. Bearing in degrees [0, 360).
   etaSeconds = undefined when groundSpeed is 0 or no mission active.
   ═══════════════════════════════════════════════════════════════ */

/**
 * Snapshot of real-time mission navigation progress for one drone.
 * Immutable value object — replace on every update, never mutate.
 */
export interface MissionProgress {
  /** Drone this progress belongs to. */
  droneId: string;

  /** Mission being executed. */
  missionId: string;

  /** 0-based index of the waypoint the drone is currently flying toward. */
  currentWaypointIndex: number;

  /** Total number of waypoints in the mission. */
  totalWaypoints: number;

  /** Straight-line distance (m) from drone to the current target waypoint. */
  distanceToNextWaypoint: number;

  /**
   * Remaining path distance (m) from the current target waypoint through
   * all subsequent waypoints to the final one.
   * Does NOT include distanceToNextWaypoint — add them for total remaining.
   */
  distanceRemainingAfterWp: number;

  /**
   * Total remaining distance (m) = distanceToNextWaypoint + distanceRemainingAfterWp.
   * Convenience field so callers don't have to add both.
   */
  totalDistanceRemaining: number;

  /**
   * Estimated seconds until mission complete given current ground speed.
   * undefined when speed ≤ 0 or no meaningful estimate exists.
   */
  etaSeconds: number | undefined;

  /**
   * Magnetic bearing from drone to current waypoint (degrees, true north = 0).
   * Range [0, 360).
   */
  bearingToWaypoint: number;

  /**
   * Overall mission completion [0, 100].
   * Accounts for partial progress through the current segment.
   */
  missionPercentComplete: number;

  /**
   * Progress within the current segment [0, 1].
   * Passes through directly from WaypointNavigator.
   */
  segmentProgress: number;
}
