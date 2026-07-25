/* ═══════════════════════════════════════════════════════════════════════════
   useDroneCamera — Unified 3D camera mode controller for CesiumJS
   ═══════════════════════════════════════════════════════════════════════════

   Manages three camera modes in the Cesium 3D viewer:

     FREE         — Default Cesium interaction (pan / rotate / zoom).
     AUTO_CENTER  — Snaps back to the active drone after operator inactivity.
     FPV          — First-Person-View: camera is locked to the drone's
                    heading/pitch/roll with a small forward+up offset,
                    simulating an on-board camera feed.

   Architecture
   ────────────
   A single useEffect reacts to (cameraMode, activeDroneId). It:
     1. Keeps Cesium's default camera controller available for manual movement.
     2. Registers a scene.preRender listener that runs every frame
        and positions the camera according to the active mode.
     3. Cleans up everything on mode change or unmount.

   Smoothing (FPV)
   ────────────────
   Raw euler angles from telemetry can produce jitter. We apply
   exponential smoothing (lerp-based) on heading/pitch/roll before
   feeding them to the camera. The smoothing factor (alpha) is tuned
   for 60fps but works at any framerate since we use a fixed alpha
   per sample — adequate for the ~10-30 Hz telemetry update rate.

   ═══════════════════════════════════════════════════════════════════════════ */

import { useEffect, useRef, useState, type MutableRefObject } from 'react'
import * as Cesium from 'cesium'
import { useDroneStore } from '../../drone'
import { useUIStore } from '../../../shared/store/uiStore'
import { resolveHumanPauseUntilMs } from '../components/mapCameraPolicy'

/* ── Configuration ────────────────────────────────────────────────────────── */

/** FPV camera offset from drone center (metres, in drone-local frame). */
const FPV_OFFSET_FORWARD = 0.5  // slightly ahead of the drone
const FPV_OFFSET_UP      = 0.3  // slightly above (camera dome position)

/** Clamp FPV pitch to avoid extreme values (radians). */
const FPV_PITCH_MIN = Cesium.Math.toRadians(-85) // almost straight down
const FPV_PITCH_MAX = Cesium.Math.toRadians(45)  // looking up 45°

/** Smoothing factor for FPV orientation (0 = no smoothing, 1 = instant).
 *  Lower values = smoother but more lag. 0.15 feels cinematic. */
const FPV_SMOOTH_ALPHA = 0.15

const AUTO_CENTER_HUMAN_IDLE_MS = 2500

/* ── Types ── */

interface UseDroneCameraOptions {
  /** Ref to the Cesium Viewer — null before init. */
  viewerRef: MutableRefObject<Cesium.Viewer | null>
  /** Terrain height cache — drone altitude is AGL, need MSL for Cesium. */
  terrainHeightCache: MutableRefObject<Map<string, number>>
  /**
   * When provided, overrides the global uiStore cameraMode.
   * Used by the FPV sidebar panel to force its viewer into FPV mode
   * without mutating the main map's camera state.
   */
  overrideMode?: import('../../../shared/store/uiStore').CameraMode
}

/* ── Helpers ────────────────────────────────────────────────────────────── */

/** Linearly interpolate between two angles handling wraparound (radians). */
function lerpAngle(from: number, to: number, alpha: number): number {
  // Shortest angular distance
  let diff = to - from
  // Wrap to [-PI, PI]
  while (diff > Math.PI) diff -= 2 * Math.PI
  while (diff < -Math.PI) diff += 2 * Math.PI
  return from + diff * alpha
}

/** Clamp a value between min and max. */
function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v))
}

function isPauseActive(pauseUntilMs: number | null, nowMs: number): boolean {
  if (pauseUntilMs === null) return false
  return nowMs < pauseUntilMs
}

/* ── Hook ──────────────────────────────────────────────────────────────── */

