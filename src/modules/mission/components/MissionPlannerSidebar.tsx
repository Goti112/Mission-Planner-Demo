/* ═══════════════════════════════════════════════════════════════
   MissionPlannerSidebar — right-side mission planning panel
   ═══════════════════════════════════════════════════════════════

   Collapsible sidebar (300–360 px) with structured sections:

   1. Mission Header   — drone / mission selector + create
   2. Altitude Control  — global alt + apply-to-all toggle
   3. Mission Controls — Add WP / Clear / Delete / Start / Stop
   4. Mission Summary  — distance, ETA, WP count, avg speed
   5. Waypoint List    — scrollable, drag-to-reorder
   6. Mission Status   — mode / link indicator

   All mission logic delegated to existing store & controller —
   this component is pure UI orchestration.
   ═══════════════════════════════════════════════════════════════ */

import React, { useState, useCallback, useEffect } from 'react'
import {
  ChevronDown,
  Plus,
  Navigation,
} from 'lucide-react'

import MissionControls from './MissionControls'
import MissionSummary from './MissionSummary'
import WaypointList from './WaypointList'
import FlightLogPanel from './FlightLogPanel'
import type { Waypoint, Mission } from '../../../types/mission'
import { useMissionProgressStore } from '../store/missionProgressStore'

/* ── Unique waypoint id helper ── */
let _wpSeq = 0
function wpId(): string {
  return `wp-${Date.now().toString(36)}-${(++_wpSeq).toString(36)}`
}

/* ═══════════════════════════════════════════════════════════════
   Props
   ═══════════════════════════════════════════════════════════════ */
export interface MissionPlannerSidebarProps {
  /* ── Drone data ── */
  drones: Array<{ id: string; name: string; mode?: string }>
  selectedDroneId: string | null
  onSelectDrone: (id: string | null) => void

  /* ── Mission data ── */
  missions: Record<string, Mission>
  droneMissions: Mission[]
  selectedMissionId: string | null
  onSelectMission: (id: string | null) => void

  /* ── Mission CRUD (from store) ── */
  createMission: (name: string, droneId: string) => string
  deleteMission: (id: string) => void
  addWaypoint: (missionId: string, wp: Waypoint) => void
  updateWaypoint: (missionId: string, wpId: string, patch: Partial<Omit<Waypoint, 'id'>>) => void
  removeWaypoint: (missionId: string, wpId: string) => void
  reorderWaypoints: (missionId: string, from: number, to: number) => void

  /* ── Waypoint add mode ── */
  addingWaypoint: boolean
  setAddingWaypoint: (v: boolean) => void
  defaultAlt: number
  setDefaultAlt: (v: number) => void

  /* ── Execution callbacks ── */
  onStart: () => void
  onPause: () => void
  onResume: () => void
  onAbort: () => void

  /* ── Selected waypoint for highlight sync ── */
  selectedWpId: string | null
  onSelectWp: (wpId: string | null) => void
}

/* ═══════════════════════════════════════════════════════════════
   COMPONENT
   ═══════════════════════════════════════════════════════════════ */
