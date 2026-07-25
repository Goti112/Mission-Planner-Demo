/* ═══════════════════════════════════════════════════════════════
   RTL Configuration — Return-To-Launch (RTL) tuning parameters
   ═══════════════════════════════════════════════════════════════

   Tune these values to match the aircraft's capabilities.
   All altitudes are in metres AGL; all speeds are in m/s.

   ── RTL Phase sequence ──────────────────────────────────────

     RTL_ASCEND  — climb vertically to RTL_SAFE_ALTITUDE (if needed)
     RTL_RETURN  — fly horizontally back to home lat/lng
     RTL_LAND    — descend and land at home position

   ── Design constraints ──────────────────────────────────────

     RTL is triggered by FailsafeManager (battery low, signal lost,
     geo-fence breach) or manually by the operator.

     RTL CANNOT be cancelled once in RTL_RETURN or RTL_LAND unless
     the operator re-arms and starts a new mission after landing.

   @author  GCS Engineering
   ═══════════════════════════════════════════════════════════════ */

/** RTL system tuning constants. All units: metres or m/s. */
export const RTL_CONFIG = {
  /**
   * Minimum safe altitude (m AGL) to reach before flying home.
   * If the drone is already above this, it skips the ascend phase.
   */
  SAFE_ALTITUDE_M: 60,

  /**
   * Climb speed during RTL_ASCEND phase (m/s, positive).
   * Must be ≤ NavigationController maxClimbRateMs (3 m/s default).
   */
  ASCEND_SPEED_MS: 2.5,

  /**
   * Cruise speed during RTL_RETURN phase (m/s).
   * Overrides the mission cruise speed for the return leg.
   */
  RETURN_SPEED_MS: 10,

  /**
   * Descent speed during RTL_LAND phase (m/s, positive ↓).
   * Drone descends at this rate until altitude < LAND_COMPLETE_ALT.
   */
  DESCENT_SPEED_MS: 1.5,

  /**
   * Altitude (m AGL) below which the drone is considered landed.
   * At this point the RTL_LAND → COMPLETED transition fires.
   */
  LAND_COMPLETE_ALT_M: 0.3,

  /**
   * Horizontal arrival radius (m) to consider "over home".
   * Once within this radius, the drone starts the descent phase.
   */
  HOME_ARRIVAL_RADIUS_M: 4,
} as const

export type RTLConfig = typeof RTL_CONFIG
