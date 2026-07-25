/* ═══════════════════════════════════════════════════════════════
   CesiumProjection — 3D→2D screen-space projection pipeline
   ═══════════════════════════════════════════════════════════════

   Converts WGS-84 geographic positions into 2D canvas coordinates
   using Cesium's own projection maths.

   Design constraints:
     • ZERO heap allocation in the hot path — all scratch objects
       pre-allocated at module level.
     • Graceful handling of off-screen / behind-camera points.
     • Reuses Cesium.SceneTransforms for pixel-perfect alignment
       with the underlying 3D scene.

   ═══════════════════════════════════════════════════════════════ */

import * as Cesium from 'cesium'
import type { GeoPosition, ScreenPoint } from './types'

// ── Scratch objects (pre-allocated, reused every frame) ───────────────
const _scratchCartesian   = new Cesium.Cartesian3()
const _scratchCartographic = new Cesium.Cartographic()
const _scratchWindowCoord = new Cesium.Cartesian2()

/**
 * Project a single WGS-84 position to screen coordinates.
 *
 * @returns ScreenPoint if visible, or null if behind camera / off-screen.
 */
export function projectPosition(
  scene: Cesium.Scene,
  pos: GeoPosition,
): ScreenPoint | null {
  // Convert geodetic → Cartesian3 (reuses scratch)
  Cesium.Cartographic.fromDegrees(pos.lng, pos.lat, pos.altitudeMSL, _scratchCartographic)
  Cesium.Cartographic.toCartesian(_scratchCartographic, Cesium.Ellipsoid.WGS84, _scratchCartesian)

  // Project to window coordinates
  const result = Cesium.SceneTransforms.worldToWindowCoordinates(
    scene,
    _scratchCartesian,
    _scratchWindowCoord,
  )

  if (!result) return null

  // Reject NaN / Infinity from degenerate camera positions
  if (!isFinite(result.x) || !isFinite(result.y)) return null

  return { x: result.x, y: result.y }
}

/**
 * Batch-project an array of GeoPositions into a pre-allocated output buffer.
 *
 * Returns the number of valid (visible) points written.
 * The output arrays (outX, outY) must be at least `positions.length` long.
 *
 * Out-of-view positions are skipped; the returned count tells the caller
 * how many contiguous points are in the buffer.  To avoid broken polylines
 * when a mid-path point goes behind the camera, we track segment breaks
 * via the `breaks` output array (indices where a new sub-path starts).
 *
 * @param positions  Input geographic positions (oldest first).
 * @param outX       Pre-allocated Float64 x-coordinate buffer.
 * @param outY       Pre-allocated Float64 y-coordinate buffer.
 * @param breaks     Pre-allocated Int32 array for segment-break indices.
 * @returns          Object with `count` (total valid points) and
 *                   `breakCount` (number of sub-path starts in `breaks`).
 */
export function projectBatch(
  scene: Cesium.Scene,
  positions: GeoPosition[],
  outX: Float64Array,
  outY: Float64Array,
  breaks: Int32Array,
): { count: number; breakCount: number } {
  let count      = 0
  let breakCount = 0
  let prevValid  = false

  for (let i = 0; i < positions.length; i++) {
    const p = positions[i]

    Cesium.Cartographic.fromDegrees(p.lng, p.lat, p.altitudeMSL, _scratchCartographic)
    Cesium.Cartographic.toCartesian(_scratchCartographic, Cesium.Ellipsoid.WGS84, _scratchCartesian)

    const result = Cesium.SceneTransforms.worldToWindowCoordinates(
      scene,
      _scratchCartesian,
      _scratchWindowCoord,
    )

    if (!result || !isFinite(result.x) || !isFinite(result.y)) {
      prevValid = false
      continue
    }

    // If previous point was invalid, this starts a new sub-path
    if (!prevValid && count > 0) {
      breaks[breakCount++] = count
    }

    outX[count] = result.x
    outY[count] = result.y
    count++
    prevValid = true
  }

  return { count, breakCount }
}

/**
 * Maximum number of trail points we support.
 * Buffers are allocated once at this size (~400 KB per drone, supports ~41 hours at 1 pt/3 s).
 */
export const MAX_TRAIL_POINTS = 50000

/**
 * Pre-allocated projection buffers for a single drone trail.
 * Create one per drone to avoid buffer contention.
 */
export interface ProjectionBuffers {
  outX: Float64Array
  outY: Float64Array
  breaks: Int32Array
}

/** Create a fresh set of projection buffers. */
export function createProjectionBuffers(): ProjectionBuffers {
  return {
    outX:   new Float64Array(MAX_TRAIL_POINTS),
    outY:   new Float64Array(MAX_TRAIL_POINTS),
    breaks: new Int32Array(MAX_TRAIL_POINTS),
  }
}
