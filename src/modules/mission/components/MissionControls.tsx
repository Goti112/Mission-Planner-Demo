/* ═══════════════════════════════════════════════════════════════
   MissionControls — mission execution + waypoint action buttons
   ═══════════════════════════════════════════════════════════════
   Start / Pause / Resume / Stop + Add WP / Clear WPs / Delete
   Delegates all actions to DroneMissionController (unchanged).
   ═══════════════════════════════════════════════════════════════ */

import React from 'react'
import {
  Play,
  Pause,
  Square,
  MapPin,
  RotateCcw,
  Trash2,
} from 'lucide-react'
import type { Mission } from '../../../types/mission'

interface MissionControlsProps {
  mission: Mission | null
  addingWaypoint: boolean
  onToggleAddWp: () => void
  onClearWaypoints: () => void
  onDeleteMission: () => void
  onStart: () => void
  onPause: () => void
  onResume: () => void
  onAbort: () => void
}

const MissionControls: React.FC<MissionControlsProps> = ({
  mission,
  addingWaypoint,
  onToggleAddWp,
  onClearWaypoints,
  onDeleteMission,
  onStart,
  onPause,
  onResume,
  onAbort,
}) => {
  const isIdle = !mission || mission.status === 'idle' || mission.status === 'completed'
  const isRunning = mission?.status === 'running'
  const isPaused = mission?.status === 'paused'

  return (
    <div className="msn-controls">

      {/* ── Waypoint actions ── */}
      <div className="msn-controls__row">
        <button
          className={`msn-btn ${addingWaypoint ? 'msn-btn--active' : 'msn-btn--secondary'}`}
          onClick={onToggleAddWp}
          disabled={!mission}
          title={addingWaypoint ? 'Cancelar añadir WP' : 'Añadir WP en mapa'}
        >
          {addingWaypoint ? <RotateCcw size={13} /> : <MapPin size={13} />}
          <span>{addingWaypoint ? 'Cancelar' : 'Añadir WP'}</span>
        </button>

        <button
          className="msn-btn msn-btn--outline"
          onClick={onClearWaypoints}
          disabled={!mission || mission.waypoints.length === 0 || isRunning}
          title="Eliminar todos los waypoints"
        >
          <RotateCcw size={12} />
          <span>Limpiar</span>
        </button>

        <button
          className="msn-btn msn-btn--danger-outline"
          onClick={onDeleteMission}
          disabled={!mission || isRunning}
          title="Eliminar misión"
        >
          <Trash2 size={12} />
          <span>Borrar</span>
        </button>
      </div>

      {/* ── Execution controls ── */}
      <div className="msn-controls__row">
        {/* Start / Resume */}
        {(isIdle || isPaused) && (
          <button
            className="msn-btn msn-btn--primary msn-btn--grow"
            onClick={isPaused ? onResume : onStart}
            disabled={!mission || mission.waypoints.length === 0}
            title={isPaused ? 'Reanudar misión' : 'Iniciar misión'}
          >
            <Play size={13} />
            <span>{isPaused ? 'Reanudar' : 'Iniciar'}</span>
          </button>
        )}

        {/* Pause */}
        {isRunning && (
          <button
            className="msn-btn msn-btn--secondary msn-btn--grow"
            onClick={onPause}
            title="Pausar misión"
          >
            <Pause size={13} />
            <span>Pausar</span>
          </button>
        )}

        {/* Stop */}
        <button
          className="msn-btn msn-btn--danger"
          onClick={onAbort}
          disabled={isIdle}
          title="Detener misión"
        >
          <Square size={13} />
          <span>Detener</span>
        </button>
      </div>

      {/* ── Mission progress ── */}
      {mission && isRunning && (
        <div className="msn-controls__progress">
          <span className="msn-controls__progress-label">
            WP {mission.currentWpIndex + 1} / {mission.waypoints.length}
          </span>
          <div className="msn-controls__progress-bar">
            <div
              className="msn-controls__progress-fill"
              style={{
                width: `${
                  mission.waypoints.length > 0
                    ? ((mission.currentWpIndex + mission.progress) /
                        mission.waypoints.length) *
                      100
                    : 0
                }%`,
              }}
            />
          </div>
        </div>
      )}

      {mission?.status === 'completed' && (
        <div className="msn-controls__completed">✓ Misión completada</div>
      )}
    </div>
  )
}

export default MissionControls
