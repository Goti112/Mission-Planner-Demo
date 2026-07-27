import { useMemo, useCallback, useRef, useEffect, useState } from 'react'
import type { FC } from 'react'
import Map, { Marker } from 'react-map-gl/mapbox'
import type { MapRef } from 'react-map-gl/mapbox'
import type { MapMouseEvent } from 'react-map-gl/mapbox'
import type { ViewStateChangeEvent } from 'react-map-gl/mapbox'
import { useDroneStore } from '../../drone'
import { useUIStore } from '../../../shared/store/uiStore'

import WaypointMarker from './mission/WaypointMarker'
import MissionPathRenderer from './mission/MissionPathRenderer'
import AdvancedLayerRenderer from './mission/AdvancedLayerRenderer'
import DroneLeadLineRenderer from './mission/DroneLeadLineRenderer'
import DroneTrailRenderer from './mission/DroneTrailRenderer'
import MapFrameControl from './MapFrameControl'
import MapZoomControl from './MapZoomControl'
import AircraftMarker from './AircraftMarker'
import type { AdvancedLayerMapData, HomeMarkerData, WaypointMarkerData } from './mission/rendering/MissionRenderConfig'
import {
  HOME_ALT_COLOR,
  HOME_BORDER,
  HOME_COLOR,
} from './mission/rendering/MissionRenderConfig'
import { DEFAULT_MAP_VISUAL_POSE_CONFIG } from './visual/mapVisualPoseConfig'
import { MapVisualPoseBuffer } from './visual/MapVisualPoseBuffer'
import {
  isAutoCenterPaused,
  resolveAutoCenterTarget,
  resolveHumanPauseUntilMs,
  resolveProgrammaticCameraGuardUntilMs,
  shouldRecaptureAfterHumanPause,
  stableFleetMembershipKey,
  type MapBounds,
  type MapCameraPoint,
} from './mapCameraPolicy'

// Re-export so existing imports from MapContainer keep working
export type { AdvancedLayerMapData, WaypointMarkerData }

interface DroneMarker {
  id: string
  lat: number
  lng: number
  /** Altitude above ground level in metres (used for the altitude curtain). */
  altitudeM?: number
  yaw?: number
  name?: string
  active?: boolean
}

interface MapContainerProps {
  mapStyle: 'streets' | 'satellite' | 'hybrid' | 'dark'
  drones?: DroneMarker[]
  planningMode?: boolean
  onWaypointClick?: (coords: { lat: number; lng: number }) => void
  waypointMarkers?: WaypointMarkerData[]
  missionPath?: Array<{ lat: number; lng: number }>
  /** Called when drag starts on a waypoint — for controller notification */
  onWaypointDragStart?: (wpId: string) => void
  /** Called when the user drags a waypoint to a new position */
  onWaypointDrag?: (wpId: string, lat: number, lng: number) => void
  /** Called continuously while dragging — drives live path/stats preview */
  onWaypointDragMove?: (wpId: string, lat: number, lng: number) => void
  /** Currently selected waypoint id — highlighted with purple colour */
  selectedWpId?: string | null
  onWaypointSelect?: (wpId: string) => void
  readonly missionFramePoints?: readonly MapFramePoint[]
  readonly vehicleFramePoint?: MapFramePoint | null
  readonly homeFramePoint?: MapFramePoint | null
  readonly showFrameControl?: boolean
  advancedLayers?: AdvancedLayerMapData | null
  advancedLayerEditing?: boolean
  onFenceVertexDrag?: (fenceId: string, vertexIndex: number, lat: number, lng: number) => void
  onRallyDrag?: (rallyPointId: string, lat: number, lng: number) => void
  onSelectFence?: (fenceId: string, vertexIndex: number | null) => void
  onSelectRally?: (rallyPointId: string) => void
  cursor?: string
  /**
   * Drone-to-first-waypoint lead line shown before mission start.
   * Pass null/undefined to hide the line (e.g. when mission is running).
   */
  droneLeadLine?: {
    dronePos: { lat: number; lng: number }
    firstWpPos: { lat: number; lng: number }
  } | null
  homeMarker?: HomeMarkerData | null
  onHomeDrag?: (lat: number, lng: number) => void
}

const MAPBOX_STYLES: Record<string, string> = {
  streets: 'mapbox://styles/mapbox/streets-v11',
  satellite: 'mapbox://styles/mapbox/satellite-v9',
  hybrid: 'mapbox://styles/mapbox/satellite-streets-v11',
  dark: 'mapbox://styles/mapbox/dark-v11',
}

interface LatLng {
  lat: number
  lng: number
}

