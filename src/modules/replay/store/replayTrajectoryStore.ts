/**
 * replayTrajectoryStore.ts
 *
 * ═══════════════════════════════════════════════════════════════════════
 * SINGLE SOURCE OF TRUTH — REPLAY TRAJECTORY
 * ═══════════════════════════════════════════════════════════════════════
 *
 * Architecture
 * ────────────
 * This store is the single authoritative source for trajectory data
 * during mission replay.  ALL map renderers (Mapbox 2D, Cesium 3D) derive
 * their visual trail from this store — never from local component state.
 *
 * Switching between 2D ↔ 3D views therefore NEVER resets or loses any
 * trajectory history; renderers simply re-read from this global state
 * and resume exactly where playback left off.
 *
 * Data flow
 * ─────────
 *   Recording loads / replay starts
 *     → MissionReplayViewer calls buildFromRecording()
 *     → allPoints is populated once from the ring-buffer (full scan)
 *     → bounds are derived in the same pass
 *
 *   Replay engine ticks (20 Hz) / user scrubs timeline
 *     → useFlightReplay / handleScrub call syncToFrame(frameIdx)
 *     → visibleCount is updated (cheap single set())
 *     → Consumers re-slice allPoints[0..visibleCount] to get
 *       their "traveled" path — no rescan, no allocation of new arrays
 *       beyond the slice
 *
 * Consumers
 * ─────────
 *   Mapbox 2D  — subscribes via React (useReplayTrajectoryStore hook),
 *                slices allPoints in a useMemo keyed on visibleCount.
 *
 *   Cesium 3D  — subscribes via Zustand's non-React subscribe() inside
 *                the Cesium init effect; updates a mutable Cartesian3[]
 *                ref without triggering any React re-renders.
 *
 * Performance
 * ───────────
 *   • allPoints is allocated once and never mutated — stable reference
 *     across all React renders between recording changes.
 *   • visibleCount is the only field changing at 20 Hz.
 *   • Cesium path: zero React renders — pure ref mutation via subscribe().
 *   • Mapbox path: one useMemo re-run per frame during playback (cheap
 *     Array.slice + minimal GeoJSON object).
 */

import { create } from 'zustand'
import { subscribeWithSelector } from 'zustand/middleware'
import {
  MAX_FRAMES_PER_DRONE,
  FRAME_FIELDS,
  F,
} from './flightRecorderStore'
import type { DroneRecording } from './flightRecorderStore'

// ── Trail window ──────────────────────────────────────────────────────────

/**
 * Maximum metres of trail rendered behind the drone.
 * Points older than this distance are not shown.
 */
export const TRAIL_WINDOW_M = 115

/**
 * Flat-earth horizontal distance in metres between two GPS coordinates.
 * Accurate enough for distances up to a few kilometres.
 */
export const geoDistM = (
  lat1: number, lng1: number,
  lat2: number, lng2: number,
): number => {
  const R     = 6_371_000
  const dLat  = (lat2 - lat1) * (Math.PI / 180)
  const dLng  = (lng2 - lng1) * (Math.PI / 180)
  const cosLat = Math.cos(lat1 * (Math.PI / 180))
  return Math.sqrt((dLat * R) ** 2 + (dLng * R * cosLat) ** 2)
}

/**
 * Returns the index of the first point that should be included in the
 * rolling trail window of `maxMeters` length, measured backwards from
 * `endIdx`.  Always returns a value in [0, endIdx].
 */
export const trailWindowStart = (
  points: TrajectoryPoint[],
  endIdx: number,
  maxMeters: number,
): number => {
  if (endIdx <= 0) return 0
  let acc = 0
  for (let i = endIdx; i > 0; i--) {
    acc += geoDistM(
      points[i - 1].lat, points[i - 1].lng,
      points[i].lat,     points[i].lng,
    )
    if (acc >= maxMeters) return i
  }
  return 0
}

// ── Types ─────────────────────────────────────────────────────────────────

export interface TrajectoryPoint {
  lat: number
  lng: number
  /** Altitude above ground level (metres) */
  alt: number
}

export interface ReplayTrajectoryState {
  /**
   * Full pre-built trajectory — all frames, chronological (oldest first).
   * Populated once by buildFromRecording(); stable until the active drone
   * or recording changes.
   */
  allPoints: TrajectoryPoint[]

  /**
   * How many leading points are currently "visible" (played through).
   * Ranges [0, allPoints.length].
   * The "traveled" path = allPoints.slice(0, visibleCount).
   */
  visibleCount: number

