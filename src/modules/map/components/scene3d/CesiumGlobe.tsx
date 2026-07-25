/* ═══════════════════════════════════════════════════════════════
   CesiumGlobe — Unified 3D mission viewer
   ═══════════════════════════════════════════════════════════════

   Renders the same mission data as the 2D Mapbox maps:

     • Waypoint markers  — coloured point + index/altitude label
     • Mission path      — dashed cyan polyline at correct AGL
     • Distance labels   — chip at each segment midpoint
     • Drone entities    — GLB model + fallback point

   All visual tokens come from MissionRenderConfig so colours and
   sizes are IDENTICAL across Map / Satellite / Hybrid / 3D views.

   State-synchronisation pattern
   ──────────────────────────────
   • Prop refs keep callbacks/data fresh inside the single init
     useEffect (avoids stale closures without re-running it).
   • syncWaypointsRef is set once inside the init effect and called
     by the shallow prop-change effects whenever markers or the
     selected WP id change — no full viewer re-initialisation.

   ═══════════════════════════════════════════════════════════════ */

import { useCallback, useEffect, useMemo, useRef } from 'react'
import * as Cesium from 'cesium'
import 'cesium/Build/Cesium/Widgets/widgets.css'
import { useDroneStore } from '../../../drone'
import { useMissionStore } from '../../../mission'
import type { CameraMode, MapStyle } from '../../../../shared/store/uiStore'
import { useUIStore } from '../../../../shared/store/uiStore'
import { getCesiumImageryProvider } from '../../../../utils/cesiumImagery'
import { useCesiumOverlay } from './overlay/useCesiumOverlay'
import type { DroneTrailData, GeoPosition } from './overlay/types'
import { resolveDroneTrailAltitude } from './droneTrailAltitude'
import {
  PHOTOREALISTIC_ASSET_ID,
  MODEL_URL,
  MODEL_SCALE,
  MODEL_MIN_PIXEL_SIZE,
  MODEL_MAX_SCALE,
  MODEL_ALTITUDE_LIFT_M,
  MODEL_YAW_OFFSET_DEG,
  ATTITUDE_SMOOTH_TAU_MS,
  MADRID,
  DEFAULT_3D_HEIGHT,
  TOP_DOWN_CAMERA_PITCH_RAD,
  FRAME_SINGLE_HEIGHT_M,

  normalizeHeadingDeg,
  shortestArcDeg,
  zoomToApproxHeight,
  heightToApproxZoom,
  type DroneAttitudeState,
  type MapFramePoint,
  type Initial3DViewState,
  createInitial3DViewState,
  isValidFramePoint,
  calculateFrameCenter,
  calculateFrameHeight,
} from './cesiumGlobeModel'
import MapFrameControl from '../MapFrameControl'
import MapZoomControl from '../MapZoomControl'
import { droneMissionController } from '../../../mission'
import { DroneEntity } from '../../../drone/core/DroneEntity'
import {
  useReplayTrajectoryStore,
  trailWindowStart,
  TRAIL_WINDOW_M,
} from '../../../replay/store/replayTrajectoryStore'
import { useDroneCamera } from '../../hooks/useDroneCamera'
import { useDroneTrailCurtain } from '../../hooks/useDroneTrailCurtain'
import { loadCesiumTerrainProvider } from './cesiumTerrainProvider'
import {
  createCesiumDiagnostic,
  logCesiumDiagnostic,
  resolveCesiumIonToken,
} from './cesiumDiagnostics'
import { calculateWaypointDistances, fmtDist } from '../../../mission'
import {
  WP_COLOR_NORMAL, WP_COLOR_CURRENT, WP_COLOR_SELECTED,
  WP_BORDER_NORMAL, WP_BORDER_CURRENT, WP_BORDER_SELECTED,
  PATH_COLOR_IDLE, PATH_COLOR_RUNNING, PATH_COLOR_COMPLETED,
  LEAD_LINE_COLOR,
  DIST_LABEL_TEXT,
  HOME_COLOR,
  HOME_BORDER,
} from '../mission/rendering/MissionRenderConfig'
import type { HomeMarkerData, WaypointMarkerData } from '../mission/rendering/MissionRenderConfig'

/* ── Configuration ────────────────────────────────────────────────────────── */

const CESIUM_ION_TOKEN = resolveCesiumIonToken(import.meta.env.VITE_CESIUM_ION_TOKEN)

const TAG       = '[CesiumGlobe]'

/* ── Props ────────────────────────────────────────────────────────────────── */

export type CesiumGlobeViewerRole = 'main' | 'fpv' | 'replay'

export interface CesiumGlobeProps {
  /** When true, left-clicking the globe adds a waypoint */
  addingWaypoint: boolean
  /** Called when the user clicks the globe in waypoint-adding mode */
  onWaypointClick?: (coords: { lat: number; lng: number }) => void
  /** Map visual style — drives Cesium imagery.  Defaults to 'satellite'. */
  mapStyle?: MapStyle

  /* ── Unified mission props (same data as 2D MapContainer) ── */
  /** Markers for the currently selected mission */
  waypointMarkers?: WaypointMarkerData[]
  /** ID of the selected mission (excluded from generic polyline sync) */
  selectedMissionId?: string | null
  /** Mission frame points used by the 3D frame control. */
  missionFramePoints?: readonly MapFramePoint[]
  /** Vehicle frame point used by the 3D frame control. */
  vehicleFramePoint?: MapFramePoint | null
  /** Home frame point used by the 3D frame control. */
  homeFramePoint?: MapFramePoint | null
  /** Shows the mission/vehicle/home frame control. */
  showFrameControl?: boolean
  /** Called when the user finishes dragging a waypoint on the globe */
  onWaypointDrag?: (wpId: string, lat: number, lng: number) => void
  /** Currently selected waypoint id — highlighted with purple */
  selectedWpId?: string | null
  /** Called when the user clicks an existing waypoint marker */
  onWaypointSelect?: (wpId: string) => void
  /**
   * Drone-to-first-waypoint lead line (pre-flight only).
   * Pass null to hide (e.g. when mission is running or completed).
   */
  droneLeadLine?: {
    dronePos:   { lat: number; lng: number }
    firstWpPos: { lat: number; lng: number }
  } | null
  /**
   * Toggle photorealistic 3D buildings (Google 3D Tiles).
   * Only has effect when mapStyle === 'satellite'.
   * Defaults to true.
   */
  showBuildings?: boolean
  /** Planned HOME marker for the selected mission. */
  homeMarker?: HomeMarkerData | null
  /** Called when the user finishes dragging planned HOME. */
  onHomeDrag?: (lat: number, lng: number) => void
  /** 
   * Forces the camera into a specific mode, ignoring the global store.
   * Required to run the FPV Panel concurrently with the main FREE map.
   */
  forceCameraMode?: CameraMode
  /** Which logical viewer this instance represents. Only the main viewer writes shared map state. */
  viewerRole?: CesiumGlobeViewerRole
}

/* ── Component ────────────────────────────────────────────────────────────── */