interface MapFramePoint {
  readonly lat: number
  readonly lng: number
}

interface DronePose extends LatLng {
  heading: number
  altitudeM: number
  timestampMs: number
}

interface PauseAutoCenterForProgrammaticCameraMoveInput {
  readonly durationMs: number
  readonly moveStartedAtMs: number
}

const POS_EPSILON_DEG = 0.0000002
const MAX_MAP_ZOOM = 22
const FLEET_ZOOM_PADDING_PX = 96
const AUTO_CENTER_HUMAN_IDLE_MS = 2500
const PROGRAMMATIC_CAMERA_GUARD_BUFFER_MS = 75

function normalizeHeadingDeg(value: number): number {
  const wrapped = value % 360
  return wrapped < 0 ? wrapped + 360 : wrapped
}

function isValidFramePoint(point: MapFramePoint | null | undefined): point is MapFramePoint {
  if (point == null) return false
  if (!Number.isFinite(point.lat) || !Number.isFinite(point.lng)) return false
  if (Math.abs(point.lat) > 90 || Math.abs(point.lng) > 180) return false
  return true
}

function getFrameBounds(points: readonly MapFramePoint[]): [[number, number], [number, number]] | null {
  const validPoints = points.filter(isValidFramePoint)
  if (validPoints.length < 2) return null

  let minLat = Infinity
  let maxLat = -Infinity
  let minLng = Infinity
  let maxLng = -Infinity

  for (const point of validPoints) {
    minLat = Math.min(minLat, point.lat)
    maxLat = Math.max(maxLat, point.lat)
    minLng = Math.min(minLng, point.lng)
    maxLng = Math.max(maxLng, point.lng)
  }

  if (
    !Number.isFinite(minLat) ||
    !Number.isFinite(maxLat) ||
    !Number.isFinite(minLng) ||
    !Number.isFinite(maxLng)
  ) {
    return null
  }

  const latSpan = maxLat - minLat
  const lngSpan = maxLng - minLng

  if (latSpan < POS_EPSILON_DEG && lngSpan < POS_EPSILON_DEG) {
    return null
  }

  return [
    [minLng, minLat],
    [maxLng, maxLat],
  ]
}

function getFleetBounds(drones: DroneMarker[]): MapBounds | null {
  const validDrones = drones.filter((drone) => isValidFramePoint(drone))
  if (validDrones.length < 2) return null

  let minLat = Infinity
  let maxLat = -Infinity
  let minLng = Infinity
  let maxLng = -Infinity

  for (const drone of validDrones) {
    minLat = Math.min(minLat, drone.lat)
    maxLat = Math.max(maxLat, drone.lat)
    minLng = Math.min(minLng, drone.lng)
    maxLng = Math.max(maxLng, drone.lng)
  }

  if (
    !Number.isFinite(minLat) ||
    !Number.isFinite(maxLat) ||
    !Number.isFinite(minLng) ||
    !Number.isFinite(maxLng)
  ) {
    return null
  }

  if (
    Math.abs(maxLat - minLat) < POS_EPSILON_DEG &&
    Math.abs(maxLng - minLng) < POS_EPSILON_DEG
  ) {
    return null
  }

  return [[minLng, minLat], [maxLng, maxLat]]
}

