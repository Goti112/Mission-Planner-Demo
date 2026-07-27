/**
 * MissionPathRenderer.tsx — Renders the mission polyline and segment distance labels.
 *
 * Must be used INSIDE the react-map-gl <Map> context.
 *
 * Renders:
 *   1. A GeoJSON LineString layer (dashed cyan line) for the mission path.
 *   2. A <Marker> at the midpoint of each segment with a distance chip label.
 *
 * Distance labels auto-update whenever waypoint positions change.
 */

import React, { useMemo } from 'react'
import { Source, Layer, Marker } from 'react-map-gl/mapbox'
import type { LayerProps } from 'react-map-gl/mapbox'
import { calculateWaypointDistances, fmtDist } from '../../../mission'
import { PATH_COLOR_IDLE, DIST_LABEL_BG, DIST_LABEL_BORDER, DIST_LABEL_TEXT } from './rendering/MissionRenderConfig'

// ── Props ─────────────────────────────────────────────────────────────────────

export interface PathWaypoint {
  lat: number
  lng: number
}

interface MissionPathRendererProps {
  waypoints: PathWaypoint[]
  /** Show segment distance chip labels (default true) */
  showDistanceLabels?: boolean
}

// ── Mapbox layer definition ────────────────────────────────────────────────────

const LINE_LAYER: LayerProps = {
  id:     'mission-line',
  type:   'line',
  paint:  {
    'line-color':     PATH_COLOR_IDLE,
    'line-width':     2,
    'line-opacity':   0.9,
    'line-dasharray': [5, 3],
  },
}

// ── Component ─────────────────────────────────────────────────────────────────

const MissionPathRenderer: React.FC<MissionPathRendererProps> = ({
  waypoints,
  showDistanceLabels = true,
}) => {
  /* GeoJSON LineString for the Mapbox layer */
  const geojson = useMemo<GeoJSON.Feature<GeoJSON.LineString>>(() => ({
    type:     'Feature',
    properties: {},
    geometry: {
      type:        'LineString',
      coordinates: waypoints.map((wp) => [wp.lng, wp.lat]),
    },
  }), [waypoints])

  /* Segment midpoints and distances for chip labels */
  const segmentLabels = useMemo(() => {
    if (!showDistanceLabels || waypoints.length < 2) return []

    // calculateWaypointDistances only requires { lat, lng } — PathWaypoint qualifies.
    const segs = calculateWaypointDistances(waypoints)

    return segs.map((seg) => {
      const a = waypoints[seg.fromIndex]
      const b = waypoints[seg.toIndex]
      return {
        key:      `seg-${seg.fromIndex}-${seg.toIndex}`,
        midLat:   (a.lat + b.lat) / 2,
        midLng:   (a.lng + b.lng) / 2,
        label:    fmtDist(seg.distanceM),
      }
    })
  }, [waypoints, showDistanceLabels])

  if (waypoints.length < 2) return null

  return (
    <>
      {/* ── Dashed polyline ── */}
      <Source id="mission-path" type="geojson" data={geojson}>
        <Layer {...LINE_LAYER} />
      </Source>

      {/* ── Segment distance chips ── */}
      {segmentLabels.map((seg) => (
        <Marker
          key={seg.key}
          longitude={seg.midLng}
          latitude={seg.midLat}
          anchor="center"
        >
          <div
          style={{
              padding:       '2px 6px',
              borderRadius:  10,
              background:    DIST_LABEL_BG,
              border:        `1px solid ${DIST_LABEL_BORDER}`,
              color:         DIST_LABEL_TEXT,
              fontSize:      10.45,
              fontWeight:    600,
              letterSpacing: '0.02em',
              whiteSpace:    'nowrap',
              pointerEvents: 'none',
              backdropFilter: 'blur(4px)',
            }}
          >
            {seg.label}
          </div>
        </Marker>
      ))}
    </>
  )
}

export default MissionPathRenderer