const CesiumGlobe = ({
  addingWaypoint,
  onWaypointClick,
  waypointMarkers    = [],
  selectedMissionId,
  missionFramePoints = [],
  vehicleFramePoint,
  homeFramePoint,
  showFrameControl = false,
  onWaypointDrag,
  selectedWpId,
  onWaypointSelect,
  droneLeadLine,
  mapStyle = 'satellite',
  showBuildings = true,
  forceCameraMode,
  viewerRole = 'main',
  homeMarker,
  onHomeDrag,
}: CesiumGlobeProps) => {
  const sharedMapCenter = useUIStore((s) => s.sharedMapCenter)
  const map2DView = useUIStore((s) => s.map2DView)
  const map3DView = useUIStore((s) => s.map3DView)
  const setSharedMapCenter = useUIStore((s) => s.setSharedMapCenter)
  const setMap2DView = useUIStore((s) => s.setMap2DView)
  const setMap3DView = useUIStore((s) => s.setMap3DView)
  const cameraMode = useUIStore((s) => s.cameraMode)
  const effectiveCameraMode = forceCameraMode ?? cameraMode
  const canWriteSharedMapState = viewerRole === 'main'
  const validMissionFramePoints = useMemo(
    () => missionFramePoints.filter(isValidFramePoint),
    [missionFramePoints],
  )
  const validVehicleFramePoint = useMemo(
    () => (isValidFramePoint(vehicleFramePoint) ? vehicleFramePoint : null),
    [vehicleFramePoint],
  )
  const validHomeFramePoint = useMemo(
    () => (isValidFramePoint(homeFramePoint) ? homeFramePoint : null),
    [homeFramePoint],
  )
  const missionFrameCenter = useMemo(
    () => calculateFrameCenter(validMissionFramePoints),
    [validMissionFramePoints],
  )
  const missionFrameHeight = useMemo(
    () => calculateFrameHeight(validMissionFramePoints),
    [validMissionFramePoints],
  )
  const canZoomToMission = useMemo(() => {
    if (validMissionFramePoints.length === 1) return true
    if (validMissionFramePoints.length < 2) return false
    if (missionFrameCenter === null || missionFrameHeight === null) return false

    const firstPoint = validMissionFramePoints[0]
    if (!firstPoint) return false

    const allPointsCollapsed = validMissionFramePoints.every(
      (point) => point.lat === firstPoint.lat && point.lng === firstPoint.lng,
    )
    return !allPointsCollapsed
  }, [missionFrameCenter, missionFrameHeight, validMissionFramePoints])
  const canZoomToVehicle = validVehicleFramePoint !== null
  const canZoomToHome = validHomeFramePoint !== null
  const initial3DViewRef = useRef<Initial3DViewState | null>(null)
  if (initial3DViewRef.current === null) {
    initial3DViewRef.current = createInitial3DViewState(map2DView, map3DView, sharedMapCenter)
  }
  const setSharedMapCenterRef = useRef(setSharedMapCenter)
  const setMap2DViewRef = useRef(setMap2DView)
  const setMap3DViewRef = useRef(setMap3DView)

  useEffect(() => { setSharedMapCenterRef.current = setSharedMapCenter }, [setSharedMapCenter])
  useEffect(() => { setMap2DViewRef.current = setMap2DView }, [setMap2DView])
  useEffect(() => { setMap3DViewRef.current = setMap3DView }, [setMap3DView])

  /* ── Core refs ── */
  const containerRef    = useRef<HTMLDivElement>(null)
  const viewerRef       = useRef<Cesium.Viewer | null>(null)
  /** droneId → Cesium entity */
  const entityMapRef    = useRef(new Map<string, Cesium.Entity>())
  /** missionId → background polyline (non-selected missions) */
  const polylineMapRef  = useRef(new Map<string, Cesium.Entity>())
  /** wpId → waypoint point+label entity */
  const wpEntityMapRef  = useRef(new Map<string, Cesium.Entity>())
  /** segment key → distance chip entity */
  const distLabelMapRef = useRef(new Map<string, Cesium.Entity>())
  /** Dashed path entity for the selected mission */
  const selectedPathRef = useRef<Cesium.Entity | null>(null)
  /** Lead line entity: drone → first waypoint (pre-flight only) */
  const leadLineEntityRef = useRef<Cesium.Entity | null>(null)
  /** Set once inside the init effect; called by prop-change effects. */
  const syncWaypointsRef    = useRef<(() => void) | null>(null)
  /** Set once inside the init effect; called by selected mission changes. */
  const syncPolylinesRef    = useRef<(() => void) | null>(null)
  /** Set once inside the init effect; called when droneLeadLine prop changes. */
  const syncLeadLineRef     = useRef<(() => void) | null>(null)
  /** True while a 3D waypoint drag is in progress — suppresses subscription-triggered
   *  syncWaypoints() to avoid tearing down the path entity during the drag. */
  const isDraggingRef = useRef(false)
  /** droneId → growing array of past Cartesian3 positions for trail rendering */
  const droneTrailRef       = useRef(new Map<string, Cesium.Cartesian3[]>())
  /** droneId → timestamps (ms) aligned with droneTrailRef points for TTL pruning */
  const droneTrailTimeRef   = useRef(new Map<string, number[]>())
  /** droneId → cached terrain MSL elevation used as the curtain baseline */
  const droneTerrainHeightCacheRef = useRef(new Map<string, number>())
  /** droneIds currently being async-sampled (prevents duplicate requests) */
  const droneTerrainSamplingRef = useRef(new Set<string>())
  /** droneId → latest deduped+smoothed Cartesian3 path read each frame by ribbon CallbackProperty */
  const droneRibbonPositionsRef = useRef(new Map<string, Cesium.Cartesian3[]>())
  /** droneId → growing GeoPosition trail for the 2D overlay (oldest first) */
  const overlayTrailGeoRef = useRef(new Map<string, GeoPosition[]>())
  /** droneId → timestamps (ms) aligned with overlayTrailGeoRef points for TTL pruning */
  const overlayTrailTimeRef = useRef(new Map<string, number[]>())
  /** droneId → last valid/smoothed yaw-pitch-roll used for 3D model orientation */
  const droneAttitudeRef = useRef(new Map<string, DroneAttitudeState>())
  /** droneId → last known good GeoPosition used to avoid invalid GPS jumps */
  /** Ref to the overlay's updateTrails callback — set by useCesiumOverlay. */
  const overlayUpdateRef = useRef<((trails: DroneTrailData[]) => void) | null>(null)
  /** Replay trajectory polyline entity */
  const replayTrajectoryRef = useRef<Cesium.Entity | null>(null)
  /** Replay drone position entity */
  const replayDroneRef = useRef<Cesium.Entity | null>(null)

  /* ── 2D Canvas Overlay — trajectory visualization hook ── */
  const { updateTrails: overlayUpdateTrails } = useCesiumOverlay({
    viewerRef,
    containerRef,
    enabled: true,
    refAltitudeMSL: null,
  })
  // Keep the overlay update function accessible inside the init effect closure
  useEffect(() => {
    overlayUpdateRef.current = overlayUpdateTrails
  }, [overlayUpdateTrails])

  /* ── mapStyle ref — keeps current style accessible inside init closure ── */
  const mapStyleRef = useRef<MapStyle>(mapStyle)
  /** Keeps the showBuildings prop accessible inside async tileset callbacks. */
  const showBuildingsRef = useRef(showBuildings)

  /**
   * Tracks the active Google Photorealistic 3D Tiles primitive so it can be
   * removed when switching away from satellite style.
   */
  const photoTilesetRef = useRef<Cesium.Cesium3DTileset | null>(null)
  const photoTilesetLoadingRef = useRef(false)
  /** OSM 3D Buildings are used over non-satellite raster styles. */
  const osmBuildingsRef = useRef<Cesium.Cesium3DTileset | null>(null)
  const osmBuildingsLoadingRef = useRef(false)

  const removePhotorealisticTiles = useCallback((viewer: Cesium.Viewer) => {
    const tileset = photoTilesetRef.current
    if (!tileset) return
    viewer.scene.primitives.remove(tileset)
    if (!tileset.isDestroyed()) {
      tileset.destroy()
    }
    photoTilesetRef.current = null
  }, [])

  const removeOsmBuildings = useCallback((viewer: Cesium.Viewer) => {
    const tileset = osmBuildingsRef.current
    if (!tileset) return
    viewer.scene.primitives.remove(tileset)
    if (!tileset.isDestroyed()) {
      tileset.destroy()
    }
    osmBuildingsRef.current = null
  }, [])

  const restoreRasterGlobe = useCallback((viewer: Cesium.Viewer, style: MapStyle) => {
    viewer.scene.globe.translucency.enabled        = false
    viewer.scene.globe.translucency.frontFaceAlpha = 1.0
    viewer.scene.globe.depthTestAgainstTerrain     = true
    viewer.scene.globe.maximumScreenSpaceError     = 2.0
    viewer.imageryLayers.removeAll()
    viewer.imageryLayers.addImageryProvider(getCesiumImageryProvider(style))
  }, [])

  const applyOsmBuildingStyle = useCallback((tileset: Cesium.Cesium3DTileset, style: MapStyle) => {
    // Solid colors (no transparency) tuned for contrast on each base map style.
    const color = style === 'dark'
      ? "color('#90a4b8', 1.0)"
      : style === 'hybrid'
      ? "color('#e0d8ca', 1.0)"
      : "color('#d6dde5', 1.0)"

    tileset.style = new Cesium.Cesium3DTileStyle({ color })
  }, [])

  const syncSceneStyle = useCallback((viewer: Cesium.Viewer, style: MapStyle, showBuildings: boolean) => {
    if (style === 'satellite') {
      if (CESIUM_ION_TOKEN === null) {
        restoreRasterGlobe(viewer, 'satellite')
        return
      }

      removeOsmBuildings(viewer)

      if (!showBuildings) {
        if (photoTilesetRef.current) photoTilesetRef.current.show = false
        restoreRasterGlobe(viewer, 'satellite')
        return
      }

      viewer.imageryLayers.removeAll()
      viewer.scene.globe.translucency.enabled        = true
      viewer.scene.globe.translucency.frontFaceAlpha = 0.0
      viewer.scene.globe.depthTestAgainstTerrain     = false
      viewer.scene.globe.maximumScreenSpaceError     = 512

      if (photoTilesetRef.current) {
        photoTilesetRef.current.show = true
        return
      }
      if (photoTilesetLoadingRef.current) return

      photoTilesetLoadingRef.current = true
      Cesium.Cesium3DTileset.fromIonAssetId(PHOTOREALISTIC_ASSET_ID)
        .then((tileset) => {
          photoTilesetLoadingRef.current = false
          if (
            viewer.isDestroyed() ||
            mapStyleRef.current !== 'satellite' ||
            !showBuildingsRef.current
          ) {
            tileset.destroy()
            return
          }
          tileset.dynamicScreenSpaceError              = true
          tileset.dynamicScreenSpaceErrorDensity       = 0.00278
          tileset.dynamicScreenSpaceErrorFactor        = 4.0
          tileset.dynamicScreenSpaceErrorHeightFalloff = 0.25
          viewer.scene.primitives.add(tileset)
          tileset.show = true
          photoTilesetRef.current = tileset
        })
        .catch((err) => {
          photoTilesetLoadingRef.current = false
          logCesiumDiagnostic(createCesiumDiagnostic({
            level: 'error',
            code: 'tileset-load-failed',
            message: 'Photorealistic 3D Tiles failed',
            context: { style: mapStyleRef.current, provider: 'google-photorealistic' },
            error: err,
          }))
          if (!viewer.isDestroyed()) restoreRasterGlobe(viewer, 'satellite')
        })
      return
    }

    removePhotorealisticTiles(viewer)
    restoreRasterGlobe(viewer, style)

    if (!showBuildings) {
      removeOsmBuildings(viewer)
      return
    }

    if (CESIUM_ION_TOKEN === null) {
      restoreRasterGlobe(viewer, style)
      return
    }

    if (osmBuildingsRef.current) {
      osmBuildingsRef.current.show = true
      applyOsmBuildingStyle(osmBuildingsRef.current, style)
      return
    }
    if (osmBuildingsLoadingRef.current) return

    osmBuildingsLoadingRef.current = true
    Cesium.createOsmBuildingsAsync()
      .then((tileset) => {
        osmBuildingsLoadingRef.current = false
        if (
          viewer.isDestroyed() ||
          mapStyleRef.current === 'satellite' ||
          !showBuildingsRef.current
        ) {
          tileset.destroy()
          return
        }
        tileset.dynamicScreenSpaceError = true
        applyOsmBuildingStyle(tileset, mapStyleRef.current)
        viewer.scene.primitives.add(tileset)
        osmBuildingsRef.current = tileset
      })
      .catch((err) => {
        osmBuildingsLoadingRef.current = false
        logCesiumDiagnostic(createCesiumDiagnostic({
          level: 'error',
          code: 'tileset-load-failed',
          message: 'OSM 3D Buildings failed',
          context: { style: mapStyleRef.current, provider: 'osm-buildings' },
          error: err,
        }))
      })
  }, [applyOsmBuildingStyle, removeOsmBuildings, removePhotorealisticTiles, restoreRasterGlobe])
  const syncSceneStyleRef = useRef(syncSceneStyle)

  useEffect(() => {
    syncSceneStyleRef.current = syncSceneStyle
  }, [syncSceneStyle])

  /* Live style swap: runs whenever the mapStyle prop changes.
     satellite -> Google Photorealistic 3D Tiles
     streets/dark/hybrid -> Mapbox raster + Cesium OSM Buildings              */
  useEffect(() => {
    mapStyleRef.current = mapStyle
    const viewer = viewerRef.current
    if (!viewer || viewer.isDestroyed()) return
    syncSceneStyle(viewer, mapStyle, showBuildingsRef.current)
  }, [mapStyle, syncSceneStyle])

  /* ── Prop refs — prevent stale closures inside the single init effect ── */
  const addingWpRef          = useRef(addingWaypoint)
  const onWpClickRef         = useRef(onWaypointClick)
  const waypointMarkersRef   = useRef(waypointMarkers)
  const selectedMissionIdRef = useRef(selectedMissionId)
  const selectedWpIdRef      = useRef(selectedWpId)
  const onWaypointDragRef    = useRef(onWaypointDrag)
  const onWaypointSelectRef  = useRef(onWaypointSelect)
  const droneLeadLineRef     = useRef(droneLeadLine)
  const homeMarkerRef = useRef(homeMarker)
  const onHomeDragRef = useRef(onHomeDrag)
  const homeEntityRef = useRef<Cesium.Entity | null>(null)

  useEffect(() => {
    showBuildingsRef.current = showBuildings
    const viewer = viewerRef.current
    if (!viewer || viewer.isDestroyed()) return
    syncSceneStyle(viewer, mapStyleRef.current, showBuildings)
  }, [showBuildings, syncSceneStyle])

  useEffect(() => { addingWpRef.current = addingWaypoint }, [addingWaypoint])
  useEffect(() => { onWpClickRef.current = onWaypointClick }, [onWaypointClick])
  useEffect(() => { onWaypointDragRef.current = onWaypointDrag }, [onWaypointDrag])
  useEffect(() => { onWaypointSelectRef.current = onWaypointSelect }, [onWaypointSelect])
  useEffect(() => {
    selectedMissionIdRef.current = selectedMissionId
    syncPolylinesRef.current?.()
  }, [selectedMissionId])

  useEffect(() => {
    droneLeadLineRef.current = droneLeadLine
    syncLeadLineRef.current?.()
  }, [droneLeadLine])

  useEffect(() => { homeMarkerRef.current = homeMarker; syncWaypointsRef.current?.() }, [homeMarker])
  useEffect(() => { onHomeDragRef.current = onHomeDrag }, [onHomeDrag])

  useEffect(() => {
    waypointMarkersRef.current = waypointMarkers
    syncWaypointsRef.current?.()
  }, [waypointMarkers])

  useEffect(() => {
    selectedWpIdRef.current = selectedWpId
    syncWaypointsRef.current?.()
  }, [selectedWpId])

  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    const initial3DView = initial3DViewRef.current
    const entityMap = entityMapRef.current
    const polylineMap = polylineMapRef.current
    const wpEntityMap = wpEntityMapRef.current
    const distLabelMap = distLabelMapRef.current
    const droneTrail = droneTrailRef.current
    const droneTrailTime = droneTrailTimeRef.current
    const droneRibbonPositions = droneRibbonPositionsRef.current
    const overlayTrailGeo = overlayTrailGeoRef.current
    const overlayTrailTime = overlayTrailTimeRef.current
    const droneAttitude = droneAttitudeRef.current
    if (!initial3DView) return

    if (CESIUM_ION_TOKEN !== null) {
      Cesium.Ion.defaultAccessToken = CESIUM_ION_TOKEN
    } else {
      logCesiumDiagnostic(createCesiumDiagnostic({
        level: 'warning',
        code: 'ion-token-missing',
        message: 'Cesium Ion token is missing; token-required 3D terrain or tiles may be unavailable.',
        context: { feature: 'cesium-viewer' },
        error: null,
      }))
    }

    let viewer: Cesium.Viewer
    try {
      viewer = new Cesium.Viewer(container, {
        timeline:             false,
        animation:            false,
        baseLayerPicker:      false,
        geocoder:             false,
        homeButton:           false,
        sceneModePicker:      false,
        navigationHelpButton: false,
        infoBox:              false,
        fullscreenButton:     false,
        scene3DOnly:                   true,
        sceneMode:                     Cesium.SceneMode.SCENE3D,
        requestRenderMode:             false,
        useDefaultRenderLoop:          true,
        msaaSamples:                   2,
        useBrowserRecommendedResolution: false,
      })
    } catch (err) {
      console.error(`${TAG} ✖ Failed to create Viewer:`, err)
      return
    }
    viewerRef.current = viewer

    viewer.imageryLayers.removeAll()
    viewer.imageryLayers.addImageryProvider(getCesiumImageryProvider(mapStyleRef.current))
    viewer.scene.globe.depthTestAgainstTerrain = true
    viewer.scene.globe.enableLighting          = true
    viewer.scene.postProcessStages.fxaa.enabled = true
    viewer.resolutionScale = Math.min(window.devicePixelRatio, 1.5)
    viewer.scene.globe.maximumScreenSpaceError = 2.0
    viewer.scene.globe.tileCacheSize           = 300
    viewer.scene.globe.preloadSiblings         = false
    viewer.scene.fog.enabled        = true
    viewer.scene.fog.density        = 0.0001
    if (viewer.scene.skyAtmosphere) viewer.scene.skyAtmosphere.show = true

    const csc            = viewer.scene.screenSpaceCameraController
    csc.inertiaSpin      = 0.9
    csc.inertiaTranslate = 0.9
    csc.inertiaZoom      = 0.8
    csc.minimumZoomDistance = 10
    csc.maximumZoomDistance = 20_000_000

    const initialTerrain = viewer.terrainProvider
    loadCesiumTerrainProvider({
      token: CESIUM_ION_TOKEN,
      fallback: initialTerrain,
      loadIonTerrain: () => Cesium.createWorldTerrainAsync({ requestVertexNormals: true, requestWaterMask: true }),
      reportFailure: (error) => {
        logCesiumDiagnostic(createCesiumDiagnostic({
          level: 'warning',
          code: 'terrain-provider-load-failed',
          message: 'Cesium World Terrain failed; falling back to ellipsoid terrain.',
          context: { feature: 'world-terrain' },
          error,
        }))
      },
    }).then((terrain) => {
      if (viewer.isDestroyed()) return
      viewer.terrainProvider = terrain
      droneTerrainHeightCacheRef.current.clear()
      droneTerrainSamplingRef.current.clear()
      syncWaypoints()
      syncPolylines()
    })

    syncSceneStyleRef.current(viewer, mapStyleRef.current, showBuildingsRef.current)

    viewer.camera.setView({
      destination: Cesium.Cartesian3.fromDegrees(initial3DView.lng, initial3DView.lat, initial3DView.height),
      orientation: {
        heading: initial3DView.heading,
        pitch: initial3DView.pitch,
        roll: initial3DView.roll,
      },
    })

    if (canWriteSharedMapState) {
      setMap3DViewRef.current(initial3DView)
    }

    const getCameraCenter = () => {
      const canvas = viewer.scene.canvas
      const center = new Cesium.Cartesian2(canvas.clientWidth / 2, canvas.clientHeight / 2)
      const ray = viewer.camera.getPickRay(center)
      const picked = ray ? viewer.scene.globe.pick(ray, viewer.scene) : undefined
      if (picked) {
        const carto = Cesium.Cartographic.fromCartesian(picked)
        return {
          lat: Cesium.Math.toDegrees(carto.latitude),
          lng: Cesium.Math.toDegrees(carto.longitude),
        }
      }
      const carto = viewer.camera.positionCartographic
      return {
        lat: Cesium.Math.toDegrees(carto.latitude),
        lng: Cesium.Math.toDegrees(carto.longitude),
      }
    }

    const handleCameraMoveEnd = () => {
      if (viewer.isDestroyed()) return
      const center = getCameraCenter()
      const carto = viewer.camera.positionCartographic
      const height = carto.height
      const heading = viewer.camera.heading
      const pitch = viewer.camera.pitch
      const roll = viewer.camera.roll
      const approxZoom = heightToApproxZoom(height, center.lat)

      if (canWriteSharedMapState) {
        setSharedMapCenterRef.current(center)
        setMap3DViewRef.current({
          lat: center.lat,
          lng: center.lng,
          height,
          heading,
          pitch,
          roll,
        })
        setMap2DViewRef.current({
          lat: center.lat,
          lng: center.lng,
          zoom: approxZoom,
          bearing: Cesium.Math.toDegrees(heading),
          pitch: Math.max(0, Cesium.Math.toDegrees(-pitch)),
        })
      }
    }

    const removeCameraMoveEnd = viewer.camera.moveEnd.addEventListener(handleCameraMoveEnd)

    const sampleTerrainForDrone = (droneId: string, lat: number, lng: number) => {
      if (droneTerrainSamplingRef.current.has(droneId)) return
      const tp = viewer.terrainProvider
      if (tp instanceof Cesium.EllipsoidTerrainProvider) {
        droneTerrainHeightCacheRef.current.set(droneId, 0)
        return
      }
      // Pre-initialise with a rough estimate so the FPV camera has a reasonable
      // starting altitude while the async terrain sample is in flight.
      // Without this the cache defaults to 0, placing the camera ~650 m underground
      // at Madrid, which makes Cesium render the terrain from below (upside-down).
      const roughEstimate = (lat > 40 && lat < 42) ? 650
                          : (lat > 27 && lat < 30) ? 520
                          : 100
      droneTerrainHeightCacheRef.current.set(droneId, roughEstimate)
      droneTerrainSamplingRef.current.add(droneId)
      Cesium.sampleTerrainMostDetailed(tp, [Cesium.Cartographic.fromDegrees(lng, lat, 0)])
        .then((results) => {
          droneTerrainSamplingRef.current.delete(droneId)
          droneTerrainHeightCacheRef.current.set(droneId, results[0]?.height ?? roughEstimate)
        })
        .catch((error: unknown) => {
          droneTerrainSamplingRef.current.delete(droneId)
          droneTerrainHeightCacheRef.current.set(droneId, roughEstimate)
          logCesiumDiagnostic(createCesiumDiagnostic({
            level: 'warning',
            code: 'terrain-sampling-failed',
            message: 'Drone terrain sampling failed; using the current estimated terrain height.',
            context: {
              droneId,
              lat,
              lng,
              roughEstimate,
              terrainProvider: tp.constructor.name,
            },
            error,
          }))
        })
    }

    const upsertDrone = (
      droneId: string,
      lat: number, lng: number, altitude: number,
      yaw: number, pitch: number, roll: number,
    ) => {
      if (lat == null || lng == null || isNaN(lat) || isNaN(lng)) return
      if (altitude == null || isNaN(altitude)) altitude = 30

      if (!droneTerrainHeightCacheRef.current.has(droneId)) {
        sampleTerrainForDrone(droneId, lat, lng)
      }
      const terrainH = droneTerrainHeightCacheRef.current.get(droneId) ?? 0
      const modelMslAltitude = terrainH + altitude + MODEL_ALTITUDE_LIFT_M
      const position = Cesium.Cartesian3.fromDegrees(lng, lat, modelMslAltitude)
      const hpr         = new Cesium.HeadingPitchRoll(
        Cesium.Math.toRadians(yaw   ?? 0),
        Cesium.Math.toRadians(pitch ?? 0),
        Cesium.Math.toRadians(roll  ?? 0),
      )
      const orientation = Cesium.Transforms.headingPitchRollQuaternion(position, hpr)

      const airPosition = Cesium.Cartesian3.fromDegrees(lng, lat, terrainH + altitude)

      const TRAIL_MIN_DIST = 5.0
      const TRAIL_RESET_DIST = 1200.0 // metres; discontinuity guard on source swap / first GPS fix
      const TRAIL_TTL_MS = 60_000
      let trail = droneTrailRef.current.get(droneId)
      if (!trail) {
        trail = []
        droneTrailRef.current.set(droneId, trail)
      }
      let trailTimes = droneTrailTimeRef.current.get(droneId)
      if (!trailTimes) {
        trailTimes = []
        droneTrailTimeRef.current.set(droneId, trailTimes)
      }
      const nowMs = Date.now()
      while (trail.length > 0 && trailTimes.length > 0 && nowMs - trailTimes[0] > TRAIL_TTL_MS) {
        trail.shift()
        trailTimes.shift()
      }
      const isAirborne = altitude > 1.0
      const last = trail[trail.length - 1]
      if (isAirborne) {
        const dist = last ? Cesium.Cartesian3.distance(last, airPosition) : 0
        if (last && dist > TRAIL_RESET_DIST) {
          trail.length = 0
          trailTimes.length = 0
          trail.push(Cesium.Cartesian3.clone(airPosition))
          trailTimes.push(nowMs)
        } else if (!last || dist >= TRAIL_MIN_DIST) {
          trail.push(Cesium.Cartesian3.clone(airPosition))
          trailTimes.push(nowMs)
        }
      }

      const existing = entityMapRef.current.get(droneId)
      if (existing) {
        existing.position    = new Cesium.ConstantPositionProperty(position)
        existing.orientation = new Cesium.ConstantProperty(orientation)
      }

      if (existing) return

      const entity = viewer.entities.add({
        id:          `drone-entity-${droneId}`,
        position:    new Cesium.ConstantPositionProperty(position),
        orientation: new Cesium.ConstantProperty(orientation),
        model: {
          uri:              MODEL_URL,
          scale:            MODEL_SCALE,
          minimumPixelSize: MODEL_MIN_PIXEL_SIZE,
          maximumScale:     MODEL_MAX_SCALE,
        },
        label: {
          text:                     droneId,
          font:                     'bold 15.4px Inter, sans-serif',
          fillColor:                Cesium.Color.WHITE,
          outlineColor:             Cesium.Color.BLACK,
          outlineWidth:             2,
          style:                    Cesium.LabelStyle.FILL_AND_OUTLINE,
          pixelOffset:              new Cesium.Cartesian2(0, -50),
          heightReference:          Cesium.HeightReference.RELATIVE_TO_GROUND,
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
        },
      })
      entityMapRef.current.set(droneId, entity)
    }

    const resolveDroneAttitude = (
      droneId: string,
      yawRaw: number,
      pitchRaw: number,
      rollRaw: number,
    ): { yaw: number; pitch: number; roll: number } => {
      const now = performance.now()
      const prev = droneAttitudeRef.current.get(droneId)

      const hasYaw = Number.isFinite(yawRaw)
      const hasPitch = Number.isFinite(pitchRaw)
      const hasRoll = Number.isFinite(rollRaw)

      if (!prev) {
        const initial: DroneAttitudeState = {
          yaw: normalizeHeadingDeg(hasYaw ? yawRaw : 0),
          pitch: hasPitch ? pitchRaw : 0,
          roll: hasRoll ? rollRaw : 0,
          lastTs: now,
        }
        droneAttitudeRef.current.set(droneId, initial)
        return {
          yaw: normalizeHeadingDeg(initial.yaw + MODEL_YAW_OFFSET_DEG),
          pitch: initial.pitch,
          roll: initial.roll,
        }
      }

      const dt = Math.max(1, Math.min(100, now - prev.lastTs))
      const alpha = 1 - Math.exp(-dt / ATTITUDE_SMOOTH_TAU_MS)
      let nextYaw = prev.yaw
      let nextPitch = prev.pitch
      let nextRoll = prev.roll

      if (hasYaw) {
        const targetYaw = normalizeHeadingDeg(yawRaw)
        nextYaw = normalizeHeadingDeg(prev.yaw + shortestArcDeg(prev.yaw, targetYaw) * alpha)
      }
      if (hasPitch) nextPitch = prev.pitch + (pitchRaw - prev.pitch) * alpha
      if (hasRoll) nextRoll = prev.roll + (rollRaw - prev.roll) * alpha

      const nextState: DroneAttitudeState = {
        yaw: nextYaw,
        pitch: nextPitch,
        roll: nextRoll,
        lastTs: now,
      }
      droneAttitudeRef.current.set(droneId, nextState)

      return {
        yaw: normalizeHeadingDeg(nextYaw + MODEL_YAW_OFFSET_DEG),
        pitch: nextPitch,
        roll: nextRoll,
      }
    }

    const syncDrones = () => {
      if (viewerRole === 'replay') {
        return
      }
      if (!viewerRef.current || viewer.isDestroyed()) return
      const visibleDrones = useDroneStore.getState().drones

      for (const drone of Object.values(visibleDrones)) {
        const position = { lat: drone.lat, lng: drone.lng }
        const terrainH = droneTerrainHeightCacheRef.current.get(drone.id) ?? 0
        const altitude = resolveDroneTrailAltitude({
          telemetryAltitudeAGL: null,
          telemetryAltitudeMSL: null,
          storeAltitudeAGL: drone.altitude,
          storeAltitudeMSL: drone.altitudeMSL,
          terrainMSL: terrainH,
        })

        const attitude = resolveDroneAttitude(drone.id, drone.yaw, drone.pitch, drone.roll)
        upsertDrone(
          drone.id,
          position.lat,
          position.lng,
          altitude.altitudeAGL,
          attitude.yaw,
          attitude.pitch,
          attitude.roll,
        )
        if (!droneMissionController.getEntity(drone.id)) {
          droneMissionController.addEntity(
            new DroneEntity(drone, MODEL_URL, 12),
          )
        }

        const geoPos: GeoPosition = {
          lat: position.lat,
          lng: position.lng,
          altitudeMSL: altitude.altitudeMSL,
          altitudeAGL: altitude.altitudeAGL,
        }
        const isAirborne = altitude.altitudeAGL > 1.0

        let geoTrail = overlayTrailGeoRef.current.get(drone.id)
        if (!geoTrail) {
          geoTrail = []
          overlayTrailGeoRef.current.set(drone.id, geoTrail)
        }

        let geoTrailTimes = overlayTrailTimeRef.current.get(drone.id)
        if (!geoTrailTimes) {
          geoTrailTimes = []
          overlayTrailTimeRef.current.set(drone.id, geoTrailTimes)
        }

        const nowMs = Date.now()
        while (geoTrail.length > 0 && geoTrailTimes.length > 0 && nowMs - geoTrailTimes[0] > 60_000) {
          geoTrail.shift()
          geoTrailTimes.shift()
        }

        if (isAirborne) {
          const last = geoTrail[geoTrail.length - 1]
          const moved = !last ||
            Math.abs(last.lat - geoPos.lat) > 0.00004 ||
            Math.abs(last.lng - geoPos.lng) > 0.00004
          if (moved) {
            geoTrail.push({ ...geoPos })
            geoTrailTimes.push(nowMs)
          }
        }
      }

      for (const [id] of entityMapRef.current) {
        if (!visibleDrones[id]) {
          const entity = entityMapRef.current.get(id)
          if (entity) viewer.entities.remove(entity)
          entityMapRef.current.delete(id)
          droneTrailRef.current.delete(id)
          droneTrailTimeRef.current.delete(id)
          droneRibbonPositionsRef.current.delete(id)
          overlayTrailGeoRef.current.delete(id)
          overlayTrailTimeRef.current.delete(id)
          droneAttitudeRef.current.delete(id)
          droneTerrainHeightCacheRef.current.delete(id)
          droneTerrainSamplingRef.current.delete(id)
          droneMissionController.removeEntity(id)
        }
      }

      const overlayTrails: DroneTrailData[] = []
      for (const drone of Object.values(visibleDrones)) {
        const position = { lat: drone.lat, lng: drone.lng }
        const terrainH = droneTerrainHeightCacheRef.current.get(drone.id) ?? 0
        const altitude = resolveDroneTrailAltitude({
          telemetryAltitudeAGL: null,
          telemetryAltitudeMSL: null,
          storeAltitudeAGL: drone.altitude,
          storeAltitudeMSL: drone.altitudeMSL,
          terrainMSL: terrainH,
        })
        const geoTrail = overlayTrailGeoRef.current.get(drone.id)
        overlayTrails.push({
          droneId: drone.id,
          positions: geoTrail ?? [],
          currentPosition: {
            lat: position.lat,
            lng: position.lng,
            altitudeMSL: altitude.altitudeMSL,
            altitudeAGL: altitude.altitudeAGL,
          },
          headingDeg: drone.yaw,
          isActive: drone.active,
          terrainAltMSL: droneTerrainHeightCacheRef.current.has(drone.id) ? terrainH : undefined,
        })
      }
      overlayUpdateRef.current?.(overlayTrails)
    }

    const syncPolylines = () => {
      if (!viewerRef.current || viewer.isDestroyed()) return
      const missions = useMissionStore.getState().missions
      const selId    = selectedMissionIdRef.current

      for (const [mId, entity] of polylineMapRef.current) {
        if (!missions[mId]) {
          viewer.entities.remove(entity)
          polylineMapRef.current.delete(mId)
        }
      }

      for (const m of Object.values(missions)) {
        if (m.id === selId) {
          const ex = polylineMapRef.current.get(m.id)
          if (ex) { viewer.entities.remove(ex); polylineMapRef.current.delete(m.id) }
          continue
        }
        if (m.waypoints.length < 2) continue
        const positions = m.waypoints.map((wp) => Cesium.Cartesian3.fromDegrees(wp.lng, wp.lat, wp.altitude))
        const color = m.status === 'running'
            ? Cesium.Color.fromCssColorString(PATH_COLOR_RUNNING).withAlpha(0.6)
            : m.status === 'completed'
            ? Cesium.Color.fromCssColorString(PATH_COLOR_COMPLETED).withAlpha(0.35)
            : Cesium.Color.fromCssColorString(PATH_COLOR_IDLE).withAlpha(0.35)

        const existing = polylineMapRef.current.get(m.id)
        if (existing) { viewer.entities.remove(existing); polylineMapRef.current.delete(m.id) }
        const ent = viewer.entities.add({
          id:       `mission-polyline-${m.id}`,
          polyline: { positions, width: 2, material: color, clampToGround: true },
        })
        polylineMapRef.current.set(m.id, ent)
      }
    }

    let pathSyncSeq = 0
    const syncWaypoints = async () => {
      if (!viewerRef.current || viewer.isDestroyed()) return
      const seq     = ++pathSyncSeq
      const markers = waypointMarkersRef.current
      const selWpId = selectedWpIdRef.current
      const home    = homeMarkerRef.current
      const sorted  = [...markers].sort((a, b) => a.index - b.index)
      let mslHeights: number[] = sorted.map((m) => m.altitudeM)
      const tp             = viewer.terrainProvider
      const hasRealTerrain = !(tp instanceof Cesium.EllipsoidTerrainProvider)

      if (hasRealTerrain && sorted.length > 0) {
        try {
          const cartos  = sorted.map((m) => Cesium.Cartographic.fromDegrees(m.lng, m.lat, 0))
          const sampled = await Cesium.sampleTerrainMostDetailed(tp, cartos)
          if (seq !== pathSyncSeq || viewer.isDestroyed()) return
          mslHeights = sorted.map((m, i) => (sampled[i]?.height ?? 0) + m.altitudeM)
        } catch (error: unknown) {
          if (seq !== pathSyncSeq || viewer.isDestroyed()) return
          logCesiumDiagnostic(createCesiumDiagnostic({
            level: 'warning',
            code: 'waypoint-terrain-sampling-failed',
            message: 'Waypoint terrain sampling failed; using waypoint altitude without sampled terrain.',
            context: {
              waypointCount: sorted.length,
              terrainProvider: tp.constructor.name,
            },
            error,
          }))
        }
      }

      let homeMslHeight = home?.altitudeM ?? 0
      if (hasRealTerrain && home !== null && home !== undefined) {
        try {
          const sampledHome = await Cesium.sampleTerrainMostDetailed(tp, [
            Cesium.Cartographic.fromDegrees(home.lng, home.lat, 0),
          ])
          if (seq !== pathSyncSeq || viewer.isDestroyed()) return
          homeMslHeight = (sampledHome[0]?.height ?? 0) + home.altitudeM
        } catch (error: unknown) {
          if (seq !== pathSyncSeq || viewer.isDestroyed()) return
          logCesiumDiagnostic(createCesiumDiagnostic({
            level: 'warning',
            code: 'home-terrain-sampling-failed',
            message: 'Home terrain sampling failed; using home altitude without sampled terrain.',
            context: {
              homeMarkerId: home.id,
              terrainProvider: tp.constructor.name,
            },
            error,
          }))
        }
      }

      if (home === null || home === undefined) {
        if (homeEntityRef.current !== null) {
          viewer.entities.remove(homeEntityRef.current)
          homeEntityRef.current = null
        }
      } else {
        const homePos = Cesium.Cartesian3.fromDegrees(home.lng, home.lat, homeMslHeight)
        const homeFill = Cesium.Color.fromCssColorString(HOME_COLOR)
        const homeBorder = Cesium.Color.fromCssColorString(HOME_BORDER)

        if (homeEntityRef.current !== null) {
          homeEntityRef.current.position = new Cesium.ConstantPositionProperty(homePos)
          if (homeEntityRef.current.point) {
            homeEntityRef.current.point.color = new Cesium.ConstantProperty(homeFill)
            homeEntityRef.current.point.outlineColor = new Cesium.ConstantProperty(homeBorder)
          }
        } else {
          homeEntityRef.current = viewer.entities.add({
            id: 'home-point-planned',
            position: new Cesium.ConstantPositionProperty(homePos),
            point: {
              pixelSize: 18,
              color: homeFill,
              outlineColor: homeBorder,
              outlineWidth: 2.5,
              heightReference: Cesium.HeightReference.NONE,
              disableDepthTestDistance: Number.POSITIVE_INFINITY,
            },
            label: {
              text: 'H',
              font: 'bold 13.2px monospace',
              fillColor: Cesium.Color.WHITE,
              outlineColor: Cesium.Color.BLACK,
              outlineWidth: 2,
              style: Cesium.LabelStyle.FILL_AND_OUTLINE,
              pixelOffset: new Cesium.Cartesian2(0, -30),
              horizontalOrigin: Cesium.HorizontalOrigin.CENTER,
              verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
              heightReference: Cesium.HeightReference.NONE,
              disableDepthTestDistance: Number.POSITIVE_INFINITY,
              showBackground: true,
              backgroundColor: new Cesium.Color(0.035, 0.051, 0.078, 0.84),
              backgroundPadding: new Cesium.Cartesian2(6, 3),
            },
          })
        }
      }

      const presentIds = new Set(sorted.map((m) => m.id))
      for (const [id, entity] of wpEntityMapRef.current) {
        if (!presentIds.has(id)) {
          viewer.entities.remove(entity)
          wpEntityMapRef.current.delete(id)
        }
      }

      const activeSegKeys = new Set<string>()
      for (let i = 0; i < sorted.length - 1; i++) activeSegKeys.add(`dist-${i}-${i + 1}`)
      for (const [key, entity] of distLabelMapRef.current) {
        if (!activeSegKeys.has(key)) {
          viewer.entities.remove(entity)
          distLabelMapRef.current.delete(key)
        }
      }

      if (sorted.length === 0) {
        if (selectedPathRef.current) {
          viewer.entities.remove(selectedPathRef.current)
          selectedPathRef.current = null
        }
        return
      }

      for (let i = 0; i < sorted.length; i++) {
        const wp         = sorted[i]
        const msl        = mslHeights[i]
        const isSelected = selWpId === wp.id
        const isCurrent  = wp.isCurrent ?? false
        const fillHex   = isCurrent ? WP_COLOR_CURRENT  : isSelected ? WP_COLOR_SELECTED  : WP_COLOR_NORMAL
        const borderHex = isCurrent ? WP_BORDER_CURRENT : isSelected ? WP_BORDER_SELECTED : WP_BORDER_NORMAL
        const fill      = Cesium.Color.fromCssColorString(fillHex)
        const border    = Cesium.Color.fromCssColorString(borderHex)
        const pxSize    = isSelected ? 20 : 15
        const pos       = Cesium.Cartesian3.fromDegrees(wp.lng, wp.lat, msl)
        const lbl       = `WP${wp.index + 1}\n${Math.round(wp.altitudeM)} m`

        const existing = wpEntityMapRef.current.get(wp.id)
        if (existing) {
          existing.position = new Cesium.ConstantPositionProperty(pos)
          if (existing.point) {
            existing.point.color        = new Cesium.ConstantProperty(fill)
            existing.point.outlineColor = new Cesium.ConstantProperty(border)
            existing.point.pixelSize    = new Cesium.ConstantProperty(pxSize)
          }
          if (existing.label) existing.label.text = new Cesium.ConstantProperty(lbl)
        } else {
          const entity = viewer.entities.add({
            id:       `wp-point-${wp.id}`,
            position: new Cesium.ConstantPositionProperty(pos),
            point: {
              pixelSize:                pxSize,
              color:                    fill,
              outlineColor:             border,
              outlineWidth:             2.5,
              heightReference:          Cesium.HeightReference.NONE,
              disableDepthTestDistance: Number.POSITIVE_INFINITY,
            },
            label: {
              text:                     lbl,
              font:                     'bold 12.1px monospace',
              fillColor:                Cesium.Color.WHITE,
              outlineColor:             Cesium.Color.BLACK,
              outlineWidth:             2,
              style:                    Cesium.LabelStyle.FILL_AND_OUTLINE,
              pixelOffset:              new Cesium.Cartesian2(0, -32),
              horizontalOrigin:         Cesium.HorizontalOrigin.CENTER,
              verticalOrigin:           Cesium.VerticalOrigin.BOTTOM,
              heightReference:          Cesium.HeightReference.NONE,
              disableDepthTestDistance: Number.POSITIVE_INFINITY,
              showBackground:           true,
              backgroundColor:          new Cesium.Color(0.035, 0.051, 0.078, 0.84),
              backgroundPadding:        new Cesium.Cartesian2(6, 3),
            },
          })
          wpEntityMapRef.current.set(wp.id, entity)
        }
      }

      const pathSource = home === null || home === undefined ? sorted : [home, ...sorted]
      const pathHeights = home === null || home === undefined ? mslHeights : [homeMslHeight, ...mslHeights]

      if (pathSource.length >= 2) {
        const pathPositions = pathSource.map((m, i) => Cesium.Cartesian3.fromDegrees(m.lng, m.lat, pathHeights[i]))
        if (selectedPathRef.current?.polyline) {
          selectedPathRef.current.polyline.positions = new Cesium.ConstantProperty(pathPositions)
        } else {
          if (selectedPathRef.current) viewer.entities.remove(selectedPathRef.current)
          selectedPathRef.current = viewer.entities.add({
            id:       'selected-mission-path',
            polyline: {
              positions:     pathPositions,
              width:         2.5,
              material:      new Cesium.PolylineDashMaterialProperty({
                color:      Cesium.Color.fromCssColorString(PATH_COLOR_IDLE).withAlpha(0.9),
                dashLength: 16,
              }),
              clampToGround: false,
              arcType:       Cesium.ArcType.GEODESIC,
            },
          })
        }
      } else if (selectedPathRef.current) {
        viewer.entities.remove(selectedPathRef.current)
        selectedPathRef.current = null
      }

      if (sorted.length >= 2) {
        const segs = calculateWaypointDistances(sorted.map((m) => ({ lat: m.lat, lng: m.lng })))
        for (const seg of segs) {
          const key = `dist-${seg.fromIndex}-${seg.toIndex}`
          const a   = sorted[seg.fromIndex]
          const b   = sorted[seg.toIndex]
          if (!a || !b) continue
          const midLat   = (a.lat + b.lat) / 2
          const midLng   = (a.lng + b.lng) / 2
          const midMsl   = ((mslHeights[seg.fromIndex] ?? 0) + (mslHeights[seg.toIndex] ?? 0)) / 2 + 15
          const distText = fmtDist(seg.distanceM)
          const midPos   = Cesium.Cartesian3.fromDegrees(midLng, midLat, midMsl)
          const existLabel = distLabelMapRef.current.get(key)
          if (existLabel) {
            existLabel.position = new Cesium.ConstantPositionProperty(midPos)
            if (existLabel.label) existLabel.label.text = new Cesium.ConstantProperty(distText)
          } else {
            const entity = viewer.entities.add({
              id:       `dist-label-${key}`,
              position: new Cesium.ConstantPositionProperty(midPos),
              label: {
                text:                     distText,
                font:                     '600 11px Inter, sans-serif',
                fillColor:                Cesium.Color.fromCssColorString(DIST_LABEL_TEXT),
                outlineColor:             Cesium.Color.BLACK,
                outlineWidth:             1.5,
                style:                    Cesium.LabelStyle.FILL_AND_OUTLINE,
                horizontalOrigin:         Cesium.HorizontalOrigin.CENTER,
                verticalOrigin:           Cesium.VerticalOrigin.CENTER,
                heightReference:          Cesium.HeightReference.NONE,
                disableDepthTestDistance: Number.POSITIVE_INFINITY,
                showBackground:           true,
                backgroundColor:          new Cesium.Color(0.035, 0.051, 0.078, 0.84),
                backgroundPadding:        new Cesium.Cartesian2(6, 2),
              },
            })
            distLabelMapRef.current.set(key, entity)
          }
        }
      }
    }

    syncWaypointsRef.current = syncWaypoints
    syncPolylinesRef.current = syncPolylines

    const syncLeadLine = () => {
      if (!viewerRef.current || viewer.isDestroyed()) return
      if (leadLineEntityRef.current) {
        viewer.entities.remove(leadLineEntityRef.current)
        leadLineEntityRef.current = null
      }
      const ll = droneLeadLineRef.current
      if (!ll) return
      const droneCart = Cesium.Cartesian3.fromDegrees(ll.dronePos.lng, ll.dronePos.lat, 0)
      const wpCart    = Cesium.Cartesian3.fromDegrees(ll.firstWpPos.lng, ll.firstWpPos.lat, 0)
      leadLineEntityRef.current = viewer.entities.add({
        id:       'drone-lead-line',
        polyline: {
          positions: [droneCart, wpCart],
          width:     2.5,
          material:  new Cesium.PolylineDashMaterialProperty({
            color:      Cesium.Color.fromCssColorString(LEAD_LINE_COLOR).withAlpha(0.6),
            dashLength: 20,
          }),
          clampToGround: false,
          arcType:       Cesium.ArcType.GEODESIC,
        },
      })
    }

    syncLeadLineRef.current = syncLeadLine
    syncDrones()
    syncPolylines()
    syncWaypoints()
    syncLeadLine()

    const unsubDrone = useDroneStore.subscribe(() => { syncDrones(); syncLeadLine() })
    const unsubMission = useMissionStore.subscribe(() => {
      syncPolylines()
      if (!isDraggingRef.current) syncWaypoints()
    })

    const handler = new Cesium.ScreenSpaceEventHandler(viewer.canvas)
    let dragWpId: string | null = null
    let dragHome                = false
    let hasDragged              = false
    let wasJustDragging         = false
    let dragMslAlt              = 0

    handler.setInputAction((e: { position: Cesium.Cartesian2 }) => {
      if (!onWaypointDragRef.current && !onHomeDragRef.current) return
      const picked = viewer.scene.pick(e.position)
      if (Cesium.defined(picked) && picked.id) {
        const eid: string = (picked.id as Cesium.Entity).id ?? ''
        if (eid.startsWith('wp-point-')) {
          dragWpId   = eid.slice('wp-point-'.length)
          hasDragged = false
          isDraggingRef.current = true
          const wpEnt = wpEntityMapRef.current.get(dragWpId)
          const wpPos = wpEnt?.position?.getValue(Cesium.JulianDate.now())
          dragMslAlt  = wpPos
            ? Cesium.Cartographic.fromCartesian(wpPos).height
            : (waypointMarkersRef.current.find((m) => m.id === dragWpId)?.altitudeM ?? 0)
          viewer.scene.screenSpaceCameraController.enableRotate    = false
          viewer.scene.screenSpaceCameraController.enableTranslate = false
        }
        if (eid === 'home-point-planned' && onHomeDragRef.current) {
          dragHome = true
          dragWpId = null
          hasDragged = false
          isDraggingRef.current = true
          const homePos = homeEntityRef.current?.position?.getValue(Cesium.JulianDate.now())
          dragMslAlt = homePos
            ? Cesium.Cartographic.fromCartesian(homePos).height
            : (homeMarkerRef.current?.altitudeM ?? 0)
          viewer.scene.screenSpaceCameraController.enableRotate = false
          viewer.scene.screenSpaceCameraController.enableTranslate = false
          return
        }
      }
    }, Cesium.ScreenSpaceEventType.LEFT_DOWN)

    handler.setInputAction((e: { endPosition: Cesium.Cartesian2 }) => {
      if (!dragWpId && !dragHome) return
      hasDragged = true
      let cartesian: Cesium.Cartesian3 | undefined
      const ray = viewer.camera.getPickRay(e.endPosition)
      if (ray) cartesian = viewer.scene.globe.pick(ray, viewer.scene)
      if (!cartesian && viewer.scene.pickPositionSupported) cartesian = viewer.scene.pickPosition(e.endPosition)
      if (!cartesian) return
      const carto = Cesium.Cartographic.fromCartesian(cartesian)
      const lat   = Cesium.Math.toDegrees(carto.latitude)
      const lng   = Cesium.Math.toDegrees(carto.longitude)
      const newPos = Cesium.Cartesian3.fromDegrees(lng, lat, dragMslAlt)
      if (dragHome) {
        if (homeEntityRef.current !== null) {
          homeEntityRef.current.position = new Cesium.ConstantPositionProperty(newPos)
        }
      } else if (dragWpId !== null) {
        const ent = wpEntityMapRef.current.get(dragWpId)
        if (ent) ent.position = new Cesium.ConstantPositionProperty(newPos)
      }

      if (selectedPathRef.current?.polyline) {
        const home = homeMarkerRef.current
        const sorted = [...waypointMarkersRef.current].sort((a, b) => a.index - b.index)
        const pathSource = home === null || home === undefined ? sorted : [home, ...sorted]
        const pathPositions = pathSource.map((m) => {
          if (m === home) {
            return homeEntityRef.current?.position?.getValue(Cesium.JulianDate.now()) ?? newPos
          }
          if (m.id === dragWpId) return newPos
          const e2 = wpEntityMapRef.current.get(m.id)
          return e2?.position?.getValue(Cesium.JulianDate.now()) ?? Cesium.Cartesian3.fromDegrees(m.lng, m.lat, m.altitudeM)
        })
        selectedPathRef.current.polyline.positions = new Cesium.ConstantProperty(pathPositions)
      }
    }, Cesium.ScreenSpaceEventType.MOUSE_MOVE)

    handler.setInputAction((e: { position: Cesium.Cartesian2 }) => {
      if (dragWpId && hasDragged) {
        let cartesian: Cesium.Cartesian3 | undefined
        const ray = viewer.camera.getPickRay(e.position)
        if (ray) cartesian = viewer.scene.globe.pick(ray, viewer.scene)
        if (!cartesian && viewer.scene.pickPositionSupported) cartesian = viewer.scene.pickPosition(e.position)
        if (cartesian) {
          const carto = Cesium.Cartographic.fromCartesian(cartesian)
          const lat   = Cesium.Math.toDegrees(carto.latitude)
          const lng   = Cesium.Math.toDegrees(carto.longitude)
          isDraggingRef.current = false
          onWaypointDragRef.current?.(dragWpId, lat, lng)
          syncWaypoints()
          syncLeadLine()
        } else {
          isDraggingRef.current = false
        }
        wasJustDragging = true
      } else if (dragHome && hasDragged) {
        let cartesian: Cesium.Cartesian3 | undefined
        const ray = viewer.camera.getPickRay(e.position)
        if (ray) cartesian = viewer.scene.globe.pick(ray, viewer.scene)
        if (!cartesian && viewer.scene.pickPositionSupported) cartesian = viewer.scene.pickPosition(e.position)
        if (cartesian) {
          const carto = Cesium.Cartographic.fromCartesian(cartesian)
          const lat = Cesium.Math.toDegrees(carto.latitude)
          const lng = Cesium.Math.toDegrees(carto.longitude)
          isDraggingRef.current = false
          onHomeDragRef.current?.(lat, lng)
          syncWaypoints()
          syncLeadLine()
        } else {
          isDraggingRef.current = false
        }
        wasJustDragging = true
      } else {
        isDraggingRef.current = false
      }
      dragWpId   = null
      dragHome   = false
      hasDragged = false
      viewer.scene.screenSpaceCameraController.enableRotate    = true
      viewer.scene.screenSpaceCameraController.enableTranslate = true
    }, Cesium.ScreenSpaceEventType.LEFT_UP)

    handler.setInputAction((event: { position: Cesium.Cartesian2 }) => {
      if (wasJustDragging) { wasJustDragging = false; return }
      const picked = viewer.scene.pick(event.position)
      if (Cesium.defined(picked) && picked.id) {
        const eid: string = (picked.id as Cesium.Entity).id ?? ''
        if (eid.startsWith('wp-point-')) {
          const wpId = eid.slice('wp-point-'.length)
          onWaypointSelectRef.current?.(wpId)
          return
        }
      }
      if (!addingWpRef.current || !onWpClickRef.current) return
      let cartesian: Cesium.Cartesian3 | undefined
      const ray = viewer.camera.getPickRay(event.position)
      if (ray) cartesian = viewer.scene.globe.pick(ray, viewer.scene)
      if (!cartesian && viewer.scene.pickPositionSupported) cartesian = viewer.scene.pickPosition(event.position)
      if (!cartesian) cartesian = viewer.camera.pickEllipsoid(event.position, viewer.scene.globe.ellipsoid)
      if (!cartesian) return
      const carto = Cesium.Cartographic.fromCartesian(cartesian)
      onWpClickRef.current({ lat: Cesium.Math.toDegrees(carto.latitude), lng: Cesium.Math.toDegrees(carto.longitude) })
    }, Cesium.ScreenSpaceEventType.LEFT_CLICK)

    return () => {
      removeCameraMoveEnd()
      unsubDrone()
      unsubMission()
      syncWaypointsRef.current = null
      syncPolylinesRef.current = null
      syncLeadLineRef.current  = null
      handler.destroy()
      entityMap.clear()
      polylineMap.clear()
      wpEntityMap.clear()
      distLabelMap.clear()
      droneTrail.clear()
      droneTrailTime.clear()
      droneRibbonPositions.clear()
      overlayTrailGeo.clear()
      overlayTrailTime.clear()
      droneAttitude.clear()
      if (homeEntityRef.current !== null && !viewer.isDestroyed()) {
        viewer.entities.remove(homeEntityRef.current)
        homeEntityRef.current = null
      }
      if (!viewer.isDestroyed()) viewer.destroy()
      viewerRef.current = null
    }
  }, [canWriteSharedMapState, viewerRole])

  useEffect(() => {
    if (viewerRole !== 'replay') return

    const unsubscribe = useReplayTrajectoryStore.subscribe(
      (state) => ({
        allPoints: state.allPoints,
        visibleCount: state.visibleCount,
        droneId: state.droneId,
      }),
      (state) => {
        const viewer = viewerRef.current
        if (!viewer || viewer.isDestroyed()) return

        if (state.allPoints.length === 0 || state.visibleCount <= 0) {
          if (replayTrajectoryRef.current !== null) {
            viewer.entities.remove(replayTrajectoryRef.current)
            replayTrajectoryRef.current = null
          }
          if (replayDroneRef.current !== null) {
            viewer.entities.remove(replayDroneRef.current)
            replayDroneRef.current = null
          }
          logCesiumDiagnostic(createCesiumDiagnostic({
            level: 'info',
            code: 'replay-source-empty',
            message: 'Replay 3D source is empty.',
            context: { viewerRole, pointCount: state.allPoints.length, visibleCount: state.visibleCount },
            error: null,
          }))
          return
        }

        const endIndex = Math.min(state.visibleCount - 1, state.allPoints.length - 1)
        const startIndex = trailWindowStart(state.allPoints, endIndex, TRAIL_WINDOW_M)
        const positions = state.allPoints
          .slice(startIndex, endIndex + 1)
          .map((point) => Cesium.Cartesian3.fromDegrees(point.lng, point.lat, point.alt))

        if (replayTrajectoryRef.current === null) {
          replayTrajectoryRef.current = viewer.entities.add({
            polyline: {
              positions,
              width: 4,
              material: Cesium.Color.CYAN,
            },
          })
        } else if (replayTrajectoryRef.current.polyline) {
          replayTrajectoryRef.current.polyline.positions = new Cesium.ConstantProperty(positions)
        }

        const current = state.allPoints[endIndex]
        const currentPosition = Cesium.Cartesian3.fromDegrees(current.lng, current.lat, current.alt + 3)
        if (replayDroneRef.current === null) {
          replayDroneRef.current = viewer.entities.add({
            position: currentPosition,
            point: {
              color: Cesium.Color.CYAN,
              pixelSize: 10,
            },
          })
        } else {
          replayDroneRef.current.position = new Cesium.ConstantPositionProperty(currentPosition)
        }
      },
      { fireImmediately: true },
    )

    return () => {
      unsubscribe()
      const viewer = viewerRef.current
      if (!viewer || viewer.isDestroyed()) return
      if (replayTrajectoryRef.current !== null) viewer.entities.remove(replayTrajectoryRef.current)
      if (replayDroneRef.current !== null) viewer.entities.remove(replayDroneRef.current)
      replayTrajectoryRef.current = null
      replayDroneRef.current = null
    }
  }, [viewerRole])

  useDroneCamera({ viewerRef, terrainHeightCache: droneTerrainHeightCacheRef, overrideMode: forceCameraMode })
  useDroneTrailCurtain({ viewerRef, droneTrailRef, droneTerrainHeightCacheRef })

  const currentZoom = map2DView?.zoom ?? heightToApproxZoom(map3DView?.height ?? DEFAULT_3D_HEIGHT, map3DView?.lat ?? MADRID.lat)
  const flyToFramePoint = useCallback(
    (point: MapFramePoint, height: number): void => {
      const viewer = viewerRef.current
      if (!viewer || viewer.isDestroyed()) return

      const heading = viewer.camera.heading

      viewer.camera.flyTo({
        destination: Cesium.Cartesian3.fromDegrees(point.lng, point.lat, height),
        orientation: {
          heading,
          pitch: TOP_DOWN_CAMERA_PITCH_RAD,
          roll: 0,
        },
        duration: 0.65,
      })

      const zoom = heightToApproxZoom(height, point.lat)
      const bearing = Cesium.Math.toDegrees(heading)
      const pitch = Math.max(0, Cesium.Math.toDegrees(-TOP_DOWN_CAMERA_PITCH_RAD))

      if (canWriteSharedMapState) {
        setSharedMapCenter({ lat: point.lat, lng: point.lng })
        setMap3DView({
          lat: point.lat,
          lng: point.lng,
          height,
          heading,
          pitch: TOP_DOWN_CAMERA_PITCH_RAD,
          roll: 0,
        })
        setMap2DView({
          lat: point.lat,
          lng: point.lng,
          zoom,
          bearing,
          pitch,
        })
      }
    },
    [canWriteSharedMapState, setMap2DView, setMap3DView, setSharedMapCenter],
  )

  const handleZoomToMission = useCallback((): void => {
    if (!canZoomToMission) return
    if (missionFrameCenter === null || missionFrameHeight === null) return

    flyToFramePoint(missionFrameCenter, missionFrameHeight)
  }, [canZoomToMission, flyToFramePoint, missionFrameCenter, missionFrameHeight])

  const handleZoomToVehicle = useCallback((): void => {
    if (!validVehicleFramePoint) return
    flyToFramePoint(validVehicleFramePoint, FRAME_SINGLE_HEIGHT_M)
  }, [flyToFramePoint, validVehicleFramePoint])

  const handleZoomToHome = useCallback((): void => {
    if (!validHomeFramePoint) return
    flyToFramePoint(validHomeFramePoint, FRAME_SINGLE_HEIGHT_M)
  }, [flyToFramePoint, validHomeFramePoint])

  return (
    <div ref={containerRef} style={{ width: '100%', height: '100%', position: 'relative', overflow: 'hidden' }}>
      {effectiveCameraMode === 'FREE' ? (
        <>
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
          <MapZoomControl
            zoom={currentZoom}
            onZoomChange={(newZoom) => {
              const viewer = viewerRef.current
              if (!viewer) return

              const center = {
                lat: map3DView?.lat ?? MADRID.lat,
                lng: map3DView?.lng ?? MADRID.lng
              }
              const newHeight = zoomToApproxHeight(newZoom, center.lat)

              viewer.camera.flyTo({
                destination: Cesium.Cartesian3.fromDegrees(center.lng, center.lat, newHeight),
                orientation: {
                  heading: viewer.camera.heading,
                  pitch: viewer.camera.pitch,
                  roll: viewer.camera.roll,
                },
                duration: 0.2,
              })
            }}
          />
        </>
      ) : null}
    </div>
  )
}

export default CesiumGlobe