const MissionPlannerSidebar: React.FC<MissionPlannerSidebarProps> = (props) => {
  const {
    drones,
    selectedDroneId,
    onSelectDrone,
    missions,
    droneMissions,
    selectedMissionId,
    onSelectMission,
    createMission,
    deleteMission,
    addWaypoint,
    updateWaypoint,
    removeWaypoint,
    reorderWaypoints,
    addingWaypoint,
    setAddingWaypoint,
    defaultAlt,
    setDefaultAlt,
    onStart,
    onPause,
    onResume,
    onAbort,
    selectedWpId,
    onSelectWp,
  } = props

  const [newMissionName, setNewMissionName] = useState('')
  const [applyAltToAll, setApplyAltToAll] = useState(false)
  const [logExpanded, setLogExpanded] = useState(false)

  const selectedMission: Mission | null =
    selectedMissionId ? missions[selectedMissionId] ?? null : null

  // Live mission progress for the selected mission's assigned drone
  const allProgress = useMissionProgressStore((s) => s.progress)
  const liveProgress = selectedMission ? (allProgress[selectedMission.droneId] ?? null) : null

  /* ── Handlers ── */
  const handleCreateMission = useCallback(() => {
    if (!selectedDroneId) return
    const name = newMissionName.trim() || `Misión ${droneMissions.length + 1}`
    const id = createMission(name, selectedDroneId)
    onSelectMission(id)
    setNewMissionName('')
  }, [selectedDroneId, newMissionName, droneMissions.length, createMission, onSelectMission])

  const handleDeleteMission = useCallback(() => {
    if (!selectedMissionId) return
    deleteMission(selectedMissionId)
    onSelectMission(null)
  }, [selectedMissionId, deleteMission, onSelectMission])

  const handleClearWaypoints = useCallback(() => {
    if (!selectedMission) return
    ;[...selectedMission.waypoints].forEach((wp) =>
      removeWaypoint(selectedMission.id, wp.id),
    )
  }, [selectedMission, removeWaypoint])

  const handleDuplicate = useCallback(
    (wp: Waypoint) => {
      if (!selectedMissionId) return
      const dup: Waypoint = {
        ...wp,
        id: wpId(),
        lat: wp.lat + 0.0001, // slight offset so it's visible
        lng: wp.lng + 0.0001,
      }
      addWaypoint(selectedMissionId, dup)
    },
    [selectedMissionId, addWaypoint],
  )

  /* Apply default altitude to all WPs when toggle is on */
  useEffect(() => {
    if (!applyAltToAll || !selectedMission) return
    for (const wp of selectedMission.waypoints) {
      if (wp.altitude !== defaultAlt) {
        updateWaypoint(selectedMission.id, wp.id, { altitude: defaultAlt })
      }
    }
  }, [applyAltToAll, defaultAlt, selectedMission, updateWaypoint])

  /* ══════════════════════════════════════════════════════════
     RENDER
     ══════════════════════════════════════════════════════════ */

  /* Collapse toggle button (always visible) */
  return (
    <aside className="msn-sidebar">

      {/* ── TOP BAR: title ── */}
      <div className="msn-sidebar__topbar">
        <span className="msn-sidebar__title">
          <Navigation size={13} />
          Planificador
        </span>
      </div>

      {/* ── SCROLLABLE BODY ── */}
      <div className="msn-sidebar__body">

        {/* ── 1. MISIÓN ── */}
        <section className="msn-sidebar__section">
          <h3 className="msn-sidebar__heading">Dron y misión</h3>

          <label className="msn-sidebar__label">Dron</label>
          <div className="msn-sidebar__select-wrap">
            <select
              className="msn-sidebar__select"
              value={selectedDroneId ?? ''}
              onChange={(e) => {
                onSelectDrone(e.target.value || null)
                onSelectMission(null)
                setAddingWaypoint(false)
              }}
            >
              {drones.length === 0 && <option value="">Sin drones</option>}
              {drones.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name || d.id}
                </option>
              ))}
            </select>
            <ChevronDown size={12} className="msn-sidebar__chevron" />
          </div>

          <label className="msn-sidebar__label" style={{ marginTop: 10 }}>Misión activa</label>
          <div className="msn-sidebar__select-wrap">
            <select
              className="msn-sidebar__select"
              value={selectedMissionId ?? ''}
              onChange={(e) => {
                onSelectMission(e.target.value || null)
                setAddingWaypoint(false)
              }}
              disabled={!selectedDroneId || droneMissions.length === 0}
            >
              {droneMissions.length === 0 && (
                <option value="">— sin misiones —</option>
              )}
              {droneMissions.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name} ({m.waypoints.length} WP · {m.status})
                </option>
              ))}
            </select>
            <ChevronDown size={12} className="msn-sidebar__chevron" />
          </div>

          <label className="msn-sidebar__label" style={{ marginTop: 10 }}>Nueva misión</label>
          <div className="msn-sidebar__create-row">
            <input
              className="msn-sidebar__input"
              type="text"
              placeholder="Nombre de la misión…"
              value={newMissionName}
              onChange={(e) => setNewMissionName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleCreateMission()}
              disabled={!selectedDroneId}
            />
            <button
              className="msn-btn msn-btn--primary msn-btn--icon"
              onClick={handleCreateMission}
              disabled={!selectedDroneId}
              title="Crear misión"
            >
              <Plus size={14} />
            </button>
          </div>
        </section>

        {/* ── 2. ALTITUD ── */}
        <section className="msn-sidebar__section">
          <h3 className="msn-sidebar__heading">Altitud por defecto</h3>
          <div className="msn-sidebar__alt-row">
            <input
              type="number"
              className="msn-sidebar__input msn-sidebar__input--narrow"
              value={defaultAlt}
              onChange={(e) => setDefaultAlt(Number(e.target.value) || 0)}
              min={0}
              max={500}
              disabled={!selectedMissionId}
            />
            <span className="msn-sidebar__unit">metros</span>
          </div>
          <label className="msn-sidebar__checkbox">
            <input
              type="checkbox"
              checked={applyAltToAll}
              onChange={(e) => setApplyAltToAll(e.target.checked)}
              disabled={!selectedMission || selectedMission.waypoints.length === 0}
            />
            <span>Aplicar a todos los waypoints</span>
          </label>
        </section>

        {/* ── 3. CONTROLES ── */}
        <section className="msn-sidebar__section">
          <h3 className="msn-sidebar__heading">Controles de misión</h3>
          <MissionControls
            mission={selectedMission}
            addingWaypoint={addingWaypoint}
            onToggleAddWp={() => setAddingWaypoint(!addingWaypoint)}
            onClearWaypoints={handleClearWaypoints}
            onDeleteMission={handleDeleteMission}
            onStart={onStart}
            onPause={onPause}
            onResume={onResume}
            onAbort={onAbort}
          />
        </section>

        {/* ── 4. RESUMEN ── */}
        {selectedMission && (
          <section className="msn-sidebar__section">
            <h3 className="msn-sidebar__heading">Resumen de vuelo</h3>
            <MissionSummary mission={selectedMission} liveProgress={liveProgress} />
          </section>
        )}

        {/* ── 5. WAYPOINTS ── */}
        <section className="msn-sidebar__section msn-sidebar__section--wp">
          <h3 className="msn-sidebar__heading">
            Waypoints
            {selectedMission && selectedMission.waypoints.length > 0 && (
              <span className="msn-sidebar__badge">{selectedMission.waypoints.length}</span>
            )}
          </h3>

          {selectedMission ? (
            <WaypointList
              mission={selectedMission}
              selectedWpId={selectedWpId}
              onSelectWp={(id) => onSelectWp(id)}
              onUpdate={updateWaypoint}
              onRemove={removeWaypoint}
              onDuplicate={handleDuplicate}
              onReorder={reorderWaypoints}
            />
          ) : (
            <div className="wp-list__empty">
              <span>Selecciona o crea una misión</span>
            </div>
          )}
        </section>

        {/* ── 6. FLIGHT LOG ── */}
        <section className="msn-sidebar__section">
          <h3
            className="msn-sidebar__heading msn-sidebar__heading--collapsible"
            onClick={() => setLogExpanded((v) => !v)}
            style={{ cursor: 'pointer', userSelect: 'none' }}
          >
            Flight Log
            <span style={{ marginLeft: 'auto', opacity: 0.5, fontSize: 11 }}>
              {logExpanded ? '▲' : '▼'}
            </span>
          </h3>
          {logExpanded && (
            <FlightLogPanel filterDroneId={selectedDroneId} />
          )}
        </section>

      </div>{/* end body */}

      {/* ── FOOTER: estado ── */}
      {selectedMission && (
        <div className="msn-sidebar__footer">
          <div className="msn-status__item">
            <span className="msn-status__label">Estado</span>
            <span className={`msn-status__value msn-status__value--${selectedMission.status}`}>
              {selectedMission.status.toUpperCase()}
            </span>
          </div>
          <div className="msn-status__item">
            <span className="msn-status__label">Enlace</span>
            <span className="msn-status__value msn-status__value--ok">OK</span>
          </div>
        </div>
      )}
    </aside>
  )
}

export default MissionPlannerSidebar
