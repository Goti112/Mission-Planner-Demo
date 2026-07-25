/**
 * DroneLeadLineRenderer.tsx — Renders a dashed lead line from the drone's
 * current position to the first mission waypoint.
 *
 * Must be used INSIDE the react-map-gl <Map> context.
 *
 * Visually distinct from the mission path:
 *   • Amber-orange colour (#ff9800)
 *   • 60% opacity
 *   • Wider dash gaps (dasharray [8, 6]) for a clearly "pre-flight" look
 */

import React, { useMemo } from 'react'
import { Source, Layer } from 'react-map-gl'
import type { LineLayer } from 'react-map-gl'
import { LEAD_LINE_COLOR } from './rendering/MissionRenderConfig'

// ── Props ─────────────────────────────────────────────────────────────────────

export interface DroneLeadLineRendererProps {
  dronePosition:   { lat: number; lng: number }
  firstWpPosition: { lat: number; lng: number }
}

// ── Mapbox layer definition ────────────────────────────────────────────────────

const LEAD_LAYER: LineLayer = {
  id:    'drone-lead-line',
  type:  'line',
  paint: {
    'line-color':     LEAD_LINE_COLOR,
    'line-width':     2,
    'line-opacity':   0.6,
    'line-dasharray': [8, 6],
  },
}

// ── Component ─────────────────────────────────────────────────────────────────

const DroneLeadLineRenderer: React.FC<DroneLeadLineRendererProps> = ({
  dronePosition,
  firstWpPosition,
}) => {
  const geojson = useMemo<GeoJSON.Feature<GeoJSON.LineString>>(
    () => ({
      type:       'Feature',
      properties: {},
      geometry: {
        type:        'LineString',
        coordinates: [
          [dronePosition.lng,   dronePosition.lat],
          [firstWpPosition.lng, firstWpPosition.lat],
        ],
      },
    }),
    [dronePosition, firstWpPosition],
  )

  return (
    <Source id="drone-lead-path" type="geojson" data={geojson}>
      <Layer {...LEAD_LAYER} />
    </Source>
  )
}

export default DroneLeadLineRenderer
