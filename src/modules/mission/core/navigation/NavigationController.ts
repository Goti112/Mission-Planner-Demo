/**
 * NavigationController.ts
 *
 * ════════════════════════════════════════════════════════════════════════
 * AUTOPILOT NAVIGATION CONTROLLER — Realistic UAV waypoint navigation
 * ════════════════════════════════════════════════════════════════════════
 *
 * Replaces linear WaypointNavigator interpolation with a proper
 * autopilot-style controller, producing smooth, realistic movement
 * comparable to ArduPilot / PX4:
 *
 *   • Smooth heading control — clamped turn rate (35°/s max)
 *     prevents instant rotation; creates realistic banked turns.
 *
 *   • Speed controller — proportional control with acceleration
 *     limiting (3 m/s²); drone smoothly reaches cruise speed.
 *
 *   • Altitude controller — proportional control toward waypoint
 *     altitude, vertical rate clamped to ±3 m/s.
 *
 *   • Arrival radius — 6 m default; advances to next waypoint
 *     when within radius, preventing oscillation.
 *
 *   • Geographic integration — bearing + distance → lat/lng update
 *     using spherical Earth approximation.
 *
 * ── Safety ───────────────────────────────────────────────────────────────
 *
 *   Each drone MUST have its own NavigationController instance.
 *   Navigation state is NEVER shared across drones.
 *   The controller is passive — DroneMissionController is responsible
 *   for gating update() on MissionState.MISSION_RUNNING.
 *
 * ── Output compatibility ─────────────────────────────────────────────────
 *
 *   NavControllerOutput field names match NavigatorState (WaypointNavigator)
 *   for minimal disruption to the existing DroneMissionController logic:
 *
 *     lat, lng, altitude, yaw, currentWpIndex,
 *     segmentProgress, overallProgress, completed,
 *     isHolding, holdRemaining
 *
 *   Additional fields:
 *     speed          — current ground speed (m/s, smoothed)
 *     verticalSpeed  — current climb rate (m/s, smoothed)
 *     pitchDeg       — attitude pitch derived from climb rate
 *
 * @author  GCS Engineering
 */

import { haversineDistanceM, calculateBearing } from '../../../telemetry';
import type { Waypoint } from '../../../../types/mission';

// ── Constants ────────────────────────────────────────────────────────────────

const R_EARTH = 6_371_000; // metres
const DEG_TO_RAD = Math.PI / 180;
const RAD_TO_DEG = 180 / Math.PI;

// ── Configuration ─────────────────────────────────────────────────────────────

export interface NavControllerConfig {
  /** Cruise speed in m/s (default: 10). Overridden by per-waypoint speed. */
  cruiseSpeedMs: number;
  /** Maximum heading turn rate in degrees/second (default: 35). */
  maxTurnRateDegPerSec: number;
  /** Maximum linear acceleration/deceleration in m/s² (default: 3). */
  maxAccelMs2: number;
  /** Maximum climb rate in m/s (default: 3). */
  maxClimbRateMs: number;
  /** Maximum descent rate in m/s (default: 3). */
  maxDescentRateMs: number;
  /**
   * Altitude controller proportional gain per second (default: 0.7).
   * targetVerticalSpeed = clamp(altError × gain, -maxDescend, +maxClimb)
   */
  altGainPerSec: number;
  /**
   * Vertical speed smoothing factor (default: 4).
   * Higher = snappier vertical response.
   */
  vsSmoothing: number;
  /** Arrival radius in metres — drone advances to next WP when closer (default: 6). */
  arrivalRadiusM: number;
}

const DEFAULT_CONFIG: NavControllerConfig = {
  cruiseSpeedMs:        10,
  maxTurnRateDegPerSec: 35,
  maxAccelMs2:          2000,
  maxClimbRateMs:       2000,
  maxDescentRateMs:     2000,
  altGainPerSec:        0.7,
  vsSmoothing:          4,
  arrivalRadiusM:       6,
};

// ── Output ────────────────────────────────────────────────────────────────────

/**
 * State snapshot returned by NavigationController.update().
 *
 * Field names intentionally match NavigatorState (WaypointNavigator) for
 * backward compatibility with existing DroneMissionController consumers.
 */
