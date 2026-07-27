/**
 * DroneTrailRenderer.tsx
 *
 * Per-drone altitude-gradient trajectory trail for the 2D Mapbox map.
 *
 * Visual design:
 *   • Each path segment is coloured by its midpoint AGL altitude using the
 *     same colour mapping as the 3D Cesium overlay (shared altitudeColors.ts).
 *   • Older segments fade out gracefully; the most recent is fully opaque.
 *   • Altitude curtain indicator (text badge + gradient bar) also uses the
 *     altitude colour so all elements stay in sync.
 *
 * Implementation:
 *   • Builds a GeoJSON FeatureCollection where every Feature is a single
 *     two-point LineString.  Each Feature carries a `color` (hex) and an
 *     `opacity` property, consumed by data-driven Mapbox paint expressions.
 *   • This avoids Mapbox's line-gradient limitations (static expression,
 *     requires lineMetrics) and gives per-segment control at any zoom level.
 *
 * Must be used INSIDE the react-map-gl <Map> context.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react'
import { Source, Layer } from 'react-map-gl/mapbox'
import type { LayerProps } from 'react-map-gl/mapbox'
import { getColorFromMSL, toHex } from '../../../../shared/utils/altitudeColors'

// ── Types ──────────────────────────────────────────────────────────────────────

interface TrailPoint {
  lng: number
  lat: number
  /** AGL altitude in metres (from GPS) */
  alt: number
  /** MSL altitude in metres (from barometer) — optional */
  msl?: number
  /** Capture timestamp in ms for time-based pruning. */
  tMs: number
}

// ── Constants ──────────────────────────────────────────────────────────────────

/** Minimum movement (degrees) before a new point is recorded (~2-3 m). */
const MIN_MOVE_DEG = 0.00003
/** Treat larger jumps as a discontinuity (startup/no-fix teleport) and reset trail. */
const RESET_JUMP_DEG = 0.02 // ~2.2 km latitude-equivalent
/** Keep only the last minute of trajectory history. */
const TRAIL_TTL_MS = 60_000

// ── GeoJSON builder ────────────────────────────────────────────────────────────

/**
 * Build a FeatureCollection of per-segment LineStrings.
 *
 * Each Feature carries:
 *   color   — CSS hex string from MSL altitude mapped over [0, 5000] m
 *   opacity — fade factor: older = more transparent, newest = fully opaque
 *
 * Individual features per segment (vs. a single line-gradient) gives
 * per-point altitude accuracy with no colour banding artefacts.
 */
function buildSegmentedGeoJSON(
  trail: TrailPoint[],
): GeoJSON.FeatureCollection<GeoJSON.LineString> {
  if (trail.length < 2) return { type: 'FeatureCollection', features: [] }

  const totalSegs = trail.length - 1
  const features: GeoJSON.Feature<GeoJSON.LineString>[] = []

  for (let i = 1; i < trail.length; i++) {
    const p0     = trail[i - 1]
    const p1     = trail[i]
    // Prefer barometric MSL; fall back to AGL when MSL is unavailable
    const midMSL = p0.msl !== undefined && p1.msl !== undefined
      ? (p0.msl + p1.msl) * 0.5
      : (p0.alt + p1.alt) * 0.5
    // Fade older segments: oldest = 0.25 opacity, newest = 1.0
    const progress = (i - 1) / totalSegs
    const opacity  = parseFloat((0.25 + 0.75 * progress).toFixed(3))

    features.push({
      type: 'Feature',
      properties: {
        color:   toHex(getColorFromMSL(midMSL)),
        opacity,
      },
      geometry: {
        type: 'LineString',
        coordinates: [
          [p0.lng, p0.lat],
          [p1.lng, p1.lat],
        ],
      },
    })
  }

  return { type: 'FeatureCollection', features }
}

// ── Props ──────────────────────────────────────────────────────────────────────

