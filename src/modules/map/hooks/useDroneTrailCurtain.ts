/* ═══════════════════════════════════════════════════════════════════════
   useDroneTrailCurtain — Dynamic 3D altitude curtain (vertical wall mesh)

   Architecture: Primitive API + WallGeometry + custom Fabric GLSL material

   Why Primitive over Entity:
   ─────────────────────────
   • Custom per-pixel gradient shader requires MaterialAppearance → Primitive API
   • Synchronous geometry build (asynchronous: false) prevents 1-frame flicker
   • Direct scene.primitives.add/remove avoids Entity System overhead

   Update strategy:
   ────────────────
   • scene.preRender listener checks trail growth each frame — O(1) per drone
   • Wall geometry rebuilds when the visible trail receives a new point
   • Previous primitives are retired after the next rendered frame
   • Sliding window matches the canvas trajectory window
   • Per-point terrain heights stored in a parallel array for accurate ground level
   ═══════════════════════════════════════════════════════════════════════ */

import { useEffect, useRef } from 'react'
import * as Cesium from 'cesium'
import {
  TRAIL_FADE_OLDEST_FACTOR,
  calculateTrailHistoryTrimCount,
  calculateTrailWindowStartIndex,
  shouldRenderTrailCurtain,
  shouldRebuildTrailCurtain,
} from '../components/scene3d/trailVisualSync'
import {
  createTrailCurtainMaterial,
  createTrailCurtainTextureCanvas,
  queueTrailCurtainPrimitiveReplacement,
  removeQueuedTrailCurtainPrimitives,
} from './trailCurtainRendering'

// ── Performance constants ─────────────────────────────────────────────

/** Small height offset above terrain surface to prevent z-fighting at the base */
const TERRAIN_OFFSET_M = 0.5

// ── Custom GLSL material ──────────────────────────────────────────────
//
//  materialInput.st mapping for Cesium WallGeometry:
//    s = 0..1 along wall length (first position → last position)
//    t = 0..1 vertically       (minimumHeight → maximumHeight)
//
//  Design:
//    • smoothstep + pow gives a non-linear, band-free vertical gradient
//    • Bottom-edge glow anchors the curtain near terrain level
//    • Temporal fade dims older segments (s ≈ 0) for directional depth
//    • Anti-banding: smooth continuous functions + 8-bit-friendly alpha range

const CURTAIN_GLSL = /* glsl */ `
uniform sampler2D colorRamp;

czm_material czm_getMaterial(czm_materialInput materialInput) {
  czm_material material = czm_getDefaultMaterial(materialInput);

  float t = materialInput.st.t;   // 0 = ground, 1 = trajectory altitude
  float s = materialInput.st.s;   // 0 = oldest point, 1 = newest

  // ── Vertical gradient: opaque at bottom, transparent toward top ──
  float gradient = 1.0 - smoothstep(0.0, 0.9, t);
  gradient = pow(gradient, 0.6);

  // ── Bottom-edge glow (subtle brightness boost near terrain line) ──
  float glow = (1.0 - smoothstep(0.0, 0.18, t)) * 0.24;

  // ── Temporal fade: dim older trail segments, strengthen newest side ──
  float temporal = mix(${TRAIL_FADE_OLDEST_FACTOR.toFixed(2)}, 1.0, s);

  // ── Altitude-based colour from 1D ramp texture ──
  vec3 baseColor = texture(colorRamp, vec2(s, 0.5)).rgb;
  vec3 glowColor = mix(baseColor, vec3(1.0), 0.25);
  material.diffuse = mix(baseColor, glowColor, glow);

  // ── Final alpha: bottom-heavy gradient × temporal + anchored glow ──
  material.alpha = (gradient * 0.56 * temporal) + (glow * temporal);

  return material;
}
`

/** Shared Fabric type name; the texture uniform is supplied per material instance. */
const MATERIAL_TYPE = 'DroneTrailCurtainAltitude'