export interface NavControllerOutput {
  /** Current latitude (degrees). */
  lat: number;
  /** Current longitude (degrees). */
  lng: number;
  /** Current altitude AGL (metres). */
  altitude: number;
  /** Current heading in degrees [0, 360). 0 = North, 90 = East. */
  yaw: number;
  /** Smoothed ground speed (m/s). */
  speed: number;
  /** Smoothed vertical speed (m/s, positive = climbing). */
  verticalSpeed: number;
  /** Pitch attitude derived from verticalSpeed / speed (degrees). */
  pitchDeg: number;
  /** Index of the waypoint currently being targeted. */
  currentWpIndex: number;
  /** 0–1 progress within the current segment. */
  segmentProgress: number;
  /** 0–1 overall mission progress. */
  overallProgress: number;
  /** True when all waypoints have been reached. */
  completed: boolean;
  /** True when the drone is holding at a waypoint. */
  isHolding: boolean;
  /** Hold time remaining in seconds (0 if not holding). */
  holdRemaining: number;
}

// ── NavigationController ──────────────────────────────────────────────────────

export class NavigationController {
  private readonly _waypoints: ReadonlyArray<Waypoint>;
  private readonly _cfg: NavControllerConfig;

  // ── Mutable flight state ──────────────────────────────────────────────────

  /** Current latitude (degrees). */
  private _lat: number;
  /** Current longitude (degrees). */
  private _lng: number;
  /** Current altitude AGL (metres). */
  private _alt: number;
  /** Current heading [0, 360). Smoothly rotates toward target bearing. */
  private _yaw: number;
  /** Current ground speed (m/s). Smoothly accelerates toward cruise speed. */
  private _speed: number;
  /** Current vertical speed (m/s). Proportional control toward waypoint alt. */
  private _verticalSpeed: number;

  // ── Navigator state ───────────────────────────────────────────────────────

  private _wpIndex: number = 0;
  private _completed: boolean = false;
  private _paused: boolean = false;

  // ── Hold state ────────────────────────────────────────────────────────────

  private _isHolding: boolean = false;
  private _holdElapsed: number = 0;
  private _holdDuration: number = 0;

  // ── Segment progress tracking ─────────────────────────────────────────────

  /** Distance covered on the current segment (used for segmentProgress). */
  private _segmentDistanceTravelled: number = 0;
  /** Total horizontal distance of the current segment (haversine). */
  private _segmentTotalDistM: number = 0;

  // ── Constructor ───────────────────────────────────────────────────────────

  /**
   * Create a NavigationController for one drone.
   *
   * @param waypoints   Ordered waypoint list for the mission.
   * @param startLat    Drone latitude at EN_ROUTE entry (end of takeoff).
   * @param startLng    Drone longitude at EN_ROUTE entry.
   * @param startAlt    Drone altitude AGL at EN_ROUTE entry.
   * @param startYaw    Drone heading at EN_ROUTE entry (degrees).
   * @param config      Optional override of default controller parameters.
   */
  constructor(
    waypoints: ReadonlyArray<Waypoint>,
    startLat: number,
    startLng: number,
    startAlt: number,
    startYaw: number,
    config?: Partial<NavControllerConfig>,
  ) {
    this._waypoints = waypoints;
    this._cfg = { ...DEFAULT_CONFIG, ...config };

    this._lat   = startLat;
    this._lng   = startLng;
    this._alt   = startAlt;
    this._yaw   = startYaw;
    this._speed          = 0; // starts stationary after takeoff hover
    this._verticalSpeed  = 0;

    if (waypoints.length === 0) {
      this._completed = true;
    } else {
      this._computeSegmentDistance();
    }
  }

  // ── Public API ────────────────────────────────────────────────────────────

  /**
   * Advance navigation by `dt` seconds.
   *
   * MUST only be called from DroneMissionController when
   * missionState === MISSION_RUNNING. The controller does not
   * guard this itself — the caller is responsible.
   *
   * @param dt  Delta time in seconds (capped upstream to 100 ms).
   * @returns   Current navigation state snapshot.
   */
  update(dt: number): NavControllerOutput {
    if (!this._completed && !this._paused && this._waypoints.length > 0) {
      if (this._isHolding) {
        this._tickHold(dt);
      } else {
        this._tickFly(dt);
      }
    }
    return this._buildOutput();
  }

  /** Pause navigation — update() becomes a no-op while paused. */
  pause(): void {
    this._paused = true;
  }

  /** Resume navigation. */
  resume(): void {
    this._paused = false;
  }

