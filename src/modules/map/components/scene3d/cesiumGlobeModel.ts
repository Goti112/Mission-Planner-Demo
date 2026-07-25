import * as Cesium from 'cesium'
import type { Map2DViewState, Map3DViewState, SharedMapCenter } from '../../../../shared/store/uiStore'
import { PUBLIC_ASSET_URLS } from '../../../../shared/utils/publicAssetUrl'

/* ── Constants ────────────────────────────────────────────────────────────── */

export const PHOTOREALISTIC_ASSET_ID = 2275207

export const MODEL_URL = PUBLIC_ASSET_URLS.droneModel

export const MODEL_SCALE = 8
export const MODEL_MIN_PIXEL_SIZE = 28
export const MODEL_MAX_SCALE = 110
export const MODEL_ALTITUDE_LIFT_M = 2.5
export const MODEL_YAW_OFFSET_DEG = 0
export const ATTITUDE_SMOOTH_TAU_MS = 160

export const MADRID = { lat: 40.4168, lng: -3.7038 }
export const DEFAULT_3D_HEIGHT = 1500
export const TOP_DOWN_CAMERA_PITCH_RAD = Cesium.Math.toRadians(-90)

export const FRAME_SINGLE_HEIGHT_M = 650
export const FRAME_ROUTE_MIN_HEIGHT_M = 750
export const FRAME_ROUTE_MAX_HEIGHT_M = 8000

/* ── Types ────────────────────────────────────────────────────────────────── */

export interface DroneAttitudeState {
  yaw: number
  pitch: number
  roll: number
  lastTs: number
}

export interface MapFramePoint {
  readonly lat: number
  readonly lng: number
}

export interface Initial3DViewState {
  lat: number
  lng: number
  height: number
  heading: number
  pitch: number
  roll: number
}

/* ── Pure helpers ─────────────────────────────────────────────────────────── */

export const normalizeHeadingDeg = (value: number): number => {
  const wrapped = value % 360
  return wrapped < 0 ? wrapped + 360 : wrapped
}

export const shortestArcDeg = (from: number, to: number): number =>
  ((to - from + 540) % 360) - 180

export const zoomToApproxHeight = (zoom: number, latDeg: number): number => {
  const latRad = Cesium.Math.toRadians(latDeg)
  const metersPerPixel = (156543.03392 * Math.cos(latRad)) / Math.pow(2, zoom)
  const virtualViewportPx = 900
  const fovRad = Cesium.Math.toRadians(60)
  return Math.max(50, (metersPerPixel * virtualViewportPx) / (2 * Math.tan(fovRad / 2)))
}

export const heightToApproxZoom = (height: number, latDeg: number): number => {
  const latRad = Cesium.Math.toRadians(latDeg)
  const virtualViewportPx = 900
  const fovRad = Cesium.Math.toRadians(60)
  const metersPerPixel = (height * 2 * Math.tan(fovRad / 2)) / virtualViewportPx
  const safeMpp = Math.max(metersPerPixel, 1e-6)
  const zoom = Math.log2((156543.03392 * Math.cos(latRad)) / safeMpp)
  return Math.max(1, Math.min(22, zoom))
}

export const createInitial3DViewState = (
  map2DView: Map2DViewState | null,
  map3DView: Map3DViewState | null,
  sharedMapCenter: SharedMapCenter,
): Initial3DViewState => {
  if (map2DView) {
    return {
      lat: map2DView.lat,
      lng: map2DView.lng,
      height: zoomToApproxHeight(map2DView.zoom, map2DView.lat),
      heading: Cesium.Math.toRadians(map2DView.bearing),
      pitch: TOP_DOWN_CAMERA_PITCH_RAD,
      roll: 0,
    }
  }

  if (map3DView) {
    return {
      lat: map3DView.lat,
      lng: map3DView.lng,
      height: map3DView.height,
      heading: map3DView.heading,
      pitch: map3DView.pitch,
      roll: map3DView.roll,
    }
  }

  return {
    lat: sharedMapCenter.lat,
    lng: sharedMapCenter.lng,
    height: DEFAULT_3D_HEIGHT,
    heading: 0,
    pitch: TOP_DOWN_CAMERA_PITCH_RAD,
    roll: 0,
  }
}

export const isValidFramePoint = (point: MapFramePoint | null | undefined): point is MapFramePoint => {
  if (point == null) return false
  if (!Number.isFinite(point.lat) || !Number.isFinite(point.lng)) return false
  if (Math.abs(point.lat) > 90 || Math.abs(point.lng) > 180) return false
  return true
}

export const calculateFrameCenter = (points: readonly MapFramePoint[]): MapFramePoint | null => {
  const validPoints = points.filter(isValidFramePoint)
  if (validPoints.length === 0) return null

  const sum = validPoints.reduce(
    (accumulator, point) => ({
      lat: accumulator.lat + point.lat,
      lng: accumulator.lng + point.lng,
    }),
    { lat: 0, lng: 0 },
  )

  return {
    lat: sum.lat / validPoints.length,
    lng: sum.lng / validPoints.length,
  }
}

export const calculateFrameHeight = (points: readonly MapFramePoint[]): number | null => {
  const validPoints = points.filter(isValidFramePoint)
  if (validPoints.length === 0) return null
  if (validPoints.length < 2) return FRAME_SINGLE_HEIGHT_M

  const center = calculateFrameCenter(validPoints)
  if (center === null) return null

  const centerCartesian = Cesium.Cartesian3.fromDegrees(center.lng, center.lat, 0)
  const maxDistanceM = validPoints.reduce((maxDistance, point) => {
    const pointCartesian = Cesium.Cartesian3.fromDegrees(point.lng, point.lat, 0)
    const distanceM = Cesium.Cartesian3.distance(centerCartesian, pointCartesian)
    return Math.max(maxDistance, distanceM)
  }, 0)

  const routeHeightM = maxDistanceM * 3.2
  return Math.max(FRAME_ROUTE_MIN_HEIGHT_M, Math.min(FRAME_ROUTE_MAX_HEIGHT_M, routeHeightM))
}