  /** Drone ID for which allPoints was built. */
  droneId: string | null

  /**
   * Tight bounding box [minLng, minLat, maxLng, maxLat] of the full
   * trajectory.  Used by map renderers to fitBounds() on initial load.
   * null when there are fewer than 2 frames.
   */
  bounds: [number, number, number, number] | null

  // ── Actions ─────────────────────────────────────────────────────────

  /**
   * Scan a DroneRecording and populate allPoints + bounds.
   * Must be called whenever the active drone or its recording changes.
   * Preserves visibleCount when the drone id is unchanged and the
   * recording still has enough frames; resets it to 0 otherwise.
   */
  buildFromRecording(droneId: string, rec: DroneRecording): void

  /**
   * Advance the visible portion of the trajectory to include all frames
   * up to and including frameIdx.
   * Called at 20 Hz by useFlightReplay and on manual scrub / reset.
   */
  syncToFrame(frameIdx: number): void

  /**
   * Clear all trajectory data.
   * Call when leaving the replay view entirely.
   */
  clear(): void
}

// ── Store ─────────────────────────────────────────────────────────────────

export const useReplayTrajectoryStore = create<ReplayTrajectoryState>()(
  subscribeWithSelector((set, get) => ({
    allPoints:    [],
    visibleCount: 0,
    droneId:      null,
    bounds:       null,

    buildFromRecording(droneId, rec) {
      const frameCount = Math.min(rec.total, MAX_FRAMES_PER_DRONE)
      const points: TrajectoryPoint[] = []
      let minLat =  90,  maxLat = -90
      let minLng = 180,  maxLng = -180

      if (frameCount > 0) {
        const ringOffset = rec.total > MAX_FRAMES_PER_DRONE ? rec.cursor : 0
        for (let i = 0; i < frameCount; i++) {
          const slot = (ringOffset + i) % MAX_FRAMES_PER_DRONE
          const base = slot * FRAME_FIELDS
          const lat  = rec.frames[base + F.LAT]
          const lng  = rec.frames[base + F.LNG]
          const alt  = rec.frames[base + F.ALT]
          points.push({ lat, lng, alt })
          if (lat < minLat) minLat = lat
          if (lat > maxLat) maxLat = lat
          if (lng < minLng) minLng = lng
          if (lng > maxLng) maxLng = lng
        }
      }

      const bounds: [number, number, number, number] | null =
        frameCount >= 2 ? [minLng, minLat, maxLng, maxLat] : null

      // Preserve visibleCount when re-building for the same drone so that
      // switching 2D ↔ 3D does not reset the playback position.
      const prevState   = get()
      const prevVisible = prevState.droneId === droneId
        ? Math.min(prevState.visibleCount, points.length)
        : 0

      set({ allPoints: points, droneId, bounds, visibleCount: prevVisible })

      if (import.meta.env.DEV) {
        console.group('🟢 [ReplayTrajectory] buildFromRecording')
        console.log('  droneId:', droneId)
        console.log('  total frames in recording:', frameCount)
        console.log('  allPoints length:', points.length)
        console.log('  preserved visibleCount:', prevVisible)
        console.log('  bounds:', bounds ? `[${bounds[0].toFixed(4)}, ${bounds[1].toFixed(4)}]` : 'null')
        console.log('  TRAJECTORY SOURCE:', points.length > 0 ? '✅ READY' : '❌ EMPTY')
        console.groupEnd()
      }
    },

    syncToFrame(frameIdx) {
      const { allPoints, visibleCount: prevCount } = get()
      if (allPoints.length === 0) return
      const next = Math.min(Math.max(0, frameIdx + 1), allPoints.length)
      // Skip no-op updates to avoid unnecessary subscriber notifications
      if (prevCount === next) return
      
      set({ visibleCount: next })
      
      if (import.meta.env.DEV && next % 50 === 0) {
        console.debug(
          `🔄 [ReplayTrajectory] syncToFrame  frameIdx=${frameIdx}  visibleCount=${prevCount}→${next}  of ${allPoints.length}  (${((next / allPoints.length) * 100).toFixed(1)}%)`
        )
      }
    },

    clear() {
      set({ allPoints: [], visibleCount: 0, droneId: null, bounds: null })
      if (import.meta.env.DEV) {
        console.log('🗑️  [ReplayTrajectory] cleared — store reset')
      }
    },
  })),
)