// ── Types ─────────────────────────────────────────────────────────────

interface CurtainState {
  primitive: Cesium.Primitive
  lastPointCount: number
  lastNewestPointKey: string
}

export interface UseDroneTrailCurtainParams {
  viewerRef: React.MutableRefObject<Cesium.Viewer | null>
  droneTrailRef: React.MutableRefObject<Map<string, Cesium.Cartesian3[]>>
  droneTerrainHeightCacheRef: React.MutableRefObject<Map<string, number>>
}

// ── Scratch objects (reused per frame to avoid GC pressure) ───────────
const _scratchCarto = new Cesium.Cartographic()

function createCartesianPointKey(point: Cesium.Cartesian3): string {
  return `${point.x}|${point.y}|${point.z}`
}

// ── Hook ──────────────────────────────────────────────────────────────

export function useDroneTrailCurtain({
  viewerRef,
  droneTrailRef,
  droneTerrainHeightCacheRef,
}: UseDroneTrailCurtainParams): void {
  /** droneId → current wall primitive + metadata */
  const stateRef = useRef(new Map<string, CurtainState>())
  const pendingRemovalPrimitiveRef = useRef<Cesium.Primitive[]>([])

  /** droneId → per-point terrain MSL heights (parallel to droneTrailRef arrays).
   *  Populated incrementally — each entry stores the terrain cache value
   *  at the time the trail point was first included in a wall rebuild. */
  const perPointTerrainRef = useRef(new Map<string, number[]>())

  useEffect(() => {
    const viewer = viewerRef.current
    if (!viewer || viewer.isDestroyed()) return

    // Capture refs inside the effect for safe cleanup
    const capturedViewer   = viewerRef.current
    const capturedStates   = stateRef.current
    const capturedTerrain  = perPointTerrainRef.current
    const capturedPendingRemovalPrimitives = pendingRemovalPrimitiveRef.current

    // ── Pre-render listener: monitor trails, rebuild walls when needed ──
    const removePreRenderListener = viewer.scene.preRender.addEventListener(() => {
      if (viewer.isDestroyed()) return

      const trails   = droneTrailRef.current
      const states   = stateRef.current
      const terrains = droneTerrainHeightCacheRef.current

      // ── Update / create curtains for each drone ──
      for (const [droneId, trail] of trails) {
        const existing = states.get(droneId)
        let ptTerrain = perPointTerrainRef.current.get(droneId)
        if (ptTerrain !== undefined) {
          const trimCount = calculateTrailHistoryTrimCount(ptTerrain.length, trail.length)
          if (trimCount > 0) {
            ptTerrain.splice(0, trimCount)
          }
        }

        if (!shouldRenderTrailCurtain(trail.length)) {
          if (existing !== undefined) {
            viewer.scene.primitives.remove(existing.primitive)
            states.delete(droneId)
          }
          if (trail.length === 0) {
            perPointTerrainRef.current.delete(droneId)
          }
          continue
        }

        const newestPoint = trail[trail.length - 1]
        if (!newestPoint) continue
        const newestPointKey = createCartesianPointKey(newestPoint)

        // Don't rebuild unless the visible trail changed.
        if (
          existing
          && !shouldRebuildTrailCurtain(
            existing.lastPointCount,
            trail.length,
            existing.lastNewestPointKey,
            newestPointKey,
          )
        ) continue

        // Wait until terrain height is available (avoids wall sinking below terrain)
        const terrainH = terrains.get(droneId)
        if (terrainH === undefined) continue

        // ── Sliding window: keep only the most recent points ──
        const startIdx = calculateTrailWindowStartIndex(trail.length)
        const count    = trail.length - startIdx

        // ── Maintain per-point terrain heights ──
        if (ptTerrain === undefined) {
          ptTerrain = []
          perPointTerrainRef.current.set(droneId, ptTerrain)
        }
        while (ptTerrain.length < trail.length) {
          ptTerrain.push(terrainH)
        }

        // ── Build WallGeometry arrays ──
        const positions:  Cesium.Cartesian3[] = new Array(count)
        const maxHeights: number[]            = new Array(count)
        const minHeights: number[]            = new Array(count)
        const aglAlts:    number[]            = new Array(count)

        for (let i = 0; i < count; i++) {
          const idx = startIdx + i
          Cesium.Cartographic.fromCartesian(
            trail[idx], Cesium.Ellipsoid.WGS84, _scratchCarto,
          )
          // Wall positions carry lat/lng; heights are overridden by max/min arrays
          positions[i]  = Cesium.Cartesian3.fromRadians(
            _scratchCarto.longitude, _scratchCarto.latitude,
          )
          maxHeights[i] = _scratchCarto.height
          minHeights[i] = ptTerrain[idx] + TERRAIN_OFFSET_M
          // AGL altitude for colour mapping (MSL top - terrain)
          aglAlts[i]    = Math.max(0, _scratchCarto.height - ptTerrain[idx])
        }

        // ── Create geometry ──
        const geometry = Cesium.WallGeometry.createGeometry(
          new Cesium.WallGeometry({
            positions,
            maximumHeights: maxHeights,
            minimumHeights: minHeights,
          }),
        )
        if (!geometry) continue

        // ── Build 1D colour ramp texture from per-point AGL altitudes ──
        const rampCanvas = createTrailCurtainTextureCanvas(
          aglAlts,
          count,
          () => document.createElement('canvas'),
        )

        // ── Build Primitive with altitude-coloured gradient material ──
        const primitive = new Cesium.Primitive({
          geometryInstances: new Cesium.GeometryInstance({ geometry }),
          appearance: new Cesium.MaterialAppearance({
            material: createTrailCurtainMaterial(MATERIAL_TYPE, CURTAIN_GLSL, rampCanvas),
            translucent: true,
            flat: true,       // No lighting — pure emissive look
            faceForward: true, // Normals always face camera (both-side visibility)
            closed: false,
          }),
          asynchronous: false, // Synchronous build prevents 1-frame flicker
        })

        // Keep the previous primitive alive until postRender so texture uploads
        // cannot produce a visible blank frame during mission updates.
        queueTrailCurtainPrimitiveReplacement(
          viewer.scene.primitives,
          pendingRemovalPrimitiveRef.current,
          primitive,
          existing?.primitive ?? null,
        )
        states.set(droneId, {
          primitive,
          lastPointCount: trail.length,
          lastNewestPointKey: newestPointKey,
        })
      }

      // ── Remove curtains for drones that no longer exist ──
      for (const [droneId, state] of states) {
        if (!trails.has(droneId)) {
          viewer.scene.primitives.remove(state.primitive)
          states.delete(droneId)
          perPointTerrainRef.current.delete(droneId)
        }
      }
    })

    const removePostRenderListener = viewer.scene.postRender.addEventListener(() => {
      if (viewer.isDestroyed()) return
      removeQueuedTrailCurtainPrimitives(
        viewer.scene.primitives,
        pendingRemovalPrimitiveRef.current,
      )
    })

    // ── Cleanup on unmount ──
    return () => {
      removePreRenderListener()
      removePostRenderListener()
      for (const [, state] of capturedStates) {
        if (capturedViewer && !capturedViewer.isDestroyed()) {
          capturedViewer.scene.primitives.remove(state.primitive)
        }
      }
      for (const primitive of capturedPendingRemovalPrimitives) {
        if (capturedViewer && !capturedViewer.isDestroyed()) {
          capturedViewer.scene.primitives.remove(primitive)
        }
      }
      capturedStates.clear()
      capturedTerrain.clear()
      capturedPendingRemovalPrimitives.length = 0
    }
  }, [droneTerrainHeightCacheRef, droneTrailRef, viewerRef])
}
