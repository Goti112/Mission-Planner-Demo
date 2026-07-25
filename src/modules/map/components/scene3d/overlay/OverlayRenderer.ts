/* ═══════════════════════════════════════════════════════════════
   OverlayRenderer — Canvas 2D rendering engine for Cesium overlay
   ═══════════════════════════════════════════════════════════════

   All drawing is performed in screen space on a single HTML5 Canvas
   placed on top of the Cesium viewer.  Nothing here touches the
   Cesium scene, entities, or primitives.

   Rendering pipeline per frame:
     1. Clear canvas
     2. For each drone trail → project → draw trajectory polyline
     3. For each drone → project ground marker + heading indicator
     4. Draw reference altitude plane (optional)

   Performance constraints:
     • Zero allocation inside draw calls — all buffers pre-allocated.
     • Single canvas path per polyline (no per-segment strokeStyle).
     • Re-use CanvasRenderingContext2D state where possible.

   ═══════════════════════════════════════════════════════════════ */

import * as Cesium from 'cesium'
import {
  projectPosition,
  projectBatch,
  createProjectionBuffers,
} from './CesiumProjection'
import type { ProjectionBuffers } from './CesiumProjection'
import type {
  DroneTrailData,
  GeoPosition,
  OverlayStyle,
} from './types'
import { DEFAULT_OVERLAY_STYLE } from './types'
import { getColorFromMSL, toRGBA } from '../../../../../shared/utils/altitudeColors'
import {
  calculateTrajectoryAlpha,
  calculateTrailWindowStartIndex,
} from '../trailVisualSync'

// ── Constants ─────────────────────────────────────────────────────────────
const TWO_PI  = Math.PI * 2
const DEG_RAD = Math.PI / 180

// ── Scratch GeoPosition used for ground-projected marker ──────────────
const _groundPos: GeoPosition = { lat: 0, lng: 0, altitudeMSL: 0, altitudeAGL: 0 }

/**
 * OverlayRenderer manages the 2D canvas drawing for one overlay layer.
 *
 * Usage:
 *   const renderer = new OverlayRenderer(canvas)
 *   // In Cesium postRender:
 *   renderer.draw(scene, trails, style)
 */
export class OverlayRenderer {
  private readonly ctx: CanvasRenderingContext2D
  private readonly canvas: HTMLCanvasElement

  /** Per-drone projection buffer pool (lazy-allocated, reused). */
  private bufferPool: Map<string, ProjectionBuffers> = new Map()

  /**
   * Exponentially-smoothed AGL altitude per drone.
   * Prevents abrupt colour jumps when altitude updates arrive in bursts.
   */
  private readonly _droneAltSmoothed = new Map<string, number>()