export interface DroneTrailRendererProps {
  /** Unique drone identifier — used to namespace Mapbox source/layer IDs. */
  droneId: string
  /** Visual latitude sampled from the shared map pose pipeline. */
  lat: number
  /** Visual longitude sampled from the shared map pose pipeline. */
  lng: number
  /** Visual altitude associated with the same sampled pose. */
  altitudeM: number
  /** Altitude above mean sea level in metres (from barometer). Optional. */
  altitudeMSL?: number
}

// ── Main Component ─────────────────────────────────────────────────────────────

const DroneTrailRenderer: React.FC<DroneTrailRendererProps> = ({
  droneId,
  lat,
  lng,
  altitudeM,
  altitudeMSL,
}) => {
  const trailRef = useRef<TrailPoint[]>([])

  const [trailGeoJSON, setTrailGeoJSON] =
    useState<GeoJSON.FeatureCollection<GeoJSON.LineString>>(
      () => ({ type: 'FeatureCollection', features: [] }),
    )
  const publishTrail = useCallback((next: GeoJSON.FeatureCollection<GeoJSON.LineString>) => {
    requestAnimationFrame(() => setTrailGeoJSON(next))
  }, [])

  // ── Append new position to trail on every meaningful move ──────────────────
  // The trail must capture the exact same visual pose used by the aircraft icon.
  // If icon and trail read different timelines, the aircraft appears offset from
  // its own path under irregular real telemetry.
  useEffect(() => {
    // Defensive guard for malformed telemetry frames.
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return
    if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return

    const nowMs = Date.now()
    const trail = trailRef.current
    const last  = trail[trail.length - 1]
    let pruned = false
    while (trail.length > 0 && nowMs - trail[0].tMs > TRAIL_TTL_MS) {
      trail.shift()
      pruned = true
    }

    const nextPoint: TrailPoint = { lng, lat, alt: Math.max(0, altitudeM), msl: altitudeMSL, tMs: nowMs }

    if (!last) {
      trail.push(nextPoint)
      if (pruned) publishTrail({ type: 'FeatureCollection', features: [] })
      return
    }

    const dLng = last.lng - lng
    const dLat = last.lat - lat
    const distDeg = Math.hypot(dLng, dLat)

    // On source swaps / first valid GPS fix we can jump thousands of metres.
    // Reset the trail to avoid drawing a fake segment from stale origin.
    if (distDeg > RESET_JUMP_DEG) {
      trailRef.current = [nextPoint]
      publishTrail({ type: 'FeatureCollection', features: [] })
      return
    }

    if (distDeg < MIN_MOVE_DEG) {
      if (pruned) {
        publishTrail(
          trail.length >= 2
            ? buildSegmentedGeoJSON(trail)
            : { type: 'FeatureCollection', features: [] },
        )
      }
      return
    }

    trail.push(nextPoint)
    if (trail.length >= 2) {
      publishTrail(buildSegmentedGeoJSON(trail))
    } else {
      publishTrail({ type: 'FeatureCollection', features: [] })
    }
  }, [lat, lng, altitudeM, altitudeMSL, publishTrail])

  // ── Unique layer/source IDs — one set per drone ────────────────────────────
  const trailSrc = `drone-trail-src-${droneId}`
  const trailLyr = `drone-trail-lyr-${droneId}`

  // ── Trail layer — data-driven colour and opacity from GeoJSON properties ──
  const trailLayer: LayerProps = {
    id:   trailLyr,
    type: 'line',
    layout: {
      'line-cap':  'round',
      'line-join': 'round',
    },
    paint: {
      // Both expressions read per-feature properties set in buildSegmentedGeoJSON
      'line-color':   ['get', 'color']   as unknown as string,
      'line-opacity': ['get', 'opacity'] as unknown as number,
      'line-width': [
        'interpolate', ['linear'], ['zoom'],
        10, 2.5,
        18, 6,
      ] as unknown as number,
    },
  }

  return (
    <Source id={trailSrc} type="geojson" data={trailGeoJSON}>
      <Layer {...trailLayer} />
    </Source>
  )
}

export default DroneTrailRenderer

