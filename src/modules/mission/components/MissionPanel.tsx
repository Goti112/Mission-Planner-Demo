/* ═══════════════════════════════════════════════════════════════
   MissionPanel — sidebar UI for creating and managing missions
   ═══════════════════════════════════════════════════════════════

   ┌──────────────────────────────────────────────────────────┐
   │  WHAT THIS PANEL DOES                                    │
   │                                                          │
   │  1. Shows the active drone and its assigned missions.    │
   │  2. Lets the user create a new mission (name input).     │
   │  3. Displays the ordered waypoint list for the selected  │
   │     mission with editable altitude and hold time.        │
   │  4. "Add Waypoint" mode: the next click on the 2D map   │
   │     appends a waypoint at that lat/lng.  This is done    │
   │     by setting a flag on a shared ref that DroneMap      │
   │     checks on its click handler.                         │
   │  5. Start / Pause / Resume / Stop controls to run the    │
   │     simulated mission execution.  A setInterval tick     │
   │     advances the drone every ~50 ms while running.       │
   │  6. Each waypoint row has a delete button.               │
   │                                                          │
   │  HOW WAYPOINTS CAN BE ADDED                              │
   │  Clicking "Add WP" sets `addingWaypoint` state to true.  │
   │  The parent App passes this flag + a callback to         │
   │  DroneMap, which calls back with {lat,lng} on map click. │
   │  MissionPanel then calls `addWaypoint()` on the store.   │
   └──────────────────────────────────────────────────────────┘
   ═══════════════════════════════════════════════════════════════ */

import { useEffect, useMemo, useCallback, useState } from 'react'
import {
  Navigation,
  Plus,
  Trash2,
  Play,
  Pause,
  Square,
  MapPin,
  RotateCcw,
  ChevronRight,
} from 'lucide-react'

import { useDroneStore } from '../../drone'
import { useMissionStore, droneMissionController } from '..'
import { DroneEntity } from '../../drone/core/DroneEntity'
import { PUBLIC_ASSET_URLS } from '../../../shared/utils/publicAssetUrl'
import type { Mission, Waypoint } from '../../../types/mission'
import { DEFAULT_WAYPOINT_ALTITUDE_M } from '../../../shared/config/constants'

/* ── Helper: short unique waypoint id ── */
let _wpSeq = 0
function wpId(): string {
  return `wp-${Date.now().toString(36)}-${(++_wpSeq).toString(36)}`
}

/* ═══════════════════════════════════════════════════════════════
   Props — callback to toggle "click on map to add waypoint" mode
   ═══════════════════════════════════════════════════════════════ */
export interface MissionPanelProps {
  /** Whether the panel is currently in "add waypoint by map click" mode */
  addingWaypoint: boolean
  /** Toggle the "add waypoint" mode on/off */
  setAddingWaypoint: (v: boolean) => void
  /** Called by the parent (DroneMap) when the map is clicked while adding */
  pendingWaypoint: { lat: number; lng: number } | null
  /** Clear the pending waypoint after consuming it */
  clearPendingWaypoint: () => void
}

/* ═══════════════════════════════════════════════════════════════
   COMPONENT
   ═══════════════════════════════════════════════════════════════ */
