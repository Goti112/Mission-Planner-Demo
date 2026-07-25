/**
 * MissionRenderConfig — Shared visual tokens for mission rendering.
 *
 * ALL map modes (2D Mapbox streets/satellite/hybrid and 3D Cesium)
 * import from here so waypoint colours, path colours, and distance
 * label styles are IDENTICAL across every view.
 */

// ── Shared data type ───────────────────────────────────────────────────────────

/** Waypoint marker data consumed by both 2D and 3D renderers. */
export interface WaypointMarkerData {
  id:        string
  lat:       number
  lng:       number
  /** 0-based index — displayed as index+1 on pin */
  index:     number
  altitudeM: number
  isCurrent?: boolean
}

export interface HomeMarkerData {
  readonly id: string
  readonly lat: number
  readonly lng: number
  readonly altitudeM: number
}

export interface FenceMapVertexData {
  readonly lat: number
  readonly lng: number
}

export type FenceBoundaryMapData = 'inclusion' | 'exclusion'

export interface FencePolygonMarkerData {
  readonly id: string
  readonly name: string
  readonly boundary: FenceBoundaryMapData
  readonly shape: 'polygon'
  readonly vertices: readonly FenceMapVertexData[]
}

export interface FenceCircleMarkerData {
  readonly id: string
  readonly name: string
  readonly boundary: FenceBoundaryMapData
  readonly shape: 'circle'
  readonly center: FenceMapVertexData
  readonly radiusM: number
}

export interface RallyMarkerData {
  readonly id: string
  readonly name: string
  readonly lat: number
  readonly lng: number
}

export interface SurveyAreaMapData {
  readonly id: string
  readonly name: string
  readonly vertices: readonly FenceMapVertexData[]
}

export interface SelectedAdvancedLayerMapData {
  readonly type: 'fence' | 'rally'
  readonly id: string
  readonly vertexIndex: number | null
}

export interface AdvancedLayerMapData {
  readonly fences: readonly (FencePolygonMarkerData | FenceCircleMarkerData)[]
  readonly rallyPoints: readonly RallyMarkerData[]
  readonly surveyAreas: readonly SurveyAreaMapData[]
  readonly selectedLayer: SelectedAdvancedLayerMapData | null
}

// ── Waypoint pin colours ───────────────────────────────────────────────────────

export const WP_COLOR_NORMAL   = '#00bcd4'   // cyan
export const WP_COLOR_CURRENT  = '#ff7043'   // amber
export const WP_COLOR_SELECTED = '#7c4dff'   // purple

export const WP_BORDER_NORMAL   = '#006064'
export const WP_BORDER_CURRENT  = '#bf360c'
export const WP_BORDER_SELECTED = '#4527a0'

export const WP_ALT_COLOR_NORMAL   = '#9ecfe8'
export const WP_ALT_COLOR_SELECTED = '#c4b0ff'
export const WP_ALT_COLOR_CURRENT  = '#ffab91'

// ── HOME marker colours ────────────────────────────────────────────────────────

export const HOME_COLOR = '#4caf50'
export const HOME_BORDER = '#d8ffe4'
export const HOME_ALT_COLOR = '#c8f7d2'

// ── Mission path ───────────────────────────────────────────────────────────────

/** Planning / idle path — dashed cyan */
export const PATH_COLOR_IDLE      = '#00bcd4'
/** Active mission path */
export const PATH_COLOR_RUNNING   = '#ff4444'
/** Completed mission path */
export const PATH_COLOR_COMPLETED = '#4caf50'
/** Drone-to-first-waypoint lead line — amber-orange */
export const LEAD_LINE_COLOR      = '#ff9800'

// ── Distance label chip ────────────────────────────────────────────────────────

export const DIST_LABEL_BG     = 'rgba(9, 13, 22, 0.84)'
export const DIST_LABEL_BORDER = 'rgba(0, 188, 212, 0.45)'
export const DIST_LABEL_TEXT   = '#80deea'

// ── Advanced mission layers ───────────────────────────────────────────────────

export const FENCE_INCLUSION_COLOR = '#34d399'
export const FENCE_EXCLUSION_COLOR = '#f87171'
export const FENCE_VERTEX_COLOR    = '#fbbf24'
export const RALLY_POINT_COLOR     = '#38bdf8'
export const SURVEY_AREA_COLOR     = '#a78bfa'
export const SURVEY_VERTEX_COLOR   = '#c4b5fd'