export function useDroneCamera({
  viewerRef,
  terrainHeightCache,
  overrideMode,
}: UseDroneCameraOptions) {

  const storeCameraMode = useUIStore((s) => s.cameraMode)
  const autoCenterPauseUntilMs = useUIStore((s) => s.autoCenterPauseUntilMs)
  const setAutoCenterPauseUntilMs = useUIStore((s) => s.setAutoCenterPauseUntilMs)
  const [pauseClockMs, setPauseClockMs] = useState(() => Date.now())
  const cameraMode      = overrideMode ?? storeCameraMode
  const autoCenterPaused = cameraMode === 'AUTO_CENTER' &&
    isPauseActive(autoCenterPauseUntilMs, pauseClockMs)
  const effectiveCameraMode = autoCenterPaused ? 'FREE' : cameraMode
  const activeDroneId   = useDroneStore((s) =>
    Object.values(s.drones).find((d) => d.active)?.id ?? null,
  )
  const autoCenterPauseUntilMsRef = useRef<number | null>(autoCenterPauseUntilMs)
  const humanCameraInteractionActiveRef = useRef(false)

  /* Smoothed FPV orientation — persists across frames within one FPV session. */
  const smoothRef = useRef<{
    heading: number
    pitch:   number
    roll:    number
  } | null>(null)

  useEffect(() => {
    autoCenterPauseUntilMsRef.current = autoCenterPauseUntilMs
  }, [autoCenterPauseUntilMs])

  useEffect(() => {
    if (autoCenterPauseUntilMs === null) return

    const delayMs = Math.max(0, autoCenterPauseUntilMs - Date.now())
    const timeoutId = window.setTimeout(() => {
      const nowMs = Date.now()
      if (humanCameraInteractionActiveRef.current) {
        const pauseUntilMs = resolveHumanPauseUntilMs({
          humanInteractionAtMs: nowMs,
          idleDelayMs: AUTO_CENTER_HUMAN_IDLE_MS,
        })
        autoCenterPauseUntilMsRef.current = pauseUntilMs
        setPauseClockMs(nowMs)
        setAutoCenterPauseUntilMs(pauseUntilMs)
        return
      }

      setPauseClockMs(nowMs)
    }, delayMs)
    return () => window.clearTimeout(timeoutId)
  }, [autoCenterPauseUntilMs, setAutoCenterPauseUntilMs])

  useEffect(() => {
    const viewer = viewerRef.current
    if (!viewer || viewer.isDestroyed()) return
    if (cameraMode !== 'AUTO_CENTER') return

    const canvas = viewer.canvas
    const pauseAutoCenter = (): void => {
      const nowMs = Date.now()
      const pauseUntilMs = resolveHumanPauseUntilMs({
        humanInteractionAtMs: nowMs,
        idleDelayMs: AUTO_CENTER_HUMAN_IDLE_MS,
      })
      autoCenterPauseUntilMsRef.current = pauseUntilMs
      setPauseClockMs(nowMs)
      setAutoCenterPauseUntilMs(pauseUntilMs)
    }
    const beginAutoCenterPause = (): void => {
      humanCameraInteractionActiveRef.current = true
      pauseAutoCenter()
    }
    const endAutoCenterPause = (): void => {
      humanCameraInteractionActiveRef.current = false
      pauseAutoCenter()
    }
    const handlePointerMove = (event: PointerEvent): void => {
      if (event.pointerType === 'mouse' && event.buttons === 0) return
      pauseAutoCenter()
    }

    canvas.addEventListener('pointerdown', beginAutoCenterPause, true)
    canvas.addEventListener('pointermove', handlePointerMove, true)
    canvas.addEventListener('pointerup', endAutoCenterPause, true)
    canvas.addEventListener('pointercancel', endAutoCenterPause, true)
    canvas.addEventListener('wheel', pauseAutoCenter, true)

    return () => {
      canvas.removeEventListener('pointerdown', beginAutoCenterPause, true)
      canvas.removeEventListener('pointermove', handlePointerMove, true)
      canvas.removeEventListener('pointerup', endAutoCenterPause, true)
      canvas.removeEventListener('pointercancel', endAutoCenterPause, true)
      canvas.removeEventListener('wheel', pauseAutoCenter, true)
    }
  }, [cameraMode, setAutoCenterPauseUntilMs, viewerRef])

  useEffect(() => {
    const viewer = viewerRef.current
    if (!viewer || viewer.isDestroyed()) return
    if (effectiveCameraMode === 'FREE' || activeDroneId == null) {
      // FREE mode — ensure Cesium controls are re-enabled
      viewer.scene.screenSpaceCameraController.enableInputs = true
      return
    }

    viewer.scene.screenSpaceCameraController.enableInputs = true

    const getDronePosition = (): {
      cartesian: Cesium.Cartesian3
      heading: number
      pitch: number
      roll: number
    } | null => {
      const drone = useDroneStore.getState().drones[activeDroneId]
      if (!drone) return null

      // Use terrain height + AGL for the camera position.
      // terrainHeightCache is pre-initialised with a rough estimate and updated
      // asynchronously by CesiumGlobe, so this is accurate once terrain loads
      // and avoids placing the camera underground (which causes an upside-down view).
      const alt = (terrainHeightCache.current.get(activeDroneId) ?? 0) + drone.altitude

      return {
        cartesian: Cesium.Cartesian3.fromDegrees(drone.lng, drone.lat, alt),
        heading: Cesium.Math.toRadians(drone.yaw   ?? 0),
        pitch:   Cesium.Math.toRadians(drone.pitch  ?? 0),
        roll:    Cesium.Math.toRadians(drone.roll   ?? 0),
      }
    }

    /* ═════════════════════════════════════════════════════════════════════
       AUTO_CENTER MODE
       ═══════════════════════════════════════════════════════════════════ */
    if (effectiveCameraMode === 'AUTO_CENTER') {
      // Mutable offset — range is modified by the custom wheel handler
      const offset = new Cesium.HeadingPitchRange(
        0,
        Cesium.Math.toRadians(-45),
        300,
      )

      // Initial snap
      const t0 = getDronePosition()
      if (t0) viewer.camera.lookAt(t0.cartesian, offset)

      // Per-frame follow
      const removePreRender = viewer.scene.preRender.addEventListener(() => {
        if (isPauseActive(autoCenterPauseUntilMsRef.current, Date.now())) return
        const data = getDronePosition()
        if (data) viewer.camera.lookAt(data.cartesian, offset)
      })

      return () => {
        removePreRender()
        if (!viewer.isDestroyed()) {
          viewer.scene.screenSpaceCameraController.enableInputs = true
          viewer.camera.lookAtTransform(Cesium.Matrix4.IDENTITY)
        }
      }
    }

    /* ═════════════════════════════════════════════════════════════════════
       FPV MODE
       ═══════════════════════════════════════════════════════════════════ */
    if (effectiveCameraMode === 'FPV') {
      // Reset smoothing state when entering FPV
      smoothRef.current = null

      const removePreRender = viewer.scene.preRender.addEventListener(() => {
        const data = getDronePosition()
        if (!data) return

        const { cartesian, heading, pitch, roll } = data

        /* ── 1. Smooth the orientation ─────────────────────────────────
           Apply exponential smoothing (lerp) per frame.
           On the first frame we seed with the raw values (no lag). */
        if (!smoothRef.current) {
          smoothRef.current = { heading, pitch, roll }
        } else {
          smoothRef.current.heading = lerpAngle(smoothRef.current.heading, heading, FPV_SMOOTH_ALPHA)
          smoothRef.current.pitch   = lerpAngle(smoothRef.current.pitch,   pitch,   FPV_SMOOTH_ALPHA)
          smoothRef.current.roll    = lerpAngle(smoothRef.current.roll,    roll,    FPV_SMOOTH_ALPHA)
        }

        const sH = smoothRef.current.heading
        const sP = clamp(smoothRef.current.pitch, FPV_PITCH_MIN, FPV_PITCH_MAX)
        const sR = smoothRef.current.roll

        /* ── 2. Compute the local-to-world transform at the drone position ─
           Cesium.Transforms.eastNorthUpToFixedFrame gives us a 4×4 matrix
           where +X = East, +Y = North, +Z = Up at the drone's location.
           We use this as the base frame for applying the drone's HPR.   */
        const enuTransform = Cesium.Transforms.eastNorthUpToFixedFrame(cartesian)

        /* ── 3. Build the HPR rotation matrix in ENU frame ─────────────
           CesiumJS heading: 0 = North (Y), clockwise.
           We construct a rotation Matrix3 from the smoothed HPR
           then convert to Matrix4 and compose with the ENU transform. */
        const hpr       = new Cesium.HeadingPitchRoll(sH, sP, sR)
        const rotation3 = Cesium.Matrix3.fromHeadingPitchRoll(hpr)
        const rotation4 = Cesium.Matrix4.fromRotationTranslation(rotation3)

        // droneTransform = ENU * rotation — full world transform of the drone
        const droneTransform = Cesium.Matrix4.multiply(
          enuTransform, rotation4, new Cesium.Matrix4(),
        )

        /* ── 4. Compute the camera offset in drone-local frame ─────────
           "Forward" in CesiumJS HPR convention = +Y (North in ENU before rotation).
           "Up" = +Z.
           We push the camera slightly forward and up from the drone center. */
        const localOffset = new Cesium.Cartesian3(
          0,                // no lateral offset
          FPV_OFFSET_FORWARD,
          FPV_OFFSET_UP,
        )

        // Transform the local offset into world coordinates
        const worldOffset = Cesium.Matrix4.multiplyByPoint(
          droneTransform, localOffset, new Cesium.Cartesian3(),
        )

        /* ── 5. Set the camera view ───────────────────────────────────
           camera.setView positions the camera at the computed world
           point and orients it with the smoothed heading/pitch/roll.
           This runs every frame — smooth, jitter-free FPV feed.       */
        viewer.camera.setView({
          destination: worldOffset,
          orientation: {
            heading: sH,
            pitch:   sP,
            roll:    sR,
          },
        })
      })

      return () => {
        removePreRender()
        smoothRef.current = null
        if (!viewer.isDestroyed()) {
          viewer.scene.screenSpaceCameraController.enableInputs = true
        }
      }
    }

  }, [activeDroneId, effectiveCameraMode, terrainHeightCache, viewerRef])
}
