/**
 * MissionMetrics.ts — Pure calculation service for mission planning metrics.
 *
 * All functions are stateless and have no side effects.
 * Called from UI hooks / components to derive real-time planning stats.
 *
 * Functions:
 *   calculateTotalDistance()      — total path length in metres
 *   calculateWaypointDistances()  — per-segment distances
 *   calculateMissionDuration()    — estimated flight time in seconds
 *   calculateAltitudeProfile()    — altitude vs cumulative distance data
 *   calculateMissionMetrics()     — all metrics in one call
 */

import { haversineDistanceM } from '../../telemetry'
import type { Waypoint } from '../../../types/mission'

// ── Types ─────────────────────────────────────────────────────────────────────

/** Distance for a single segment (from→to index). */
export interface SegmentDistance {
  fromIndex: number
  toIndex:   number
  distanceM: number
}

/** A point in the altitude vs distance profile chart. */
export interface AltitudeProfilePoint {
  /** WP label e.g. "WP1" */
  label: string
  /** Cumulative mission distance at this waypoint (m) */
  distanceM: number
  /** AGL altitude (m) */
  altitudeM: number
}

/** All pre-computed mission statistics. */
export interface MissionMetrics {
  /** Total path length in metres */
  totalDistanceM: number
  /** Per-segment distances */
  segmentDistances: SegmentDistance[]
  /** Estimated flight duration in seconds at cruiseSpeedMs */
  durationSeconds: number
  /** Altitude vs cumulative-distance data (for chart) */
  altitudeProfile: AltitudeProfilePoint[]
  /** Number of waypoints */
  waypointCount: number
  /** Highest waypoint altitude in metres */
  maxAltitudeM: number
  /** Lowest waypoint altitude in metres */
  minAltitudeM: number
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Format metres → human-readable distance string */
export function fmtDist(m: number): string {
  if (m >= 10_000) return `${(m / 1000).toFixed(1)} km`
  if (m >= 1_000)  return `${(m / 1000).toFixed(2)} km`
  return `${Math.round(m)} m`
}

/** Format seconds → mm:ss or hh:mm */
export function fmtTime(s: number): string {
  if (s <= 0 || !Number.isFinite(s)) return '—'
  const h   = Math.floor(s / 3600)
  const m   = Math.floor((s % 3600) / 60)
  const sec = Math.floor(s % 60)
  if (h > 0) return `${h}h ${m.toString().padStart(2, '0')}m`
  return `${m}m ${sec.toString().padStart(2, '0')}s`
}

// ── Core functions ────────────────────────────────────────────────────────────

// ── Minimal coordinate type ───────────────────────────────────────────────────

/** Any object with lat/lng — allows callers to pass PathWaypoint, Waypoint, etc. */
interface GeoPoint {
  lat: number
  lng: number
}

/**
 * Compute the haversine distance of each segment.
 * Returns an empty array when there is fewer than 2 waypoints.
 */
export function calculateWaypointDistances(waypoints: GeoPoint[]): SegmentDistance[] {
  const result: SegmentDistance[] = []
  for (let i = 0; i < waypoints.length - 1; i++) {
    result.push({
      fromIndex: i,
      toIndex:   i + 1,
      distanceM: haversineDistanceM(
        waypoints[i].lat,     waypoints[i].lng,
        waypoints[i + 1].lat, waypoints[i + 1].lng,
      ),
    })
  }
  return result
}

/** Sum of all segment distances (metres). */
export function calculateTotalDistance(waypoints: Waypoint[]): number {
  return calculateWaypointDistances(waypoints)
    .reduce((acc, seg) => acc + seg.distanceM, 0)
}

/**
 * Estimated flight duration in seconds.
 * Includes segment travel time + hold times at each waypoint.
 *
 * @param waypoints      ordered list of waypoints
 * @param cruiseSpeedMs  default cruise speed (m/s) — per-waypoint speed overrides it
 */
export function calculateMissionDuration(
  waypoints: Waypoint[],
  cruiseSpeedMs: number,
): number {
  if (waypoints.length < 2 || cruiseSpeedMs <= 0) return 0
  let totalSec = 0
  for (let i = 1; i < waypoints.length; i++) {
    const prev  = waypoints[i - 1]
    const curr  = waypoints[i]
    const dist  = haversineDistanceM(prev.lat, prev.lng, curr.lat, curr.lng)
    const speed = curr.speed ?? cruiseSpeedMs
    totalSec += dist / speed
    totalSec += prev.holdTime ?? 0
  }
  // Hold time at the last waypoint
  totalSec += waypoints[waypoints.length - 1].holdTime ?? 0
  return totalSec
}

/**
 * Build cumulative-distance vs altitude data array (for the altitude profile chart).
 * Each element corresponds to one waypoint.
 */
export function calculateAltitudeProfile(waypoints: Waypoint[]): AltitudeProfilePoint[] {
  let cumDist = 0
  return waypoints.map((wp, i) => {
    if (i > 0) {
      cumDist += haversineDistanceM(
        waypoints[i - 1].lat, waypoints[i - 1].lng,
        wp.lat,               wp.lng,
      )
    }
    return {
      label:     `WP${i + 1}`,
      distanceM: Math.round(cumDist),
      altitudeM: wp.altitude,
    }
  })
}

/**
 * Compute all metrics in a single call.
 *
 * @param waypoints      ordered list of waypoints
 * @param cruiseSpeedMs  cruise speed override in m/s (default: 12)
 */
export function calculateMissionMetrics(
  waypoints: Waypoint[],
  cruiseSpeedMs = 12,
): MissionMetrics {
  if (waypoints.length === 0) {
    return {
      totalDistanceM:  0,
      segmentDistances: [],
      durationSeconds: 0,
      altitudeProfile: [],
      waypointCount:   0,
      maxAltitudeM:    0,
      minAltitudeM:    0,
    }
  }

  const segmentDistances = calculateWaypointDistances(waypoints)
  const totalDistanceM   = segmentDistances.reduce((a, s) => a + s.distanceM, 0)
  const altitudes        = waypoints.map((w) => w.altitude)

  return {
    totalDistanceM,
    segmentDistances,
    durationSeconds:  calculateMissionDuration(waypoints, cruiseSpeedMs),
    altitudeProfile:  calculateAltitudeProfile(waypoints),
    waypointCount:    waypoints.length,
    maxAltitudeM:     Math.max(...altitudes),
    minAltitudeM:     Math.min(...altitudes),
  }
}
