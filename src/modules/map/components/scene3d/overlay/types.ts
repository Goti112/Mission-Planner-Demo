/* ═══════════════════════════════════════════════════════════════
   Cesium Overlay — Type Definitions
   ═══════════════════════════════════════════════════════════════ */

/**
 * A 2D screen-space coordinate.
 * x/y in CSS pixels, origin top-left.
 */
export interface ScreenPoint {
  x: number
  y: number
}

/**
 * A geographic position with altitude.
 * Latitude/longitude in decimal degrees, altitude in metres MSL.
 */
export interface GeoPosition {
  lat: number
  lng: number
  altitudeMSL: number
  /** Altitude above ground level in metres (AGL). Used for colour mapping. */
  altitudeAGL: number
}

/**
 * Trail data for one drone.
 * Positions are ordered oldest → newest.
 */
export interface DroneTrailData {
  droneId: string
  /** Ordered trail positions (oldest first) */
  positions: GeoPosition[]
  /** Current live drone position */
  currentPosition: GeoPosition
  /** Drone heading in degrees (0 = north, CW) */
  headingDeg: number
  /** Whether this is the active (selected) drone */
  isActive: boolean
  /**
   * Terrain MSL elevation at the drone's lat/lng in metres.
   * Used to project the ground marker onto the terrain surface instead of
   * altitude-0 MSL (which would be underground at elevated terrain sites).
   * Undefined until the first async terrain sample resolves.
   */
  terrainAltMSL?: number
}

/**
 * Configuration for overlay visual styling.
 * All numeric values are in CSS pixels or normalised [0–1].
 */
export interface OverlayStyle {
  /** Trajectory line width in px */
  trajectoryWidth: number
  /** Active drone trajectory colour (CSS) */
  trajectoryColorActive: string
  /** Passive drone trajectory colour (CSS) */
  trajectoryColorPassive: string
  /** Projected drone marker radius in px */
  markerRadius: number
  /** Projected drone marker fill colour */
  markerFillActive: string
  markerFillPassive: string
  /** Reference plane fill colour (with alpha) */
  refPlaneFill: string
  /** Reference plane border colour */
  refPlaneBorder: string
  /** Heading indicator length in px */
  headingIndicatorLength: number
}

/** Default avionics-style overlay configuration. */
export const DEFAULT_OVERLAY_STYLE: OverlayStyle = {
  trajectoryWidth:        2.5,
  trajectoryColorActive:  '#ff3c3c',
  trajectoryColorPassive: '#7a8a9e',
  markerRadius:           6,
  markerFillActive:       '#ff3c3c',
  markerFillPassive:      '#7a8a9e',
  refPlaneFill:           'rgba(40, 200, 100, 0.08)',
  refPlaneBorder:         'rgba(40, 200, 100, 0.25)',
  headingIndicatorLength: 22,
}