export default function MissionPanel({
  addingWaypoint,
  setAddingWaypoint,
  pendingWaypoint,
  clearPendingWaypoint,
}: MissionPanelProps) {
  /* ── Drone store ── */
  const drones = useDroneStore((s) => s.drones)
  const droneList = useMemo(() => Object.values(drones), [drones])
  const activeDrone = droneList.find((d) => d.active)

  /* ── Mission store ── */
  const missions = useMissionStore((s) => s.missions)
  const createMission = useMissionStore((s) => s.createMission)
  const deleteMission = useMissionStore((s) => s.deleteMission)
  const addWaypoint = useMissionStore((s) => s.addWaypoint)
  const removeWaypoint = useMissionStore((s) => s.removeWaypoint)
  const updateWaypoint = useMissionStore((s) => s.updateWaypoint)

  /* ── Mission controls go through DroneMissionController ── */
  const handleStartMission = useCallback((missionId: string) => {
    const m = useMissionStore.getState().missions[missionId]
    if (!m) return
    // Ensure the drone entity is registered in the controller
    const drone = useDroneStore.getState().drones[m.droneId]
    if (drone && !droneMissionController.getEntity(drone.id)) {
      droneMissionController.addEntity(new DroneEntity(drone, PUBLIC_ASSET_URLS.droneModel, 12))
    }
    droneMissionController.startMission(m.droneId, missionId)
  }, [])

  const handlePauseMission = useCallback((missionId: string) => {
    const m = useMissionStore.getState().missions[missionId]
    if (m) droneMissionController.pauseMission(m.droneId)
  }, [])

  const handleResumeMission = useCallback((missionId: string) => {
    const m = useMissionStore.getState().missions[missionId]
    if (m) droneMissionController.resumeMission(m.droneId)
  }, [])

  const handleAbortMission = useCallback((missionId: string) => {
    const m = useMissionStore.getState().missions[missionId]
    if (m) droneMissionController.abortMission(m.droneId)
  }, [])

  /* ── Local state ── */
  const [selectedMissionId, setSelectedMissionId] = useState<string | null>(null)
  const [newMissionName, setNewMissionName] = useState('')
  const [defaultAlt, setDefaultAlt] = useState(DEFAULT_WAYPOINT_ALTITUDE_M)

  /* Derived: missions for the active drone */
  const droneMissions = useMemo(() => {
    if (!activeDrone) return []
    return Object.values(missions).filter((m) => m.droneId === activeDrone.id)
  }, [missions, activeDrone])

  /* Auto-select the first mission when drone or mission list changes.
     Uses queueMicrotask to defer the state update and avoid
     calling setState synchronously inside the effect body. */
  useEffect(() => {
    if (droneMissions.length > 0 && !droneMissions.find((m) => m.id === selectedMissionId)) {
      queueMicrotask(() => setSelectedMissionId(droneMissions[0].id))
    } else if (droneMissions.length === 0 && selectedMissionId !== null) {
      queueMicrotask(() => setSelectedMissionId(null))
    }
  }, [droneMissions, selectedMissionId]);

  const selectedMission: Mission | null =
    selectedMissionId ? missions[selectedMissionId] ?? null : null

  /* ──────────────────────────────────────────────────────────
     Consume pending waypoint from map click
     When the user clicked the map while `addingWaypoint` was
     true, App sets `pendingWaypoint`.  We consume it here.
     ────────────────────────────────────────────────────────── */
  useEffect(() => {
    if (!pendingWaypoint || !selectedMissionId) return
    const wp: Waypoint = {
      id: wpId(),
      lat: pendingWaypoint.lat,
      lng: pendingWaypoint.lng,
      altitude: defaultAlt,
    }
    addWaypoint(selectedMissionId, wp)
    clearPendingWaypoint()
    // Keep addingWaypoint ON so user can add consecutive points
  }, [pendingWaypoint, selectedMissionId, defaultAlt, addWaypoint, clearPendingWaypoint])

  /* ──────────────────────────────────────────────────────────
     Sync controller entities with drone store
     ────────────────────────────────────────────────────────── */
  useEffect(() => {
    droneMissionController.syncEntitiesWithStore()
  }, [drones])

  /* NOTE: The animation loop (rAF) is now self-managed inside
     DroneMissionController — it starts on startMission() and
     self-terminates when all entities return to IDLE/COMPLETED.
     No React dependency for simulation timing. */

  /* ──────────────────────────────────────────────────────────
     Handlers
     ────────────────────────────────────────────────────────── */
  const handleCreateMission = useCallback(() => {
    if (!activeDrone) return
    const name = newMissionName.trim() || `Misión ${droneMissions.length + 1}`
    const id = createMission(name, activeDrone.id)
    setSelectedMissionId(id)
    setNewMissionName('')
  }, [activeDrone, newMissionName, droneMissions.length, createMission])

  const handleDeleteMission = useCallback(() => {
    if (!selectedMissionId) return
    deleteMission(selectedMissionId)
    setSelectedMissionId(null)
  }, [selectedMissionId, deleteMission])

  /* ═══════════════════════════════════════════════════════════
     RENDER
     ═══════════════════════════════════════════════════════════ */
  return (
    <div className="gcs-panel mission-panel">
      {/* ── Header ── */}
      <div className="gcs-panel-header">
        <div className="gcs-panel-icon gcs-panel-icon--cyan">
          <Navigation size={16} />
        </div>
        <div className="gcs-panel-title">Misiones</div>
        {activeDrone && (
          <span className="drone-count-badge">{droneMissions.length}</span>
        )}
      </div>

      {!activeDrone ? (
        <div className="drone-detail-empty">Selecciona un dron para gestionar misiones</div>
      ) : (
        <>
          {/* ── Create mission row ── */}
          <div className="mission-create-row">
            <input
              type="text"
              placeholder="Nombre misión…"
              value={newMissionName}
              onChange={(e) => setNewMissionName(e.target.value)}
              className="mission-input"
              onKeyDown={(e) => e.key === 'Enter' && handleCreateMission()}
            />
            <button className="mission-btn mission-btn--add" onClick={handleCreateMission} title="Crear misión">
              <Plus size={14} />
            </button>
          </div>

          {/* ── Mission list ── */}
          {droneMissions.length > 0 && (
            <div className="mission-list">
              {droneMissions.map((m) => (
                <button
                  key={m.id}
                  className={`mission-list-item ${m.id === selectedMissionId ? 'mission-list-item--active' : ''}`}
                  onClick={() => setSelectedMissionId(m.id)}
                >
                  <Navigation size={12} />
                  <span className="mission-list-name">{m.name}</span>
                  <span className="mission-list-meta">
                    {m.waypoints.length} WP · {m.status}
                  </span>
                  <ChevronRight size={12} className="mission-list-arrow" />
                </button>
              ))}
            </div>
          )}

          {/* ── Selected mission detail ── */}
          {selectedMission && (
            <div className="mission-detail">
              {/* Status + controls */}
              <div className="mission-controls">
                {selectedMission.status === 'idle' || selectedMission.status === 'completed' ? (
                  <button
                    className="mission-btn mission-btn--play"
                    onClick={() => handleStartMission(selectedMission.id)}
                    disabled={selectedMission.waypoints.length === 0}
                    title="Iniciar misión"
                  >
                    <Play size={14} /> Iniciar
                  </button>
                ) : selectedMission.status === 'running' ? (
                  <button
                    className="mission-btn mission-btn--pause"
                    onClick={() => handlePauseMission(selectedMission.id)}
                    title="Pausar"
                  >
                    <Pause size={14} /> Pausar
                  </button>
                ) : (
                  <button
                    className="mission-btn mission-btn--play"
                    onClick={() => handleResumeMission(selectedMission.id)}
                    title="Reanudar"
                  >
                    <Play size={14} /> Reanudar
                  </button>
                )}

                <button
                  className="mission-btn mission-btn--stop"
                  onClick={() => handleAbortMission(selectedMission.id)}
                  disabled={selectedMission.status === 'idle'}
                  title="Detener"
                >
                  <Square size={14} />
                </button>

                <button
                  className="mission-btn mission-btn--danger"
                  onClick={handleDeleteMission}
                  title="Eliminar misión"
                >
                  <Trash2 size={14} />
                </button>
              </div>

              {/* Mission progress indicator */}
              {selectedMission.status === 'running' && (
                <div className="mission-progress-row">
                  <span className="mission-progress-label">
                    WP {selectedMission.currentWpIndex + 1}/{selectedMission.waypoints.length}
                  </span>
                  <div className="mission-progress-bar">
                    <div
                      className="mission-progress-fill"
                      style={{
                        width: `${
                          selectedMission.waypoints.length > 0
                            ? ((selectedMission.currentWpIndex + selectedMission.progress) /
                                selectedMission.waypoints.length) *
                              100
                            : 0
                        }%`,
                      }}
                    />
                  </div>
                </div>
              )}
              {selectedMission.status === 'completed' && (
                <div className="mission-progress-row">
                  <span className="mission-progress-label" style={{ color: 'var(--mission-success)' }}>
                    ✓ Misión completada
                  </span>
                </div>
              )}

              {/* Add waypoint controls */}
              <div className="mission-wp-add-row">
                <button
                  className={`mission-btn ${addingWaypoint ? 'mission-btn--active-toggle' : 'mission-btn--add'}`}
                  onClick={() => setAddingWaypoint(!addingWaypoint)}
                  title={addingWaypoint ? 'Cancelar' : 'Añadir WP en mapa'}
                >
                  {addingWaypoint ? <RotateCcw size={14} /> : <MapPin size={14} />}
                  {addingWaypoint ? 'Cancelar' : 'Añadir WP'}
                </button>
                <label className="mission-alt-label">
                  Alt:
                  <input
                    type="number"
                    className="mission-alt-input"
                    value={defaultAlt}
                    onChange={(e) => setDefaultAlt(Number(e.target.value) || 0)}
                    min={0}
                    max={500}
                  />
                  m
                </label>
              </div>

              {addingWaypoint && (
                <div className="mission-hint">
                  Haz clic en el mapa para añadir waypoints
                </div>
              )}

              {/* ── Waypoint list ── */}
              <div className="mission-wp-list">
                {selectedMission.waypoints.length === 0 ? (
                  <div className="mission-wp-empty">Sin waypoints</div>
                ) : (
                  selectedMission.waypoints.map((wp, i) => (
                    <div
                      key={wp.id}
                      className={`mission-wp-row ${
                        selectedMission.status === 'running' && i === selectedMission.currentWpIndex
                          ? 'mission-wp-row--current'
                          : ''
                      }`}
                    >
                      <span className="mission-wp-index">{i + 1}</span>
                      <div className="mission-wp-coords">
                        <span>{wp.lat.toFixed(5)}, {wp.lng.toFixed(5)}</span>
                        <span className="mission-wp-alt">{wp.altitude}m</span>
                      </div>
                      <input
                        type="number"
                        className="mission-wp-hold-input"
                        value={wp.holdTime ?? 0}
                        onChange={(e) =>
                          updateWaypoint(selectedMission.id, wp.id, {
                            holdTime: Number(e.target.value) || 0,
                          })
                        }
                        title="Hold time (s)"
                        min={0}
                        max={300}
                      />
                      <span className="mission-wp-hold-label">s</span>
                      <button
                        className="mission-wp-delete"
                        onClick={() => removeWaypoint(selectedMission.id, wp.id)}
                        title="Eliminar waypoint"
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
