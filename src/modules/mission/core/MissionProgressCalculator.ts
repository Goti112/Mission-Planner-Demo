/* ═══════════════════════════════════════════════════════════════
   MissionProgressCalculator — Pure navigation metrics engine
   ═══════════════════════════════════════════════════════════════

   Responsibilities
   ─────────────────
   • Compute MissionProgress from navigator state + waypoint list.
   • Cache per-segment distances per missionId (O(1) lookup after
     first call; invalidated when waypoint count changes).
   • No React, no Zustand, no side-effects — pure calculation.

   Performance guarantees
   ──────────────────────
   • Segment-distance array built once per mission (n–1 haversines).
   • Subsequent ticks: 1 haversine (drone→wp) + O(n) tail sum scan.
   • Works correctly when called at 60 Hz.

   Design constraints
   ──────────────────
   • TypeScript strict, no enums (erasableSyntaxOnly).
   • Zero external dependencies beyond FlightTelemetryModel helpers.
   ═══════════════════════════════════════════════════════════════ */

import type { Waypoint } from '../../../types/mission';
import type { MissionProgress } from './MissionProgress';
import {
  haversineDistanceM,
  calculateBearing,
} from '../../telemetry';

/** Minimum ground speed (m/s) below which ETA is not computed. */
const MIN_SPEED_FOR_ETA = 0.5;

/** Per-mission segment distance cache entry. */
interface SegmentCache {
  /** Number of waypoints when this cache was built (used for invalidation). */
  waypointCount: number;
  /** segmentDists[i] = haversine(wp[i], wp[i+1]), length = n-1. */
  segmentDists: number[];
  /**
   * tailDist[i] = sum of segmentDists[i..n-2], i.e. the total remaining
   * path distance starting from waypoint i (not including the segment that
   * leads TO wp i, only segments FROM wp i onward).
   * tailDist[n-1] = 0 (no more segments after last WP).
   * Length = n.
   */
  tailDist: number[];
}

// ─────────────────────────────────────────────────────────────────────────────

export class MissionProgressCalculator {
  /** Latest computed progress keyed by droneId. */
  private readonly _progress: Map<string, MissionProgress> = new Map();

  /** Segment distance cache keyed by missionId. */
  private readonly _cache: Map<string, SegmentCache> = new Map();

  // ── Public API ─────────────────────────────────────────────────────────────

  /**
   * Compute (and cache internally) MissionProgress for one drone.
   *
   * Call this every update tick (e.g. 10 Hz from PROGRESS_STORE_INTERVAL).
   *
   * @param droneId        - Drone identifier
   * @param missionId      - Mission identifier
   * @param waypoints      - Ordered waypoint array for the mission
   * @param currentWpIndex - 0-based index of the next target waypoint
   * @param segmentProgress- 0-1 progress within the current segment (from WaypointNavigator)
   * @param droneLat       - Current drone latitude (degrees)
   * @param droneLon       - Current drone longitude (degrees)
   * @param groundSpeed    - Current ground speed (m/s)
   * @returns Computed MissionProgress (also stored for getProgress())
   */
  calculate(
    droneId: string,
    missionId: string,
    waypoints: Waypoint[],
    currentWpIndex: number,
    segmentProgress: number,
    droneLat: number,
    droneLon: number,
    groundSpeed: number,
  ): MissionProgress {
    const totalWaypoints = waypoints.length;

    // Guard: no waypoints
    if (totalWaypoints === 0) {
      const empty = this._emptyProgress(droneId, missionId);
      this._progress.set(droneId, empty);
      return empty;
    }

    // Clamp index to valid range
    const wpIdx = Math.min(Math.max(0, currentWpIndex), totalWaypoints - 1);
    const targetWp = waypoints[wpIdx];

    // ── 1. Segment distance cache ──────────────────────────────────────────
    const cache = this._getOrBuildCache(missionId, waypoints);

    // ── 2. Distance from drone to current target waypoint ─────────────────
    const distanceToNextWaypoint = haversineDistanceM(
      droneLat, droneLon,
      targetWp.lat, targetWp.lng,
    );

    // ── 3. Remaining path distance after the current waypoint ─────────────
    //    tailDist[wpIdx] = sum of segment lengths from wpIdx onward
    //    (i.e. distance from wp[wpIdx] → wp[wpIdx+1] → … → wp[last])
    const distanceRemainingAfterWp = cache.tailDist[wpIdx] ?? 0;

    const totalDistanceRemaining = distanceToNextWaypoint + distanceRemainingAfterWp;

    // ── 4. ETA ─────────────────────────────────────────────────────────────
    const etaSeconds =
      groundSpeed >= MIN_SPEED_FOR_ETA
        ? totalDistanceRemaining / groundSpeed
        : undefined;

    // ── 5. Bearing to current waypoint ────────────────────────────────────
    const bearingToWaypoint = calculateBearing(
      droneLat, droneLon,
      targetWp.lat, targetWp.lng,
    );

    // ── 6. Overall completion % ───────────────────────────────────────────
    //    currentWpIndex (wpIdx) is the 0-based index of the NEXT target waypoint
    //    (NavigationController semantics). The drone is currently traversing:
    //      wpIdx === 0 → initial approach from takeoff position to wp[0] (not in cache)
    //      wpIdx  >  0 → segment from wp[wpIdx-1] → wp[wpIdx], length = segmentDists[wpIdx-1]
    //
    //    distanceCovered = (sum of fully completed segments) + (fraction of current segment)
    //      = (totalMissionDist - tailDist[wpIdx-1]) + segmentDists[wpIdx-1] * segmentProgress
    //
    //    tailDist[i] = segmentDists[i] + segmentDists[i+1] + … + segmentDists[n-2]
    //    So (totalMissionDist - tailDist[wpIdx-1]) = sum of segments 0 … wpIdx-2
    //    (all fully completed inter-waypoint segments before the current one).
    const totalMissionDist = cache.tailDist[0] ?? 0; // entire mission length
    let missionPercentComplete = 0;
    if (totalMissionDist > 0 && totalWaypoints > 1) {
      const clampedSegProg = Math.min(1, Math.max(0, segmentProgress));
      if (wpIdx === 0) {
        // Drone is on the initial takeoff approach (start → wp[0]).
        // That leg is not in the segment cache, so report 0% until wp[0] is passed.
        missionPercentComplete = 0;
      } else {
        // Completed distance = all inter-waypoint segments before the current one.
        const completedDist = totalMissionDist - (cache.tailDist[wpIdx - 1] ?? 0);
        // Current segment length: from wp[wpIdx-1] to wp[wpIdx].
        const currentSegLen = cache.segmentDists[wpIdx - 1] ?? 0;
        const distanceCovered = completedDist + currentSegLen * clampedSegProg;
        missionPercentComplete = Math.min(100, Math.max(0,
          (distanceCovered / totalMissionDist) * 100,
        ));
      }
    } else if (totalWaypoints <= 1) {
      // Single-waypoint "mission": at 100% once reached
      missionPercentComplete = segmentProgress >= 1 ? 100 : segmentProgress * 100;
    }

    // ── 7. Assemble progress object ────────────────────────────────────────
    const progress: MissionProgress = {
      droneId,
      missionId,
      currentWaypointIndex: wpIdx,
      totalWaypoints,
      distanceToNextWaypoint,
      distanceRemainingAfterWp,
      totalDistanceRemaining,
      etaSeconds,
      bearingToWaypoint,
      missionPercentComplete,
      segmentProgress,
    };

    this._progress.set(droneId, progress);
    return progress;
  }