const MapContainer: FC<MapContainerProps> = ({
  mapStyle,
  drones = [],
  planningMode = false,
  onWaypointClick,
  waypointMarkers = [],
  missionPath = [],
  missionFramePoints = [],
  vehicleFramePoint,
  homeFramePoint,
  showFrameControl = false,
  onWaypointDragStart,
  onWaypointDrag,
  onWaypointDragMove,
  selectedWpId,
  onWaypointSelect,
  advancedLayers,
  advancedLayerEditing,
  onFenceVertexDrag,
  onRallyDrag,
  onSelectFence,
  onSelectRally,
  cursor,
  droneLeadLine,
  homeMarker,
  onHomeDrag,
}) => {
  const mapRef = useRef<MapRef>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  const autoCenter = useUIStore((s) => s.autoCenter)
  const sharedAutoCenterPauseUntilMs = useUIStore((s) => s.autoCenterPauseUntilMs)
  const sharedMapCenter = useUIStore((s) => s.sharedMapCenter)
  const map2DView = useUIStore((s) => s.map2DView)
  const setSharedAutoCenterPauseUntilMs = useUIStore((s) => s.setAutoCenterPauseUntilMs)
  const setSharedMapCenter = useUIStore((s) => s.setSharedMapCenter)
  const setMap2DView = useUIStore((s) => s.setMap2DView)
  const fleetBounds = useMemo(() => getFleetBounds(drones), [drones])
  const fleetBoundsRef = useRef<MapBounds | null>(fleetBounds)
  const fleetMembershipKey = useMemo(() => stableFleetMembershipKey(drones), [drones])
  const [fleetMaxZoom, setFleetMaxZoom] = useState<number | null>(null)
  const validMissionFramePoints = useMemo(
    () => missionFramePoints.filter(isValidFramePoint),
    [missionFramePoints],
  )
  const missionFrameBounds = useMemo(
    () => getFrameBounds(validMissionFramePoints),
    [validMissionFramePoints],
  )
  const validVehicleFramePoint = useMemo(
    () => (isValidFramePoint(vehicleFramePoint) ? vehicleFramePoint : null),
    [vehicleFramePoint],
  )
  const validHomeFramePoint = useMemo(
    () => (isValidFramePoint(homeFramePoint) ? homeFramePoint : null),
    [homeFramePoint],
  )
  const canZoomToMission = validMissionFramePoints.length === 1 || missionFrameBounds !== null
  const canZoomToVehicle = validVehicleFramePoint !== null
  const canZoomToHome = validHomeFramePoint !== null

  useEffect(() => {
    fleetBoundsRef.current = fleetBounds
  }, [fleetBounds])

  const recomputeFleetZoomLimit = useCallback(() => {
    const bounds = fleetBoundsRef.current

    if (!bounds) {
      setFleetMaxZoom(null)
      return
    }

    const map = mapRef.current?.getMap()
    if (!map) return

    const camera = map.cameraForBounds(bounds, {
      padding: FLEET_ZOOM_PADDING_PX,
      maxZoom: MAX_MAP_ZOOM,
      bearing: map.getBearing(),
      pitch: map.getPitch(),
    })
    const nextZoom = camera?.zoom

    if (typeof nextZoom !== 'number' || !Number.isFinite(nextZoom)) {
      setFleetMaxZoom(null)
      return
    }

    const quantizedZoom = Math.max(1, Math.min(MAX_MAP_ZOOM, Math.floor(nextZoom * 10) / 10))
    setFleetMaxZoom((prev) => (
      prev != null && Math.abs(prev - quantizedZoom) < 0.05 ? prev : quantizedZoom
    ))
  }, [])

  // Resize Mapbox canvas when the container changes size (e.g. sidebar toggle animation)
  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    const observer = new ResizeObserver(() => {
      mapRef.current?.getMap().resize()
      requestAnimationFrame(() => {
        recomputeFleetZoomLimit()
      })
    })
    observer.observe(container)
    return () => observer.disconnect()
  }, [recomputeFleetZoomLimit])

  useEffect(() => {
    recomputeFleetZoomLimit()
  }, [fleetMembershipKey, recomputeFleetZoomLimit])

  const activeDrone = useMemo(() => drones.find((d) => d.active) ?? null, [drones])
  const activeLat = activeDrone?.lat
  const activeLng = activeDrone?.lng
  const activeDroneId = activeDrone?.id
  const lastValidYawRef = useRef<Record<string, number>>({})
  const visualPoseBufferRef = useRef(new MapVisualPoseBuffer(DEFAULT_MAP_VISUAL_POSE_CONFIG))
  const [visualPoseByDrone, setVisualPoseByDrone] = useState<Record<string, DronePose>>({})

  const renderPoseByDrone = useMemo(() => {
    const nowMs = performance.now()
    const next: Record<string, DronePose> = {}

    for (const drone of drones) {
      const visualPose = visualPoseByDrone[drone.id]
      const fallbackHeading = typeof drone.yaw === 'number' && Number.isFinite(drone.yaw)
        ? normalizeHeadingDeg(drone.yaw)
        : lastValidYawRef.current[drone.id] ?? 0

      next[drone.id] = visualPose ?? {
        lat: drone.lat,
        lng: drone.lng,
        heading: fallbackHeading,
        altitudeM: drone.altitudeM ?? 0,
        timestampMs: nowMs,
      }
    }

    return next
  }, [drones, visualPoseByDrone])

  /** Tracks the zoom level the user last requested via the zoom control or scroll. */
  const targetZoomRef = useRef<number | null>(null)
  const autoCenterPauseUntilMsRef = useRef<number | null>(null)
  const recaptureTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const activeCameraPointRef = useRef<MapCameraPoint | null>(null)
  const humanCameraInteractionActiveRef = useRef(false)

  const clearRecaptureTimer = useCallback((): void => {
    if (recaptureTimerRef.current === null) return
    window.clearTimeout(recaptureTimerRef.current)
    recaptureTimerRef.current = null
  }, [])

  const setAutoCenterPauseUntilMs = useCallback((pauseUntilMs: number | null): void => {
    autoCenterPauseUntilMsRef.current = pauseUntilMs
    setSharedAutoCenterPauseUntilMs(pauseUntilMs)
  }, [setSharedAutoCenterPauseUntilMs])

  const pauseAutoCenterForProgrammaticCameraMove = useCallback((
    input: PauseAutoCenterForProgrammaticCameraMoveInput,
  ): void => {
    if (!autoCenter) return

    const guardUntilMs = resolveProgrammaticCameraGuardUntilMs({
      moveStartedAtMs: input.moveStartedAtMs,
      durationMs: input.durationMs,
      bufferMs: PROGRAMMATIC_CAMERA_GUARD_BUFFER_MS,
    })
    const nextPauseUntilMs = autoCenterPauseUntilMsRef.current === null
      ? guardUntilMs
      : Math.max(autoCenterPauseUntilMsRef.current, guardUntilMs)
    setAutoCenterPauseUntilMs(nextPauseUntilMs)
  }, [autoCenter, setAutoCenterPauseUntilMs])

  useEffect(() => {
    activeCameraPointRef.current = activeLat == null || activeLng == null
      ? null
      : { lat: activeLat, lng: activeLng }
  }, [activeLat, activeLng])

  const scheduleAutoCenterRecapture = useCallback((pauseUntilMs: number): void => {
    clearRecaptureTimer()

    const delayMs = Math.max(0, pauseUntilMs - Date.now())
    recaptureTimerRef.current = window.setTimeout(() => {
      recaptureTimerRef.current = null

      const nowMs = Date.now()
      if (humanCameraInteractionActiveRef.current) {
        const nextPauseUntilMs = resolveHumanPauseUntilMs({
          humanInteractionAtMs: nowMs,
          idleDelayMs: AUTO_CENTER_HUMAN_IDLE_MS,
        })
        setAutoCenterPauseUntilMs(nextPauseUntilMs)
        scheduleAutoCenterRecapture(nextPauseUntilMs)
        return
      }

      const activePoint = activeCameraPointRef.current
      if (!shouldRecaptureAfterHumanPause({
        autoCenter,
        activePoint,
        pauseUntilMs: autoCenterPauseUntilMsRef.current,
        nowMs,
      })) {
        setAutoCenterPauseUntilMs(null)
        return
      }

      const map = mapRef.current?.getMap()
      if (!map || activePoint === null) {
        setAutoCenterPauseUntilMs(null)
        return
      }

      const nextView = {
        lat: activePoint.lat,
        lng: activePoint.lng,
        zoom: targetZoomRef.current ?? map.getZoom(),
        bearing: map.getBearing(),
        pitch: map.getPitch(),
      }

      setAutoCenterPauseUntilMs(null)
      map.jumpTo({
        center: [activePoint.lng, activePoint.lat],
        zoom: nextView.zoom,
        bearing: nextView.bearing,
        pitch: nextView.pitch,
      })
      setSharedMapCenter({ lat: activePoint.lat, lng: activePoint.lng })
      setMap2DView(nextView)
    }, delayMs)
  }, [
    autoCenter,
    clearRecaptureTimer,
    setAutoCenterPauseUntilMs,
    setMap2DView,
    setSharedMapCenter,
  ])

  const markHumanCameraInteraction = useCallback((): void => {
    if (!autoCenter) return

    const nowMs = Date.now()
    const pauseUntilMs = resolveHumanPauseUntilMs({
      humanInteractionAtMs: nowMs,
      idleDelayMs: AUTO_CENTER_HUMAN_IDLE_MS,
    })
    setAutoCenterPauseUntilMs(pauseUntilMs)
    scheduleAutoCenterRecapture(pauseUntilMs)
  }, [autoCenter, scheduleAutoCenterRecapture, setAutoCenterPauseUntilMs])

  const beginHumanCameraInteraction = useCallback((): void => {
    humanCameraInteractionActiveRef.current = true
    markHumanCameraInteraction()
  }, [markHumanCameraInteraction])

  const endHumanCameraInteraction = useCallback((): void => {
    humanCameraInteractionActiveRef.current = false
    markHumanCameraInteraction()
  }, [markHumanCameraInteraction])

  useEffect(() => {
    if (autoCenter) return
    humanCameraInteractionActiveRef.current = false
    setAutoCenterPauseUntilMs(null)
    clearRecaptureTimer()
  }, [autoCenter, clearRecaptureTimer, setAutoCenterPauseUntilMs])

  useEffect(() => {
    autoCenterPauseUntilMsRef.current = sharedAutoCenterPauseUntilMs
  }, [sharedAutoCenterPauseUntilMs])

  useEffect(() => () => {
    clearRecaptureTimer()
  }, [clearRecaptureTimer])

  const getFleetCamera = useCallback((maxZoom = MAX_MAP_ZOOM) => {
    if (!fleetBounds) return null

    const map = mapRef.current?.getMap()
    if (!map) return null

    const zoomCap = fleetMaxZoom != null ? Math.min(maxZoom, fleetMaxZoom) : maxZoom

    return map.cameraForBounds(fleetBounds, {
      padding: FLEET_ZOOM_PADDING_PX,
      maxZoom: zoomCap,
      bearing: map.getBearing(),
      pitch: map.getPitch(),
    })
  }, [fleetBounds, fleetMaxZoom])

  useEffect(() => {
    if (!autoCenter) return

    const map = mapRef.current?.getMap()
    if (!map) return

    if (isAutoCenterPaused({
      autoCenter,
      pauseUntilMs: autoCenterPauseUntilMsRef.current,
      nowMs: Date.now(),
    })) {
      return
    }

    const activePoint = activeLat == null || activeLng == null
      ? null
      : { lat: activeLat, lng: activeLng }
    const cameraTarget = resolveAutoCenterTarget({
      activePoint,
      fleetBounds,
    })

    if (cameraTarget.type === 'fleet') {
      const fleetCamera = getFleetCamera()

      if (!fleetCamera?.center || typeof fleetCamera.zoom !== 'number' || !Number.isFinite(fleetCamera.zoom)) {
        return
      }

      map.jumpTo({
        center: fleetCamera.center,
        zoom: fleetCamera.zoom,
        bearing: map.getBearing(),
        pitch: map.getPitch(),
      })
      return
    }

    if (cameraTarget.type !== 'active-drone') {
      return
    }

    const zoom = targetZoomRef.current !== null ? targetZoomRef.current : map.getZoom()
    const bearing = map.getBearing()
    const pitch = map.getPitch()

    map.jumpTo({
      center: [cameraTarget.point.lng, cameraTarget.point.lat],
      zoom,
      bearing,
      pitch,
    })
    setSharedMapCenter({ lat: cameraTarget.point.lat, lng: cameraTarget.point.lng })
    setMap2DView({
      lat: cameraTarget.point.lat,
      lng: cameraTarget.point.lng,
      zoom,
      bearing,
      pitch,
    })
  }, [autoCenter, activeLat, activeLng, activeDroneId, fleetBounds, getFleetCamera, setMap2DView, setSharedMapCenter])

  useEffect(() => {
    const buffer = visualPoseBufferRef.current
    const activeIds: string[] = []

    for (const drone of drones) {
      const yawIsValid = typeof drone.yaw === 'number' && Number.isFinite(drone.yaw)
      const yaw = yawIsValid
        ? normalizeHeadingDeg(drone.yaw as number)
        : lastValidYawRef.current[drone.id]
      if (yawIsValid) {
        lastValidYawRef.current[drone.id] = yaw as number
      }

      if (!Number.isFinite(drone.lat) || !Number.isFinite(drone.lng)) {
        continue
      }

      if (Math.abs(drone.lat) > 90 || Math.abs(drone.lng) > 180) {
        continue
      }

      buffer.pushSample(drone.id, {
        lat: drone.lat,
        lng: drone.lng,
        headingDeg: yaw ?? 0,
        altitudeM: drone.altitudeM ?? 0,
        timestampMs: performance.now(),
      })

      activeIds.push(drone.id)
    }

    buffer.clearMissingDrones(activeIds)
  }, [drones])

  useEffect(() => {
    let rafId = 0

    const tick = (): void => {
      const now = performance.now()
      const next: Record<string, DronePose> = {}

      for (const drone of drones) {
        const pose = visualPoseBufferRef.current.samplePose(drone.id, now)
        if (!pose) {
          continue
        }

        next[drone.id] = {
          lat: pose.lat,
          lng: pose.lng,
          heading: pose.headingDeg,
          altitudeM: pose.altitudeM,
          timestampMs: pose.timestampMs,
        }
      }

      setVisualPoseByDrone(next)

      rafId = requestAnimationFrame(tick)
    }

    rafId = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafId)
  }, [drones])

  const initialView = useMemo(
    () => ({
      latitude: map2DView?.lat ?? sharedMapCenter.lat,
      longitude: map2DView?.lng ?? sharedMapCenter.lng,
      zoom: map2DView?.zoom ?? 14,
      bearing: map2DView?.bearing ?? 0,
      pitch: map2DView?.pitch ?? 0,
    }),
    [map2DView, sharedMapCenter.lat, sharedMapCenter.lng],
  )

  const styleUrl = MAPBOX_STYLES[mapStyle] || MAPBOX_STYLES.streets

  const handleClick = useCallback(
    (e: MapMouseEvent) => {
      if (!planningMode || !onWaypointClick) return
      onWaypointClick({ lat: e.lngLat.lat, lng: e.lngLat.lng })
    },
    [planningMode, onWaypointClick],
  )

  const polylinePoints = missionPath.length >= 2 ? missionPath : []
  const advancedLayerData = advancedLayers ?? null

  const handleMoveEnd = useCallback(
    (evt: ViewStateChangeEvent) => {
      const view = evt.viewState
      // Keep targetZoomRef in sync when the user zooms via scroll/pinch.
      targetZoomRef.current = view.zoom
      setMap2DView({
        lat: view.latitude,
        lng: view.longitude,
        zoom: view.zoom,
        bearing: view.bearing,
        pitch: view.pitch,
      })
      setSharedMapCenter({ lat: view.latitude, lng: view.longitude })
    },
    [setMap2DView, setSharedMapCenter],
  )

  const handleZoomChange = useCallback((requestedZoom: number) => {
    const map = mapRef.current?.getMap()
    if (!map) return

    targetZoomRef.current = requestedZoom

    if (autoCenter && activeLat != null && activeLng != null) {
      // When autoCenter is active the effect fires at ~60 Hz and cancels any
      // easeTo within one frame. Use jumpTo immediately so the zoom lands
      // on the drone position without fighting.
      map.jumpTo({
        center: [activeLng, activeLat],
        zoom: requestedZoom,
        bearing: map.getBearing(),
        pitch: map.getPitch(),
      })
      return
    }

    if (fleetBounds) {
      const camera = getFleetCamera(requestedZoom)

      if (camera?.center && typeof camera.zoom === 'number' && Number.isFinite(camera.zoom)) {
        map.easeTo({
          center: camera.center,
          zoom: camera.zoom,
          bearing: map.getBearing(),
          pitch: map.getPitch(),
          duration: 150,
          essential: true,
        })
        return
      }
    }

    map.easeTo({
      zoom: requestedZoom,
      duration: 150,
      essential: true,
    })
  }, [fleetBounds, getFleetCamera, autoCenter, activeLat, activeLng])

  const flyToFramePoint = useCallback(
    (point: MapFramePoint, zoom: number): void => {
      const map = mapRef.current?.getMap()
      if (!map) return

      targetZoomRef.current = zoom

      const bearing = map.getBearing()
      const pitch = map.getPitch()

      pauseAutoCenterForProgrammaticCameraMove({
        durationMs: 650,
        moveStartedAtMs: Date.now(),
      })
      map.flyTo({
        center: [point.lng, point.lat],
        zoom,
        bearing,
        pitch,
        duration: 650,
        essential: true,
      })

      setSharedMapCenter({ lat: point.lat, lng: point.lng })
      setMap2DView({
        lat: point.lat,
        lng: point.lng,
        zoom,
        bearing,
        pitch,
      })
    },
    [pauseAutoCenterForProgrammaticCameraMove, setMap2DView, setSharedMapCenter],
  )

  const handleZoomToMission = useCallback((): void => {
    if (!canZoomToMission) return

    const map = mapRef.current?.getMap()
    if (!map) return

    if (missionFrameBounds !== null) {
      targetZoomRef.current = 17
      pauseAutoCenterForProgrammaticCameraMove({
        durationMs: 700,
        moveStartedAtMs: Date.now(),
      })
      map.fitBounds(missionFrameBounds, {
        padding: 92,
        maxZoom: 17,
        duration: 700,
        essential: true,
      })
      return
    }

    if (validMissionFramePoints.length === 1) {
      const singleMissionPoint = validMissionFramePoints[0]
      flyToFramePoint(singleMissionPoint, 16)
    }
  }, [
    canZoomToMission,
    flyToFramePoint,
    missionFrameBounds,
    pauseAutoCenterForProgrammaticCameraMove,
    validMissionFramePoints,
  ])

  const handleZoomToVehicle = useCallback((): void => {
    if (!validVehicleFramePoint) return
    flyToFramePoint(validVehicleFramePoint, 17)
  }, [flyToFramePoint, validVehicleFramePoint])

  const handleZoomToHome = useCallback((): void => {
    if (!validHomeFramePoint) return
    flyToFramePoint(validHomeFramePoint, 17)
  }, [flyToFramePoint, validHomeFramePoint])

  const handleFenceVertexDrag = useCallback(
    (fenceId: string, vertexIndex: number, lat: number, lng: number): void => {
      markHumanCameraInteraction()

      if (!onFenceVertexDrag) {
        throw new Error(
          `Missing onFenceVertexDrag handler for advanced layer drag; fenceId=${fenceId}; vertexIndex=${vertexIndex}; lat=${lat}; lng=${lng}.`,
        )
      }

      onFenceVertexDrag(fenceId, vertexIndex, lat, lng)
    },
    [markHumanCameraInteraction, onFenceVertexDrag],
  )

  const handleRallyDrag = useCallback(
    (rallyPointId: string, lat: number, lng: number): void => {
      markHumanCameraInteraction()

      if (!onRallyDrag) {
        throw new Error(
          `Missing onRallyDrag handler for advanced layer drag; rallyPointId=${rallyPointId}; lat=${lat}; lng=${lng}.`,
        )
      }

      onRallyDrag(rallyPointId, lat, lng)
    },
    [markHumanCameraInteraction, onRallyDrag],
  )

  const handleMarkerDragActivity = useCallback((): void => {
    markHumanCameraInteraction()
  }, [markHumanCameraInteraction])

  const handleWaypointDragStart = useCallback(
    (wpId: string): void => {
      markHumanCameraInteraction()
      onWaypointDragStart?.(wpId)
    },
    [markHumanCameraInteraction, onWaypointDragStart],
  )

  const handleWaypointDragMove = useCallback(
    (wpId: string, lat: number, lng: number): void => {
      markHumanCameraInteraction()
      onWaypointDragMove?.(wpId, lat, lng)
    },
    [markHumanCameraInteraction, onWaypointDragMove],
  )

  const handleWaypointDragEnd = useCallback(
    (wpId: string, lat: number, lng: number): void => {
      markHumanCameraInteraction()
      onWaypointDrag?.(wpId, lat, lng)
    },
    [markHumanCameraInteraction, onWaypointDrag],
  )

  const handleHomeDrag = useCallback(
    (_id: string, lat: number, lng: number): void => {
      markHumanCameraInteraction()
      onHomeDrag?.(lat, lng)
    },
    [markHumanCameraInteraction, onHomeDrag],
  )

  const handleHomeDragMove = useCallback(
    (): void => {
      markHumanCameraInteraction()
    },
    [markHumanCameraInteraction],
  )

  const handleSelectFence = useCallback(
    (fenceId: string, vertexIndex: number | null): void => {
      if (!onSelectFence) {
        throw new Error(
          `Missing onSelectFence handler for advanced layer selection; fenceId=${fenceId}; vertexIndex=${vertexIndex}.`,
        )
      }

      onSelectFence(fenceId, vertexIndex)
    },
    [onSelectFence],
  )

  const handleSelectRally = useCallback(
    (rallyPointId: string): void => {
      if (!onSelectRally) {
        throw new Error(
          `Missing onSelectRally handler for advanced layer selection; rallyPointId=${rallyPointId}.`,
        )
      }

      onSelectRally(rallyPointId)
    },
    [onSelectRally],
  )

  useEffect(() => {
    const bounds = fleetBoundsRef.current
    if (!bounds || fleetMaxZoom == null) return

    const map = mapRef.current?.getMap()
    if (!map || map.getZoom() <= fleetMaxZoom + 0.01) return

    const camera = map.cameraForBounds(bounds, {
      padding: FLEET_ZOOM_PADDING_PX,
      maxZoom: fleetMaxZoom,
      bearing: map.getBearing(),
      pitch: map.getPitch(),
    })

    if (!camera?.center || typeof camera.zoom !== 'number' || !Number.isFinite(camera.zoom)) {
      return
    }

    map.easeTo({
      center: camera.center,
      zoom: camera.zoom,
      bearing: map.getBearing(),
      pitch: map.getPitch(),
      duration: 150,
      essential: true,
    })
  }, [fleetMaxZoom, fleetMembershipKey])

  return (
    <div
      ref={containerRef}
      style={{
        width: '100%',
        height: '100%',
        position: 'relative',
        cursor: planningMode ? cursor ?? 'crosshair' : undefined,
      }}
    >
      <Map
        ref={mapRef}
        mapLib={import('mapbox-gl')}
        initialViewState={initialView}
        mapStyle={styleUrl}
        style={{ width: '100%', height: '100%' }}
        mapboxAccessToken={import.meta.env.VITE_MAPBOX_TOKEN || ''}
        onError={(err) => {
          if (import.meta.env.DEV) console.error('Map error:', err)
        }}
        onLoad={recomputeFleetZoomLimit}
        onClick={handleClick}
        onMouseDown={beginHumanCameraInteraction}
        onMouseUp={endHumanCameraInteraction}
        onTouchStart={beginHumanCameraInteraction}
        onTouchMove={markHumanCameraInteraction}
        onTouchEnd={endHumanCameraInteraction}
        onDragStart={beginHumanCameraInteraction}
        onDrag={markHumanCameraInteraction}
        onDragEnd={endHumanCameraInteraction}
        onWheel={markHumanCameraInteraction}
        onMoveEnd={handleMoveEnd}
      >
        {drones.map((drone) => {
          const visualPose = visualPoseByDrone[drone.id]
          return (
            <DroneTrailRenderer
              key={`trail-${drone.id}`}
              droneId={drone.id}
              lat={visualPose?.lat ?? drone.lat}
              lng={visualPose?.lng ?? drone.lng}
              altitudeM={visualPose?.altitudeM ?? drone.altitudeM ?? 0}
            />
          )
        })}

        {drones.map((drone) => (
          <Marker
            key={drone.id}
            longitude={renderPoseByDrone[drone.id]?.lng ?? drone.lng}
            latitude={renderPoseByDrone[drone.id]?.lat ?? drone.lat}
            anchor="center"
            onClick={(e) => {
              e.originalEvent.stopPropagation()
              useDroneStore.getState().setActiveDrone(drone.id)
            }}
          >
            <AircraftMarker
              size={46}
              rotation={
                renderPoseByDrone[drone.id]?.heading
                ?? (typeof drone.yaw === 'number' && Number.isFinite(drone.yaw)
                  ? normalizeHeadingDeg(drone.yaw)
                  : lastValidYawRef.current[drone.id] ?? 0)
              }
              active={drone.active === true}
            />
          </Marker>
        ))}

        {droneLeadLine && (
          <DroneLeadLineRenderer
            dronePosition={droneLeadLine.dronePos}
            firstWpPosition={droneLeadLine.firstWpPos}
          />
        )}

        <MissionPathRenderer
          waypoints={polylinePoints}
          showDistanceLabels={planningMode}
        />

        {advancedLayerData !== null && (
          <AdvancedLayerRenderer
            data={advancedLayerData}
            editable={advancedLayerEditing === true}
            onFenceVertexDrag={handleFenceVertexDrag}
            onRallyDrag={handleRallyDrag}
            onSelectFence={handleSelectFence}
            onSelectRally={handleSelectRally}
            onDragActivity={handleMarkerDragActivity}
          />
        )}

        {homeMarker !== null && homeMarker !== undefined ? (
          <WaypointMarker
            key={homeMarker.id}
            id={homeMarker.id}
            lat={homeMarker.lat}
            lng={homeMarker.lng}
            index={-1}
            altitudeM={homeMarker.altitudeM}
            label="H"
            showAltitude={false}
            pinColorOverride={HOME_COLOR}
            pinBorderOverride={HOME_BORDER}
            altitudeColorOverride={HOME_ALT_COLOR}
            onDragStart={onHomeDrag === undefined ? undefined : handleMarkerDragActivity}
            onDragMove={onHomeDrag === undefined ? undefined : handleHomeDragMove}
            onDragEnd={onHomeDrag === undefined ? undefined : handleHomeDrag}
          />
        ) : null}

        {waypointMarkers.map((wp) => (
          <WaypointMarker
            key={wp.id}
            id={wp.id}
            lat={wp.lat}
            lng={wp.lng}
            index={wp.index}
            altitudeM={wp.altitudeM}
            isCurrent={wp.isCurrent}
            isSelected={selectedWpId === wp.id}
            onDragStart={onWaypointDrag === undefined ? undefined : handleWaypointDragStart}
            onDragMove={onWaypointDrag === undefined ? undefined : handleWaypointDragMove}
            onDragEnd={onWaypointDrag === undefined ? undefined : handleWaypointDragEnd}
            onSelect={onWaypointSelect}
          />
        ))}
      </Map>

      {showFrameControl ? (
        <MapFrameControl
          canZoomToMission={canZoomToMission}
          canZoomToVehicle={canZoomToVehicle}
          canZoomToHome={canZoomToHome}
          onZoomToMission={handleZoomToMission}
          onZoomToVehicle={handleZoomToVehicle}
          onZoomToHome={handleZoomToHome}
        />
      ) : null}

      {/* ── Custom Zoom Control ── */}
      <MapZoomControl
        zoom={map2DView?.zoom ?? initialView.zoom}
        maxZoom={fleetMaxZoom ?? MAX_MAP_ZOOM}
        onZoomChange={handleZoomChange}
      />
    </div>
  )
}

export default MapContainer




