/* ═══════════════════════════════════════════════════════════════
   useCesiumOverlay — React hook for 2D canvas overlay on Cesium
   ═══════════════════════════════════════════════════════════════

   This hook creates and manages a transparent Canvas 2D overlay
   positioned exactly on top of the Cesium viewer, synchronized
   with its render loop via scene.postRender.

   Architecture:
     ┌────────────────────┐
     │   Cesium Viewer    │  ← 3D globe, entities, terrain
     ├────────────────────┤
     │  Canvas Overlay    │  ← 2D lines, markers, reference plane
     │  (pointer-events:  │     • Trajectory polylines
     │     none)          │     • Ground-projected markers
     └────────────────────┘     • Altitude reference plane

   Projection pipeline:
     GeoPosition (lat/lng/alt)
       → Cesium.Cartesian3 (ECEF)
       → SceneTransforms.worldToWindowCoordinates
       → Canvas 2D screen coordinates (CSS px)

   Render loop:
     viewer.scene.postRender → OverlayRenderer.draw()
     • Fires once per Cesium frame (up to 60 Hz)
     • Camera-synchronised by definition
     • Zero React re-renders in the hot path

   Performance:
     • Pre-allocated Float64Array projection buffers (per drone)
     • Single canvas beginPath/stroke per polyline
     • No heap allocation inside the render callback
     • ResizeObserver for responsive canvas sizing

   ═══════════════════════════════════════════════════════════════ */

import { useEffect, useRef, useCallback } from 'react'
import type * as Cesium from 'cesium'
import { OverlayRenderer } from './OverlayRenderer'
import type { DroneTrailData, OverlayStyle } from './types'
import { DEFAULT_OVERLAY_STYLE } from './types'

interface UseCesiumOverlayOptions {
  /** Ref to the Cesium viewer instance (may be null before init). */
  viewerRef: React.RefObject<Cesium.Viewer | null>
  /** The container element that the Cesium viewer renders into. */
  containerRef: React.RefObject<HTMLDivElement | null>
  /** Whether the overlay is enabled. */
  enabled?: boolean
  /** Visual style overrides. */
  style?: Partial<OverlayStyle>
  /** Reference altitude MSL for the green plane. Null to hide. */
  refAltitudeMSL?: number | null
}

/**
 * Creates and manages a 2D Canvas overlay on top of the Cesium viewer.
 *
 * Returns a stable `updateTrails` function that should be called whenever
 * drone trail data changes.  The overlay itself redraws automatically on
 * every Cesium frame via postRender — `updateTrails` simply updates the
 * data reference (zero-copy swap, no cloning).
 */
export function useCesiumOverlay({
  viewerRef,
  containerRef,
  enabled = true,
  style: styleOverrides,
  refAltitudeMSL = null,
}: UseCesiumOverlayOptions) {
  // ── Refs for hot-path data (no React state → no re-renders) ─────────
  const canvasRef    = useRef<HTMLCanvasElement | null>(null)
  const rendererRef  = useRef<OverlayRenderer | null>(null)
  const trailsRef    = useRef<DroneTrailData[]>([])
  const refAltRef    = useRef<number | null>(refAltitudeMSL)
  const styleRef     = useRef<OverlayStyle>(DEFAULT_OVERLAY_STYLE)
  const enabledRef   = useRef(enabled)

  // Keep refs current without triggering re-renders
  useEffect(() => { refAltRef.current = refAltitudeMSL }, [refAltitudeMSL])
  useEffect(() => { enabledRef.current = enabled }, [enabled])
  useEffect(() => {
    styleRef.current = styleOverrides
      ? { ...DEFAULT_OVERLAY_STYLE, ...styleOverrides }
      : DEFAULT_OVERLAY_STYLE
  }, [styleOverrides])

  // ── Stable callback for trail data updates ──────────────────────────
  const updateTrails = useCallback((trails: DroneTrailData[]) => {
    trailsRef.current = trails
  }, [])

  // ── Main effect: create canvas, bind to Cesium render loop ──────────
  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    // Create the overlay canvas
    const canvas = document.createElement('canvas')
    canvas.style.position      = 'absolute'
    canvas.style.top           = '0'
    canvas.style.left          = '0'
    canvas.style.width         = '100%'
    canvas.style.height        = '100%'
    canvas.style.pointerEvents = 'none'
    canvas.style.zIndex        = '10'
    container.appendChild(canvas)
    canvasRef.current = canvas

    // Create renderer
    const renderer = new OverlayRenderer(canvas)
    rendererRef.current = renderer

    // Initial sizing
    const rect = container.getBoundingClientRect()
    renderer.resize(rect.width, rect.height)

    // ── ResizeObserver — keeps canvas matched to container ────────────
    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect
        if (width > 0 && height > 0) {
          renderer.resize(width, height)
        }
      }
    })
    resizeObserver.observe(container)

    // ── postRender listener — binds lazily when viewer becomes available ─
    let removeListener: (() => void) | null = null
    let rafId = 0

    const onPostRender = () => {
      const viewer = viewerRef.current
      if (!viewer || viewer.isDestroyed()) return
      if (!enabledRef.current) {
        const ctx = canvas.getContext('2d')
        const dpr = Math.min(window.devicePixelRatio, 2)
        ctx?.clearRect(0, 0, canvas.width / dpr, canvas.height / dpr)
        return
      }

      renderer.draw(
        viewer.scene,
        trailsRef.current,
        refAltRef.current,
        styleRef.current,
      )
    }

    // Poll for viewer availability (it may not exist on first mount)
    const tryBind = () => {
      const viewer = viewerRef.current
      if (viewer && !viewer.isDestroyed()) {
        removeListener = viewer.scene.postRender.addEventListener(onPostRender) as unknown as () => void
      } else {
        rafId = requestAnimationFrame(tryBind)
      }
    }
    tryBind()

    // ── Cleanup ───────────────────────────────────────────────────────
    return () => {
      cancelAnimationFrame(rafId)
      if (removeListener) {
        removeListener()
      }
      resizeObserver.disconnect()
      renderer.destroy()
      rendererRef.current = null
      if (canvas.parentNode) {
        canvas.parentNode.removeChild(canvas)
      }
      canvasRef.current = null
    }
  }, [containerRef, viewerRef])

  return { updateTrails }
}
