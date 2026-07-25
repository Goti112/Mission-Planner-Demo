/* ═══════════════════════════════════════════════════════════════
   WaypointNavigator — Professional waypoint traversal engine
   ═══════════════════════════════════════════════════════════════

   Engine-agnostic, UI-independent waypoint navigation with:

   • Haversine distance for accurate geo-distance computation
   • Configurable speed per waypoint or mission-wide default
   • Smooth yaw interpolation (shortest-arc rotation)
   • Arrival detection with configurable tolerance
   • Hold-time support at each waypoint
   • Pause / resume without position drift
   • 3D altitude interpolation (no visual glitches)

   USAGE:
     const nav = new WaypointNavigator(waypoints, startPos, config)
     // In your tick loop:
     const state = nav.update(deltaTime)
     // Apply state.lat, state.lng, state.altitude, state.yaw to drone

   ═══════════════════════════════════════════════════════════════ */

import type { Waypoint } from '../../../types/mission'
import {
  haversineDistanceM,
  calculateBearing,
} from '../../telemetry'

/* ═══════════════════════════════════════════════════════════════
   Configuration
   ═══════════════════════════════════════════════════════════════ */
export interface NavigatorConfig {
  /** Default speed in m/s when no per-waypoint speed is set (default: 12) */
  defaultSpeed: number
  /** Distance in metres at which the drone is considered "arrived" (default: 2) */
  arrivalTolerance: number
  /** Yaw smoothing factor per second — higher = snappier turns (default: 5) */
  yawSmoothRate: number
}

const DEFAULT_CONFIG: NavigatorConfig = {
  defaultSpeed: 12,
  arrivalTolerance: 2,
  yawSmoothRate: 5,
}

/* ═══════════════════════════════════════════════════════════════
   Navigator State — returned every tick
   ═══════════════════════════════════════════════════════════════ */
export interface NavigatorState {
  /** Current interpolated latitude */
  lat: number
  /** Current interpolated longitude */
  lng: number
  /** Current interpolated altitude (AGL) */
  altitude: number
  /** Smoothed yaw in degrees (0 = North, 90 = East) */
  yaw: number
  /** Index of the waypoint currently being targeted */
  currentWpIndex: number
  /** 0–1 progress within the current segment */
  segmentProgress: number
  /** 0–1 overall mission progress */
  overallProgress: number
  /** Whether the drone is holding at a waypoint */
  isHolding: boolean
  /** Hold time remaining in seconds (0 if not holding) */
  holdRemaining: number
  /** True when all waypoints have been reached (and all holds completed) */
  completed: boolean
}

/* ═══════════════════════════════════════════════════════════════
   Start position — the drone's position when the mission begins
   ═══════════════════════════════════════════════════════════════ */
export interface StartPosition {
  lat: number
  lng: number
  altitude: number
}

/* ═══════════════════════════════════════════════════════════════
   CLASS
   ═══════════════════════════════════════════════════════════════ */
export class WaypointNavigator {
  private readonly waypoints: ReadonlyArray<Waypoint>
  private readonly config: NavigatorConfig

  /** Expose the configured default speed for external consumers (e.g. bank angle calc). */
  get defaultSpeed(): number { return this.config.defaultSpeed }

  /* ── Mutable navigation state ── */
  private _currentWpIndex = 0
  private _lat: number
  private _lng: number
  private _altitude: number
  private _yaw = 0
  private _targetYaw = 0
  private _completed = false

  /* ── Segment tracking ── */
  private _segmentDistance = 0   // metres
  private _segmentTravelled = 0 // metres
  private _fromLat: number
  private _fromLng: number
  private _fromAlt: number

  /* ── Hold tracking ── */
  private _isHolding = false
  private _holdElapsed = 0
  private _holdDuration = 0

  /* ── Paused flag ── */
  private _paused = false

  constructor(
    waypoints: ReadonlyArray<Waypoint>,
    start: StartPosition,
    config?: Partial<NavigatorConfig>,
  ) {
    this.waypoints = waypoints
    this.config = { ...DEFAULT_CONFIG, ...config }

    // Initialise position to start
    this._lat = start.lat
    this._lng = start.lng
    this._altitude = start.altitude
    this._fromLat = start.lat
    this._fromLng = start.lng
    this._fromAlt = start.altitude

    if (waypoints.length === 0) {
      this._completed = true
    } else {
      this._computeSegment()
      this._updateTargetYaw()
      // Snap initial yaw toward the first waypoint (no smoothing needed yet)
      this._yaw = this._targetYaw
    }
  }

  /* ══════════════════════════════════════════════
     PUBLIC API
     ══════════════════════════════════════════════ */

  /** Advance the navigator by `dt` seconds. Returns the current state. */
  update(dt: number): NavigatorState {
    if (!this._completed && !this._paused && this.waypoints.length > 0) {
      if (this._isHolding) {
        this._tickHold(dt)
      } else {
        this._tickMove(dt)
      }
    }
    return this.getState()
  }