  /**
   * Retrieve the last computed progress for a drone.
   * Returns null if no progress has been computed yet for this drone.
   */
  getProgress(droneId: string): MissionProgress | null {
    return this._progress.get(droneId) ?? null;
  }

  /** Remove stored progress for a drone (call on mission abort/complete). */
  clearDrone(droneId: string): void {
    this._progress.delete(droneId);
  }

  /** Invalidate and remove segment cache for a mission. */
  clearMission(missionId: string): void {
    this._cache.delete(missionId);
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  /** Build or return existing (valid) segment cache for a mission. */
  private _getOrBuildCache(missionId: string, waypoints: Waypoint[]): SegmentCache {
    const existing = this._cache.get(missionId);
    if (existing && existing.waypointCount === waypoints.length) {
      return existing;
    }

    // Build segment distances: segmentDists[i] = dist(wp[i], wp[i+1])
    const n = waypoints.length;
    const segmentDists: number[] = new Array(Math.max(0, n - 1));
    for (let i = 0; i < n - 1; i++) {
      segmentDists[i] = haversineDistanceM(
        waypoints[i].lat, waypoints[i].lng,
        waypoints[i + 1].lat, waypoints[i + 1].lng,
      );
    }

    // Build tail distances: tailDist[i] = sum of segmentDists[i..n-2]
    // tailDist[n-1] = 0 (after last waypoint, 0 distance remains)
    const tailDist: number[] = new Array(n).fill(0);
    for (let i = n - 2; i >= 0; i--) {
      tailDist[i] = segmentDists[i] + (tailDist[i + 1] ?? 0);
    }

    const entry: SegmentCache = { waypointCount: n, segmentDists, tailDist };
    this._cache.set(missionId, entry);
    return entry;
  }

  /** Zero-filled progress for edge cases (no waypoints, etc.). */
  private _emptyProgress(droneId: string, missionId: string): MissionProgress {
    return {
      droneId,
      missionId,
      currentWaypointIndex: 0,
      totalWaypoints: 0,
      distanceToNextWaypoint: 0,
      distanceRemainingAfterWp: 0,
      totalDistanceRemaining: 0,
      etaSeconds: undefined,
      bearingToWaypoint: 0,
      missionPercentComplete: 0,
      segmentProgress: 0,
    };
  }
}

/** Application-wide singleton — import and use directly. */
export const missionProgressCalculator = new MissionProgressCalculator();
