/**
 * WaypointMarker.tsx — Draggable waypoint pin for the Mapbox planning map.
 *
 * Renders inside react-map-gl's <Map> context.
 *
 * Features:
 *   • Teardrop pin shape with WP index number
 *   • Altitude label below the pin  (e.g. "60 m")
 *   • Selected state — cyan glow outline
 *   • Current (active in-mission) state — amber colour
 *   • Draggable — smooth drag with local state, commits on dragEnd
 *   • Click to select
 *
 * Drag architecture:
 *   react-map-gl's <Marker draggable> manages its own DOM position during a
 *   drag via setLngLat() internally. We MUST NOT change the longitude/latitude
 *   props mid-drag, because that would call setLngLat() a second time and
 *   create the "tug-of-war" / snap-back bug.
 *
 *   Instead:
 *   • onDragStart → notify parent + WaypointDragController
 *   • onDrag      → update local dragPos state (stays inside this component)
 *                   + call onDragMove for path/stats live preview
 *   • onDragEnd   → commit to store via onDragEnd prop, clear local drag state
 *
 *   The <Marker longitude/latitude> props always use the STABLE store values
 *   passed in via props (never the local drag position) so react-map-gl is
 *   the single source of truth for DOM positioning during a drag.
 */

import React, { useState, useCallback, useRef } from 'react'
import { Marker } from 'react-map-gl/mapbox'
import type { MarkerDragEvent } from 'react-map-gl/mapbox'
import {
  WP_COLOR_NORMAL, WP_COLOR_CURRENT, WP_COLOR_SELECTED,
  WP_BORDER_NORMAL, WP_BORDER_CURRENT, WP_BORDER_SELECTED,
  WP_ALT_COLOR_NORMAL, WP_ALT_COLOR_SELECTED, WP_ALT_COLOR_CURRENT,
} from './rendering/MissionRenderConfig'
import { waypointDragController } from './interactions/WaypointDragController'

// ── Props ─────────────────────────────────────────────────────────────────────

export interface WaypointMarkerProps {
  id:         string
  lat:        number
  lng:        number
  /** 0-based index — displayed as index+1 on pin */
  index:      number
  altitudeM:  number
  isCurrent?: boolean
  isSelected?: boolean
  /** Optional label override, used for HOME marker. Defaults to index+1. */
  label?: string
  /** Hides altitude chip for HOME when desired. */
  showAltitude?: boolean
  /** Optional color override, used by HOME marker. */
  pinColorOverride?: string
  /** Optional border override, used by HOME marker. */
  pinBorderOverride?: string
  /** Optional altitude label color override. */
  altitudeColorOverride?: string
  /** Called when user finishes dragging the marker — commit to store */
  onDragEnd?:   (id: string, lat: number, lng: number) => void
  /** Called continuously while dragging — for live path preview (never touches store) */
  onDragMove?:  (id: string, lat: number, lng: number) => void
  /** Called when drag starts — for controller notification */
  onDragStart?: (id: string) => void
  /** Called when user clicks the marker */
  onSelect?:    (id: string) => void
}

// ── Constants (aliases for local brevity) ────────────────────────────────────

const COLOR_NORMAL   = WP_COLOR_NORMAL
const COLOR_CURRENT  = WP_COLOR_CURRENT
const COLOR_SELECTED = WP_COLOR_SELECTED

const BORDER_NORMAL   = WP_BORDER_NORMAL
const BORDER_CURRENT  = WP_BORDER_CURRENT
const BORDER_SELECTED = WP_BORDER_SELECTED

// ── Component ─────────────────────────────────────────────────────────────────