  /** Get current state without advancing time */
  getState(): NavigatorState {
    const totalWps = this.waypoints.length
    let overallProgress = 0
    if (totalWps > 0) {
      const segProg = this._segmentDistance > 0
        ? Math.min(this._segmentTravelled / this._segmentDistance, 1)
        : 1
      overallProgress = Math.min((this._currentWpIndex + segProg) / totalWps, 1)
    }
    if (this._completed) overallProgress = 1

    return {
      lat: this._lat,
      lng: this._lng,
      altitude: this._altitude,
      yaw: this._yaw,
      currentWpIndex: this._currentWpIndex,
      segmentProgress: this._segmentDistance > 0
        ? Math.min(this._segmentTravelled / this._segmentDistance, 1)
        : 1,
      overallProgress,
      isHolding: this._isHolding,
      holdRemaining: Math.max(0, this._holdDuration - this._holdElapsed),
      completed: this._completed,
    }
  }

  /** Pause navigation — update() will be a no-op */
  pause(): void {
    this._paused = true
  }

  /** Resume navigation */
  resume(): void {
    this._paused = false
  }

  get isPaused(): boolean {
    return this._paused
  }

  get isCompleted(): boolean {
    return this._completed
  }

  get currentWaypointIndex(): number {
    return this._currentWpIndex
  }

  /* ══════════════════════════════════════════════
     INTERNAL — Movement
     ══════════════════════════════════════════════ */

  private _tickMove(dt: number): void {
    const wp = this.waypoints[this._currentWpIndex]
    if (!wp) return

    const speed = wp.speed ?? this.config.defaultSpeed
    const distanceThisTick = speed * dt

    this._segmentTravelled += distanceThisTick

    if (this._segmentTravelled >= this._segmentDistance - this.config.arrivalTolerance) {
      // Arrived at waypoint — snap to exact position
      this._lat = wp.lat
      this._lng = wp.lng
      this._altitude = wp.altitude
      this._segmentTravelled = this._segmentDistance

      // Check for hold time
      const holdTime = wp.holdTime ?? 0
      if (holdTime > 0) {
        this._isHolding = true
        this._holdElapsed = 0
        this._holdDuration = holdTime
        return
      }

      // Advance to next waypoint
      this._advanceToNextWaypoint()
    } else {
      // Interpolate position along the great-circle segment
      const t = this._segmentDistance > 0
        ? this._segmentTravelled / this._segmentDistance
        : 1

      this._lat = this._fromLat + (wp.lat - this._fromLat) * t
      this._lng = this._fromLng + (wp.lng - this._fromLng) * t
      this._altitude = this._fromAlt + (wp.altitude - this._fromAlt) * t

      // Smooth yaw interpolation
      this._updateTargetYaw()
      this._smoothYaw(dt)
    }
  }

  private _tickHold(dt: number): void {
    this._holdElapsed += dt
    if (this._holdElapsed >= this._holdDuration) {
      this._isHolding = false
      this._holdElapsed = 0
      this._holdDuration = 0
      this._advanceToNextWaypoint()
    }
  }

  private _advanceToNextWaypoint(): void {
    this._currentWpIndex++
    if (this._currentWpIndex >= this.waypoints.length) {
      this._completed = true
      return
    }

    // Set up the next segment
    this._fromLat = this._lat
    this._fromLng = this._lng
    this._fromAlt = this._altitude
    this._segmentTravelled = 0
    this._computeSegment()
    this._updateTargetYaw()
    this._smoothYaw(0) // update target instantly for the new segment
  }

  /* ══════════════════════════════════════════════
     INTERNAL — Segment computation
     ══════════════════════════════════════════════ */

  private _computeSegment(): void {
    if (this._currentWpIndex >= this.waypoints.length) {
      this._segmentDistance = 0
      return
    }
    const wp = this.waypoints[this._currentWpIndex]
    const horizDist = haversineDistanceM(
      this._fromLat, this._fromLng,
      wp.lat, wp.lng,
    )
    const dAlt = wp.altitude - this._fromAlt
    // 3D distance = sqrt(horizontal² + altitude²)
    this._segmentDistance = Math.sqrt(horizDist * horizDist + dAlt * dAlt)
  }

  /* ══════════════════════════════════════════════
     INTERNAL — Yaw
     ══════════════════════════════════════════════ */

  /** Compute the bearing from current position to the target waypoint */
  private _updateTargetYaw(): void {
    if (this._currentWpIndex >= this.waypoints.length) return
    const wp = this.waypoints[this._currentWpIndex]
    this._targetYaw = calculateBearing(this._fromLat, this._fromLng, wp.lat, wp.lng)
  }

  /** Smoothly interpolate current yaw toward target (shortest arc) */
  private _smoothYaw(dt: number): void {
    let diff = this._targetYaw - this._yaw

    // Normalise to [-180, 180] for shortest arc
    while (diff > 180) diff -= 360
    while (diff < -180) diff += 360

    // Exponential smoothing: factor = 1 - e^(-rate * dt)
    const factor = 1 - Math.exp(-this.config.yawSmoothRate * dt)
    this._yaw += diff * factor

    // Normalise yaw to [0, 360)
    this._yaw = ((this._yaw % 360) + 360) % 360
  }
}
