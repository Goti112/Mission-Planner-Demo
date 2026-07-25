export interface GeoPoint {
  lat: number
  lng: number
}

export const MADRID_SEED_CENTER: GeoPoint = {
  lat: 40.4168,
  lng: -3.7038,
}

export const LIVE_RECENTER_DISTANCE_M = 1000
const NULL_ISLAND_EPSILON_DEG = 0.000001

export function isFiniteGeoPoint(point: GeoPoint): boolean {
  return Number.isFinite(point.lat)
    && Number.isFinite(point.lng)
    && Math.abs(point.lat) <= 90
    && Math.abs(point.lng) <= 180
}

export function isUsableLiveCameraPoint(point: GeoPoint): boolean {
  if (!isFiniteGeoPoint(point)) {
    return false
  }

  return Math.abs(point.lat) > NULL_ISLAND_EPSILON_DEG
    || Math.abs(point.lng) > NULL_ISLAND_EPSILON_DEG
}

export function haversineDistanceMeters(from: GeoPoint, to: GeoPoint): number {
  const earthRadiusM = 6371000
  const lat1 = from.lat * (Math.PI / 180)
  const lat2 = to.lat * (Math.PI / 180)
  const dLat = (to.lat - from.lat) * (Math.PI / 180)
  const dLng = (to.lng - from.lng) * (Math.PI / 180)
  const sinDLat = Math.sin(dLat / 2)
  const sinDLng = Math.sin(dLng / 2)
  const a = sinDLat * sinDLat
    + Math.cos(lat1) * Math.cos(lat2) * sinDLng * sinDLng
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return earthRadiusM * c
}

export function shouldRecenterOnLiveFix(
  currentCenter: GeoPoint,
  dronePoint: GeoPoint,
): boolean {
  if (!isFiniteGeoPoint(currentCenter) || !isUsableLiveCameraPoint(dronePoint)) {
    return false
  }

  const farFromCurrentCenter = haversineDistanceMeters(currentCenter, dronePoint) >= LIVE_RECENTER_DISTANCE_M
  const farFromMadridSeed = haversineDistanceMeters(MADRID_SEED_CENTER, dronePoint) >= LIVE_RECENTER_DISTANCE_M

  return farFromCurrentCenter && farFromMadridSeed
}