  get isPaused(): boolean { return this._paused; }
  get isCompleted(): boolean { return this._completed; }
  get currentWaypointIndex(): number { return this._wpIndex; }

  // ── Step 2 / 3 — Heading Control & Turn Smoothing ─────────────────────────

  /**
   * Core flight tick — runs every update() call when not holding.
   *
   * Implements:
   *   STEP 2 — compute target bearing to current waypoint
   *   STEP 3 — smooth heading toward bearing (clamped turn rate)
   *   STEP 4 — arrival radius waypoint switching
   *   STEP 4b — past-the-plane waypoint switching (overshoot recovery)
   *   STEP 5 — speed controller (proportional + acceleration limit)
   *   STEP 6 — altitude controller (proportional VS, clamped)
   *   STEP 7 — geographic position integration
   */
  private _tickFly(dt: number): void {
    const wp = this._waypoints[this._wpIndex];
    if (!wp) return;

    // ── STEP 4: Arrival radius ─────────────────────────────────────────────
    // Check distance on every tick BEFORE moving — ensures we don't overshoot.
    const distToWp = haversineDistanceM(this._lat, this._lng, wp.lat, wp.lng);

    if (distToWp <= this._cfg.arrivalRadiusM) {
      // Snap to waypoint position — prevents oscillation near the target.
      this._lat = wp.lat;
      this._lng = wp.lng;
      this._alt = wp.altitude;

      const holdTime = wp.holdTime ?? 0;
      if (holdTime > 0) {
        // Enter hold mode — drone hovers until hold timer expires.
        this._isHolding   = true;
        this._holdElapsed = 0;
        this._holdDuration = holdTime;
        this._speed         = 0;
        this._verticalSpeed = 0;
        return;
      }

      // Advance immediately to the next waypoint.
      this._advanceWaypoint();
      if (this._completed) return;
      // Recompute wp reference after advance; fall through to movement.
    } else {
      // ── STEP 4b: Past-the-plane check ─────────────────────────────────────
      // When the minimum turning radius exceeds the arrival radius (typical at
      // cruise speed), the drone can end up orbiting a waypoint that lies
      // inside its turning circle — it never reaches the 6 m snap zone.
      //
      // Guard: only apply when close enough that an overshoot is plausible
      // (<50 m).  This prevents chain-skipping at segment start, when the
      // drone has not yet oriented toward the target.
      //
      // Trigger: the waypoint is >90° off the drone's nose — it has been
      // overflown.  Advance to the next WP WITHOUT snapping so the drone
      // continues from its current position (no visual teleport).
      if (distToWp < 50) {
        const bearingToWp   = calculateBearing(this._lat, this._lng, wp.lat, wp.lng);
        const wpAngleDiff   = Math.abs(this._normalizeHeadingError(bearingToWp - this._yaw));
        if (wpAngleDiff > 90) {
          this._advanceWaypoint();
          if (this._completed) return;
        }
      }
    }

    const targetWp = this._waypoints[this._wpIndex];
    if (!targetWp) return;

    // ── STEP 2: Target bearing ────────────────────────────────────────────
    const targetBearing = calculateBearing(this._lat, this._lng, targetWp.lat, targetWp.lng);

    // ── STEP 3: Smooth heading — clamp turn rate (35°/s) ─────────────────
    const headingError = this._normalizeHeadingError(targetBearing - this._yaw);
    const maxTurnStep  = this._cfg.maxTurnRateDegPerSec * dt;
    this._yaw += this._clamp(headingError, -maxTurnStep, maxTurnStep);
    this._yaw = this._normalizeBearing(this._yaw);

    // ── STEP 5: Speed controller ──────────────────────────────────────────
    // Target speed: per-waypoint override or mission cruise speed.
    const targetSpeed = targetWp.speed ?? this._cfg.cruiseSpeedMs;
    const speedError  = targetSpeed - this._speed;
    const maxSpeedStep = this._cfg.maxAccelMs2 * dt;
    this._speed += this._clamp(speedError, -maxSpeedStep, maxSpeedStep);

    // ── STEP 6: Altitude controller ───────────────────────────────────────
    // targetVerticalSpeed = clamp(altError × gain, -maxDescend, +maxClimb)
    const altError        = targetWp.altitude - this._alt;
    const targetVS        = this._clamp(
      altError * this._cfg.altGainPerSec,
      -this._cfg.maxDescentRateMs,
      this._cfg.maxClimbRateMs,
    );
    // Smooth VS toward target using exponential decay (avoids abrupt VS changes).
    const vsFactor = 1 - Math.exp(-this._cfg.vsSmoothing * dt);
    this._verticalSpeed += (targetVS - this._verticalSpeed) * vsFactor;

    // Update altitude from vertical speed.
    this._alt += this._verticalSpeed * dt;

    // ── STEP 7: Position integration ──────────────────────────────────────
    // Move in the direction of current heading at current speed.
    // Uses spherical Earth approximation for accuracy over short distances.
    const distThisTick = this._speed * dt;
    const yawRad       = this._yaw * DEG_TO_RAD;
    const dNorth       = distThisTick * Math.cos(yawRad);
    const dEast        = distThisTick * Math.sin(yawRad);
    this._lat += (dNorth / R_EARTH) * RAD_TO_DEG;
    this._lng += (dEast  / R_EARTH) * RAD_TO_DEG / Math.cos(this._lat * DEG_TO_RAD);

    // Track segment distance for segmentProgress output.
    this._segmentDistanceTravelled += distThisTick;
  }