const WaypointMarker: React.FC<WaypointMarkerProps> = ({
  id,
  lat,
  lng,
  index,
  altitudeM,
  isCurrent  = false,
  isSelected = false,
  label,
  showAltitude = true,
  pinColorOverride,
  pinBorderOverride,
  altitudeColorOverride,
  onDragEnd,
  onDragMove,
  onDragStart,
  onSelect,
}) => {
  /**
   * LOCAL drag state — used only for displaying real-time altitude label
   * or future per-marker drag feedback. This never feeds back into the
   * <Marker longitude/latitude> props (that would reset the DOM position).
   */
  const isDraggingRef = useRef(false)

  // Track the display altitude during drag (for label updates if desired)
  const [_dragging, setDragging] = useState(false) // triggers cursor style update

  const handleDragStart = useCallback(
    (e: MarkerDragEvent) => {
      isDraggingRef.current = true
      setDragging(true)
      waypointDragController.handleDragStart(id, e.lngLat.lat, e.lngLat.lng)
      onDragStart?.(id)
    },
    [id, onDragStart],
  )

  const handleDragMove = useCallback(
    (e: MarkerDragEvent) => {
      if (!isDraggingRef.current) return
      const { lat: mLat, lng: mLng } = e.lngLat
      waypointDragController.handleDragMove(id, mLat, mLng)
      onDragMove?.(id, mLat, mLng)
    },
    [id, onDragMove],
  )

  const handleDragEnd = useCallback(
    (e: MarkerDragEvent) => {
      isDraggingRef.current = false
      setDragging(false)
      const { lat: eLat, lng: eLng } = e.lngLat
      waypointDragController.handleDragEnd(id, eLat, eLng)
      onDragEnd?.(id, eLat, eLng)
    },
    [id, onDragEnd],
  )

  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation()
      onSelect?.(id)
    },
    [id, onSelect],
  )

  const pinColor = pinColorOverride ?? (isCurrent ? COLOR_CURRENT : isSelected ? COLOR_SELECTED : COLOR_NORMAL)
  const pinBorder = pinBorderOverride ?? (isCurrent ? BORDER_CURRENT : isSelected ? BORDER_SELECTED : BORDER_NORMAL)
  const altitudeColor = altitudeColorOverride ?? (isSelected ? WP_ALT_COLOR_SELECTED : isCurrent ? WP_ALT_COLOR_CURRENT : WP_ALT_COLOR_NORMAL)
  const markerLabel = label ?? (index + 1).toString()

  return (
    /*
     * IMPORTANT: longitude and latitude always use the STABLE props (from the
     * store), never a local drag position. react-map-gl's draggable Marker
     * tracks its own DOM position internally while the user drags. Feeding new
     * prop values mid-drag would invoke setLngLat() a second time and produce
     * the snap-back / jitter effect.
     */
    <Marker
      longitude={lng}
      latitude={lat}
      anchor="bottom"
      draggable={!!onDragEnd}
      onDragStart={handleDragStart}
      onDrag={onDragMove ? handleDragMove : undefined}
      onDragEnd={handleDragEnd}
    >
      <div
        style={{
          display:        'flex',
          flexDirection:  'column',
          alignItems:     'center',
          cursor:         _dragging ? 'grabbing' : onDragEnd ? 'grab' : 'pointer',
          userSelect:     'none',
          filter:         isSelected
            ? 'drop-shadow(0 0 5px rgba(124,77,255,0.8))'
            : isCurrent
            ? 'drop-shadow(0 0 4px rgba(255,112,67,0.7))'
            : 'drop-shadow(0 2px 4px rgba(0,0,0,0.5))',
        }}
        onClick={handleClick}
      >
        {/* Pin body — teardrop shape */}
        <div
          style={{
            width:        28,
            height:       28,
            borderRadius: '50% 50% 50% 0',
            transform:    'rotate(-45deg)',
            background:   pinColor,
            border:       `2.5px solid ${pinBorder}`,
            display:      'flex',
            alignItems:   'center',
            justifyContent: 'center',
            boxShadow:    '0 2px 8px rgba(0,0,0,0.4)',
            transition:   'background 0.15s, border-color 0.15s',
          }}
        >
          <span
            style={{
              transform:   'rotate(45deg)',
              color:       '#fff',
              fontWeight:  700,
              fontSize:    11,
              lineHeight:  1,
              fontFamily:  'monospace',
            }}
          >
            {markerLabel}
          </span>
        </div>

        {/* Altitude label */}
        {showAltitude ? (
          <div
            style={{
              marginTop:    3,
              padding:      '1px 5px',
              borderRadius: 3,
              background:   'rgba(10, 14, 20, 0.82)',
              border:       '1px solid rgba(255,255,255,0.12)',
              color:        altitudeColor,
              fontSize:     9.9,
              fontWeight:   600,
              letterSpacing: '0.03em',
              whiteSpace:   'nowrap',
              lineHeight:   1.4,
            }}
          >
            {Math.round(altitudeM)} m
          </div>
        ) : null}
      </div>
    </Marker>
  )
}

/**
 * Memo wrapper with a custom comparator.
 *
 * We ONLY re-render the marker when its own stable props change.
 * Critically, during a drag the parent (PlanView) updates `pathPreview`
 * state on every animation frame, which causes MapContainer to re-render.
 * Without memo every WaypointMarker instance re-renders too — and
 * react-map-gl's Marker calls setLngLat() on every re-render, which
 * resets the dragged marker's DOM position (the "snap-back" / tug-of-war bug).
 *
 * The comparator props that matter for visual output:
 *   lat, lng, altitudeM, index, isCurrent, isSelected
 * Callbacks are compared by reference — PlanView memoizes them with
 * useCallback, and MapContainer forwards them with stable refs (below).
 */
export default React.memo(WaypointMarker, (prev, next) => {
  return (
    prev.lat       === next.lat       &&
    prev.lng       === next.lng       &&
    prev.altitudeM === next.altitudeM &&
    prev.index     === next.index     &&
    prev.isCurrent === next.isCurrent &&
    prev.isSelected === next.isSelected &&
    prev.label     === next.label     &&
    prev.showAltitude === next.showAltitude &&
    prev.pinColorOverride    === next.pinColorOverride &&
    prev.pinBorderOverride   === next.pinBorderOverride &&
    prev.altitudeColorOverride === next.altitudeColorOverride &&
    prev.onDragEnd   === next.onDragEnd  &&
    prev.onDragMove  === next.onDragMove &&
    prev.onDragStart === next.onDragStart &&
    prev.onSelect    === next.onSelect
  )
})
