/**
 * FlightLogPanel.tsx — Scrollable flight event log viewer
 *
 * Displays a chronological list of recorded flight events for the
 * active drone (or all drones). Supports:
 *   • Real-time auto-scroll (pauses when operator scrolls up)
 *   • Per-drone filtering
 *   • JSON / CSV one-click export
 *   • Log clearing
 *
 * Usage:
 *   <FlightLogPanel filterDroneId={activeDroneId} />
 *
 * When filterDroneId is `undefined`, the panel renders an internal
 * drone selector. When it is `null`, no events are shown.
 * When it is a string, only events for that drone are shown.
 */

import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import { ScrollText, Trash2, Download, Filter, ArrowDown } from 'lucide-react'

import { useFlightEventStore } from '../store/flightEventStore'
import { useDroneStore } from '../../drone'
import type { FlightEvent } from '../../../types/FlightEvent'
import { AUTO_SCROLL_THRESHOLD_PX } from '../../../shared/config/constants'
import { LOG_LOCALE } from '../../../shared/config/constants'

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatTime(ts: number): string {
  const d = new Date(ts)
  return d.toLocaleTimeString(LOG_LOCALE, {
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
}

/** Returns a CSS modifier class based on the event type string. */
function eventTypeClass(type: string): string {
  const t = type.toUpperCase()
  if (t.includes('ABORT') || t.includes('CRITICAL') || t.includes('FAIL'))
    return 'flog-event--critical'
  if (t.includes('WARN') || t.includes('LOW') || t.includes('PAUSE'))
    return 'flog-event--warning'
  if (
    t.includes('COMPLETE') ||
    t.includes('REACHED') ||
    t.includes('AIRBORNE') ||
    t.includes('RESUME')
  )
    return 'flog-event--success'
  return 'flog-event--info'
}

/** Build a sorted flat event array from the store's events record. */
function flattenAndSort(
  eventsMap: Record<string, FlightEvent[]>,
  droneId: string | 'all',
): FlightEvent[] {
  if (droneId === 'all') {
    return Object.values(eventsMap)
      .flat()
      .sort((a, b) => a.timestamp - b.timestamp)
  }
  return eventsMap[droneId] ?? []
}

// ── Props ─────────────────────────────────────────────────────────────────────

export interface FlightLogPanelProps {
  /**
   * When provided, the panel is locked to this droneId and the internal
   * drone selector is hidden.
   * - string  → events for that drone
   * - null    → no events (no drone selected)
   * - undefined → internal selector shown (multi-drone mode)
   */
  filterDroneId?: string | null
}

// ── Component ─────────────────────────────────────────────────────────────────

const FlightLogPanel: React.FC<FlightLogPanelProps> = ({ filterDroneId }) => {
  const eventsMap  = useFlightEventStore((s) => s.events)
  const clearDrone = useFlightEventStore((s) => s.clearDrone)
  const clearAll   = useFlightEventStore((s) => s.clearAll)

  const dronesObj = useDroneStore((s) => s.drones)
  const drones    = useMemo(() => Object.values(dronesObj), [dronesObj])

  /** Internal drone selector value — only used when filterDroneId is undefined. */
  const [localDrone, setLocalDrone] = useState<string | 'all'>('all')

  /** The effective drone filter: locked to filterDroneId when provided. */
  const effectiveDrone: string | 'all' =
    filterDroneId !== undefined
      ? (filterDroneId ?? 'none') // null → 'none' (no events)
      : localDrone

  /** Computed event list (memoized — avoid recalculating on every render). */
  const events = useMemo(
    () =>
      effectiveDrone === 'none'
        ? []
        : flattenAndSort(eventsMap, effectiveDrone),
    [eventsMap, effectiveDrone],
  )

  // ── Auto-scroll ──────────────────────────────────────────────────────────

  const listRef      = useRef<HTMLDivElement>(null)
  const [autoScroll, setAutoScroll] = useState(true)

  useEffect(() => {
    if (autoScroll && listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight
    }
  }, [events.length, autoScroll])

  const handleScroll = useCallback(() => {
    if (!listRef.current) return
    const { scrollTop, scrollHeight, clientHeight } = listRef.current
    // Re-enable auto-scroll when operator scrolls within threshold of the bottom
    setAutoScroll(scrollHeight - scrollTop - clientHeight < AUTO_SCROLL_THRESHOLD_PX)
  }, [])

  // ── Export helpers ───────────────────────────────────────────────────────

  const downloadBlob = (content: string, mime: string, ext: string) => {
    const blob = new Blob([content], { type: mime })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href     = url
    a.download = `flight-log-${Date.now()}.${ext}`
    a.click()
    URL.revokeObjectURL(url)
  }

  const handleExportJSON = useCallback(() => {
    const data = JSON.stringify(events, null, 2)
    downloadBlob(data, 'application/json', 'json')
  }, [events])

  const handleExportCSV = useCallback(() => {
    const header = 'timestamp,droneId,type,message'
    const rows   = events.map(
      (e) =>
        `${e.timestamp},${e.droneId},${e.type},"${e.message.replace(/"/g, '""')}"`,
    )
    const csv = [header, ...rows].join('\n')
    downloadBlob(csv, 'text/csv', 'csv')
  }, [events])

  const handleClear = useCallback(() => {
    if (effectiveDrone === 'all' || effectiveDrone === 'none') clearAll()
    else clearDrone(effectiveDrone)
  }, [effectiveDrone, clearAll, clearDrone])

  // ── Render ───────────────────────────────────────────────────────────────

  const showDroneSelector =
    filterDroneId === undefined && drones.length > 1

  return (
    <div className="flog-panel">

      {/* Header bar */}
      <div className="flog-header">
        <div className="flog-header-left">
          <ScrollText size={12} />
          <span className="flog-title">Flight Log</span>
          <span className="flog-count">{events.length}</span>
        </div>
        <div className="flog-header-actions">
          <button
            className="flog-btn"
            onClick={handleExportJSON}
            title="Export as JSON"
          >
            <Download size={11} />
            <span>JSON</span>
          </button>
          <button
            className="flog-btn"
            onClick={handleExportCSV}
            title="Export as CSV"
          >
            <Download size={11} />
            <span>CSV</span>
          </button>
          <button
            className="flog-btn flog-btn--danger"
            onClick={handleClear}
            title="Clear log"
          >
            <Trash2 size={11} />
          </button>
        </div>
      </div>

      {/* Drone filter — only shown in multi-drone mode */}
      {showDroneSelector && (
        <div className="flog-filter">
          <Filter size={10} />
          <select
            className="flog-select"
            value={localDrone}
            onChange={(e) => setLocalDrone(e.target.value)}
          >
            <option value="all">All drones</option>
            {drones.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name || d.id}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Event list */}
      <div
        className="flog-list"
        ref={listRef}
        onScroll={handleScroll}
      >
        {events.length === 0 ? (
          <div className="flog-empty">No events recorded yet</div>
        ) : (
          events.map((e, i) => (
            <div
              key={`${e.droneId}-${e.timestamp}-${i}`}
              className={`flog-event ${eventTypeClass(e.type)}`}
            >
              <span className="flog-event-time">[{formatTime(e.timestamp)}]</span>
              {(effectiveDrone === 'all' && drones.length > 1) && (
                <span className="flog-event-drone">{e.droneId}</span>
              )}
              <span className="flog-event-msg">{e.message}</span>
            </div>
          ))
        )}
      </div>

      {/* Auto-scroll indicator */}
      {!autoScroll && events.length > 0 && (
        <button
          className="flog-scroll-btn"
          onClick={() => {
            setAutoScroll(true)
            if (listRef.current)
              listRef.current.scrollTop = listRef.current.scrollHeight
          }}
        >
          <ArrowDown size={13} /> Jump to latest
        </button>
      )}
    </div>
  )
}

export default FlightLogPanel