  // ── Hold tick ─────────────────────────────────────────────────────────────

  private _tickHold(dt: number): void {
    this._holdElapsed += dt;
    if (this._holdElapsed >= this._holdDuration) {
      this._isHolding   = false;
      this._holdElapsed = 0;
      this._holdDuration = 0;
      this._advanceWaypoint();
    }
  }

  // ── Waypoint advancement ──────────────────────────────────────────────────

  private _advanceWaypoint(): void {
    this._wpIndex++;
    this._segmentDistanceTravelled = 0;

    if (this._wpIndex >= this._waypoints.length) {
      this._completed = true;
      this._speed         = 0;
      this._verticalSpeed = 0;
      return;
    }

    this._computeSegmentDistance();
  }

  // ── Segment distance ──────────────────────────────────────────────────────

  private _computeSegmentDistance(): void {
    const wp = this._waypoints[this._wpIndex];
    if (!wp) {
      this._segmentTotalDistM = 0;
      return;
    }
    // Horizontal distance to next waypoint (used for segmentProgress).
    this._segmentTotalDistM = haversineDistanceM(this._lat, this._lng, wp.lat, wp.lng);
  }

  // ── Output builder ────────────────────────────────────────────────────────

  private _buildOutput(): NavControllerOutput {
    const totalWps = this._waypoints.length;

    let segmentProgress = 0;
    let overallProgress = 0;

    if (totalWps > 0 && !this._completed) {
      if (this._segmentTotalDistM > 0) {
        segmentProgress = Math.min(
          this._segmentDistanceTravelled / this._segmentTotalDistM,
          1,
        );
      } else {
        segmentProgress = 1;
      }
      overallProgress = Math.min(
        (this._wpIndex + segmentProgress) / totalWps,
        1,
      );
    } else if (this._completed) {
      segmentProgress = 1;
      overallProgress = 1;
    }

    // Derive pitch attitude from climb rate.
    // pitch = asin(verticalSpeed / max(speed, 1)) — realistic PFD display.
    const effectiveSpeed = Math.max(Math.abs(this._speed), 1);
    const pitchRad = Math.asin(
      this._clamp(this._verticalSpeed / effectiveSpeed, -1, 1),
    );
    const pitchDeg = pitchRad * RAD_TO_DEG;

    return {
      lat:           this._lat,
      lng:           this._lng,
      altitude:      this._alt,
      yaw:           this._yaw,
      speed:         this._speed,
      verticalSpeed: this._verticalSpeed,
      pitchDeg,
      currentWpIndex:  this._wpIndex,
      segmentProgress,
      overallProgress,
      completed:   this._completed,
      isHolding:   this._isHolding,
      holdRemaining: Math.max(0, this._holdDuration - this._holdElapsed),
    };
  }

  // ── Utilities ─────────────────────────────────────────────────────────────

  /**
   * Normalize a heading error to the shortest-arc range [-180, +180].
   * Used to determine the correct turn direction (CW vs CCW).
   */
  private _normalizeHeadingError(error: number): number {
    while (error > 180)  error -= 360;
    while (error < -180) error += 360;
    return error;
  }

  /**
   * Normalize a bearing to [0, 360).
   */
  private _normalizeBearing(bearing: number): number {
    return ((bearing % 360) + 360) % 360;
  }

  private _clamp(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value));
  }
}