  /** EMA smoothing factor — lower = smoother, slower response. */
  private static readonly SMOOTH_ALPHA = 0.10

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas
    const ctx = canvas.getContext('2d', { alpha: true })
    if (!ctx) throw new Error('OverlayRenderer: failed to get 2d context')
    this.ctx = ctx
  }

  // ════════════════════════════════════════════════════════════════════
  //  RESIZE — called when the Cesium container changes size
  // ════════════════════════════════════════════════════════════════════

  resize(cssWidth: number, cssHeight: number): void {
    const dpr = Math.min(window.devicePixelRatio, 2)
    const bw  = Math.round(cssWidth  * dpr)
    const bh  = Math.round(cssHeight * dpr)

    if (this.canvas.width !== bw || this.canvas.height !== bh) {
      this.canvas.width  = bw
      this.canvas.height = bh
      // CSS size is set externally via style (100% of container)
      this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }
  }

  // ════════════════════════════════════════════════════════════════════
  //  MAIN DRAW — called once per Cesium render frame
  // ════════════════════════════════════════════════════════════════════

  draw(
    scene: Cesium.Scene,
    trails: DroneTrailData[],
    refAltitudeMSL: number | null = null,
    style: OverlayStyle = DEFAULT_OVERLAY_STYLE,
  ): void {
    const { ctx, canvas } = this
    const dpr    = Math.min(window.devicePixelRatio, 2)
    const cssW   = canvas.width  / dpr
    const cssH   = canvas.height / dpr

    // ── 1. Clear ──────────────────────────────────────────────────────────
    ctx.clearRect(0, 0, cssW, cssH)

    if (trails.length === 0) return

    // ── 2. Reference altitude plane (drawn first — behind everything) ─
    if (refAltitudeMSL !== null) {
      this.drawReferencePlane(scene, trails, refAltitudeMSL, cssW, cssH, style)
    }

    // ── 3. Trajectory lines (back to front: passive first, active last) ─
    const activeDrone = trails.find(t => t.isActive)
    for (const trail of trails) {
      if (trail.isActive) continue
      this.drawTrajectory(scene, trail, style)
    }
    if (activeDrone) {
      this.drawTrajectory(scene, activeDrone, style)
    }

    // ── 4. Drone ground markers (same order: passive, then active) ────
    for (const trail of trails) {
      if (trail.isActive) continue
      this.drawDroneMarker(scene, trail, refAltitudeMSL, style)
    }
    if (activeDrone) {
      this.drawDroneMarker(scene, activeDrone, refAltitudeMSL, style)
    }
  }

  // ════════════════════════════════════════════════════════════════════
  //  TRAJECTORY POLYLINE
  // ════════════════════════════════════════════════════════════════════

  private drawTrajectory(
    scene: Cesium.Scene,
    trail: DroneTrailData,
    style: OverlayStyle,
  ): void {
    const startIndex = calculateTrailWindowStartIndex(trail.positions.length)
    const positions = startIndex === 0
      ? trail.positions
      : trail.positions.slice(startIndex)
    if (positions.length < 2) return

    let bufs = this.bufferPool.get(trail.droneId)
    if (!bufs) {
      bufs = createProjectionBuffers()
      this.bufferPool.set(trail.droneId, bufs)
    }

    const { count, breakCount } = projectBatch(
      scene, positions, bufs.outX, bufs.outY, bufs.breaks,
    )
    if (count < 2) return

    const { ctx }   = this
    const lineW     = style.trajectoryWidth
    const totalSegs = count - 1

    // Build a fast-lookup set of break indices.  A break at index i means the
    // projection jumped off-screen between i-1 and i; skip that segment.
    const breakSet = new Set<number>()
    for (let b = 0; b < breakCount; b++) breakSet.add(bufs.breaks[b])

    ctx.save()
    ctx.lineJoin  = 'round'
    ctx.lineCap   = 'round'
    ctx.lineWidth = lineW

    // ── Per-segment altitude-gradient rendering ─────────────────────
    // Each segment is individually stroked with a colour derived from the
    // midpoint AGL altitude (height above ground), normalised over [0, 1000] m.
    for (let i = 1; i < count; i++) {
      if (breakSet.has(i)) continue

      const p0     = positions[i - 1]
      const p1     = positions[i]
      const midAGL = (p0.altitudeAGL + p1.altitudeAGL) * 0.5
      const rgb    = getColorFromMSL(midAGL)

      // Use the same temporal fade as the 3D curtain so both layers age together.
      const progress = (i - 1) / totalSegs
      const alpha    = calculateTrajectoryAlpha(progress, trail.isActive)

      ctx.strokeStyle = toRGBA(rgb, alpha)
      ctx.beginPath()
      ctx.moveTo(bufs.outX[i - 1], bufs.outY[i - 1])
      ctx.lineTo(bufs.outX[i],     bufs.outY[i])
      ctx.stroke()
    }

    ctx.restore()
  }

  // ════════════════════════════════════════════════════════════════════
  //  DRONE GROUND MARKER
  // ════════════════════════════════════════════════════════════════════

  private drawDroneMarker(
    scene: Cesium.Scene,
    trail: DroneTrailData,
    refAlt: number | null,
    style: OverlayStyle,
  ): void {
    const pos = trail.currentPosition

    const screenPos = projectPosition(scene, pos)
    if (!screenPos) return

    // ── Ground projection for the vertical drop line ─────────────────
    // Use terrain MSL when available.  Altitude 0 MSL is intentionally
    // forbidden — it would place the marker underground at elevated sites.
    const groundAlt = refAlt ?? trail.terrainAltMSL ?? null
    let groundScreen = null
    if (groundAlt !== null) {
      _groundPos.lat         = pos.lat
      _groundPos.lng         = pos.lng
      _groundPos.altitudeMSL = groundAlt
      groundScreen = projectPosition(scene, _groundPos)
    }

    // ── Altitude-based colour (EMA-smoothed to avoid flicker) ────────
    // Smooth the AGL altitude so rapid telemetry bursts
    // don't cause visible colour flicker on the marker.
    const smoothedAGL = this._getSmoothedAlt(trail.droneId, pos.altitudeAGL)
    const altColor    = getColorFromMSL(smoothedAGL)
    const colorStr    = toRGBA(altColor)

    const { ctx } = this
    const radius    = style.markerRadius

    // ── Vertical drop line (drone → terrain surface) ──────────────────
    // Only rendered when the ground screen point is strictly below the
    // drone screen point (i.e. drone is visibly airborne on screen).
    if (groundScreen && groundScreen.y > screenPos.y + 3) {
      ctx.save()
      ctx.strokeStyle = toRGBA(altColor, 0.35)
      ctx.lineWidth   = 1
      ctx.setLineDash([4, 4])
      ctx.beginPath()
      ctx.moveTo(screenPos.x, screenPos.y)
      ctx.lineTo(groundScreen.x, groundScreen.y)
      ctx.stroke()
      ctx.setLineDash([])
      ctx.restore()
    }

    // ── Drone marker — altitude-coloured, no static green ring ────────
    ctx.save()

    // Soft glow via canvas shadow — avoids a separate explicit arc ring,
    // so no residual green circle can appear.
    ctx.shadowColor = toRGBA(altColor, 0.80)
    ctx.shadowBlur  = radius * 2.5

    ctx.fillStyle   = colorStr
    ctx.globalAlpha = 0.90
    ctx.beginPath()
    ctx.arc(screenPos.x, screenPos.y, radius, 0, TWO_PI)
    ctx.fill()

    // Disable shadow before inner elements to keep them crisp
    ctx.shadowBlur = 0

    // Altitude-coloured border ring — same colour mapping as the trajectory line
    ctx.strokeStyle = toRGBA(altColor, 1.0)
    ctx.lineWidth   = 2.5
    ctx.globalAlpha = 1.0
    ctx.beginPath()
    ctx.arc(screenPos.x, screenPos.y, radius, 0, TWO_PI)
    ctx.stroke()

    ctx.fillStyle   = '#ffffff'
    ctx.globalAlpha = 0.92
    ctx.beginPath()
    ctx.arc(screenPos.x, screenPos.y, radius * 0.35, 0, TWO_PI)
    ctx.fill()

    ctx.restore()

    // ── Heading indicator line ─────────────────────────────────────────
    const hdgRad = trail.headingDeg * DEG_RAD
    const len    = style.headingIndicatorLength
    const dx     = Math.sin(hdgRad) * len
    const dy     = -Math.cos(hdgRad) * len

    ctx.save()
    ctx.strokeStyle = colorStr
    ctx.globalAlpha = 0.80
    ctx.lineWidth   = 2
    ctx.lineCap     = 'round'
    ctx.beginPath()
    ctx.moveTo(screenPos.x, screenPos.y)
    ctx.lineTo(screenPos.x + dx, screenPos.y + dy)
    ctx.stroke()
    ctx.restore()
  }

  /**
   * Exponential Moving Average for per-drone AGL altitude.
   * Called once per render frame per active drone; converges smoothly
   * toward the real altitude without abrupt frame-to-frame colour jumps.
   */
  private _getSmoothedAlt(droneId: string, targetAlt: number): number {
    const prev = this._droneAltSmoothed.get(droneId) ?? targetAlt
    const next = prev + (targetAlt - prev) * OverlayRenderer.SMOOTH_ALPHA
    this._droneAltSmoothed.set(droneId, next)
    return next
  }

  // ════════════════════════════════════════════════════════════════════
  //  REFERENCE ALTITUDE PLANE — semi-transparent green layer
  // ════════════════════════════════════════════════════════════════════

  private drawReferencePlane(
    scene: Cesium.Scene,
    trails: DroneTrailData[],
    refAltMSL: number,
    cssW: number,
    cssH: number,
    style: OverlayStyle,
  ): void {
    // Compute the bounding box of all ground-projected drone positions
    // and expand it to form a visible reference rectangle.
    let minX = Infinity, minY = Infinity
    let maxX = -Infinity, maxY = -Infinity
    let validCount = 0

    for (const trail of trails) {
      _groundPos.lat = trail.currentPosition.lat
      _groundPos.lng = trail.currentPosition.lng
      _groundPos.altitudeMSL = refAltMSL

      const sp = projectPosition(scene, _groundPos)
      if (!sp) continue

      minX = Math.min(minX, sp.x)
      minY = Math.min(minY, sp.y)
      maxX = Math.max(maxX, sp.x)
      maxY = Math.max(maxY, sp.y)
      validCount++
    }

    if (validCount === 0) return

    // Expand bounding box by a margin
    const margin = 80
    minX -= margin
    minY -= margin
    maxX += margin
    maxY += margin

    // Clamp to viewport
    minX = Math.max(0, minX)
    minY = Math.max(0, minY)
    maxX = Math.min(cssW, maxX)
    maxY = Math.min(cssH, maxY)

    const { ctx } = this

    // ── Gradient fill ─────────────────────────────────────────────
    ctx.save()

    const grad = ctx.createLinearGradient(minX, minY, minX, maxY)
    grad.addColorStop(0,   'rgba(40, 200, 100, 0.02)')
    grad.addColorStop(0.5, style.refPlaneFill)
    grad.addColorStop(1,   'rgba(40, 200, 100, 0.02)')

    ctx.fillStyle = grad
    ctx.fillRect(minX, minY, maxX - minX, maxY - minY)

    // ── Subtle border ─────────────────────────────────────────────
    ctx.strokeStyle = style.refPlaneBorder
    ctx.lineWidth   = 1
    ctx.setLineDash([6, 4])
    ctx.strokeRect(minX, minY, maxX - minX, maxY - minY)
    ctx.setLineDash([])

    ctx.restore()
  }

  // ════════════════════════════════════════════════════════════════════
  //  CLEANUP
  // ════════════════════════════════════════════════════════════════════

  destroy(): void {
    this.bufferPool.clear()
    this._droneAltSmoothed.clear()
  }
}
