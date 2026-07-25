import React, { useState } from 'react'
import { useDroneStore } from '../../drone'
import type { DroneMode } from '../../drone'
import { Gamepad2, BatteryWarning, Plus, Trash2, Users, ChevronRight, Move, ArrowUpFromLine } from 'lucide-react'

const ControlPanel: React.FC = () => {
  const drones = useDroneStore((s) => s.drones)
  const addDrone = useDroneStore((s) => s.addDrone)
  const removeDrone = useDroneStore((s) => s.removeDrone)
  const updateDrone = useDroneStore((s) => s.updateDrone)
  const setActiveDrone = useDroneStore((s) => s.setActiveDrone)

  const droneList = Object.values(drones)
  const selected = droneList.find((d) => d.active)

  const [applyAll, setApplyAll] = useState(false)
  const [nextDroneNum, setNextDroneNum] = useState(droneList.length + 1)
  const [quickAlt, setQuickAlt] = useState(10)
  const quickAltitudes = [5, 10, 20, 50, 100, 200, 500, 1000]

  /* ── Action helpers ── */
  const handleMove = () => {
    if (applyAll) {
      for (const d of Object.values(drones)) {
        updateDrone(d.id, { lat: d.lat + 0.0001, lng: d.lng + 0.0001 })
      }
    } else if (selected) {
      updateDrone(selected.id, {
        lat: selected.lat + 0.0001,
        lng: selected.lng + 0.0001,
      })
    }
  }

  const handleQuickAltitude = () => {
    if (applyAll) {
      for (const d of Object.values(drones)) {
        updateDrone(d.id, { altitude: quickAlt })
      }
    } else if (selected) {
      updateDrone(selected.id, { altitude: quickAlt })
    }
  }

  const handleAltitude = () => {
    if (applyAll) {
      for (const d of Object.values(drones)) {
        updateDrone(d.id, { altitude: d.altitude + 1 })
      }
    } else if (selected) {
      updateDrone(selected.id, { altitude: selected.altitude + 1 })
    }
  }

  const handleBattery = () => {
    if (applyAll) {
      for (const d of Object.values(drones)) {
        updateDrone(d.id, { battery: Math.max(0, d.battery - 1) })
      }
    } else if (selected) {
      updateDrone(selected.id, { battery: Math.max(0, selected.battery - 1) })
    }
  }

  const handleAddDrone = () => {
    const id = `drone-${nextDroneNum}`
    const baseLat = 40.4168 + (Math.random() - 0.5) * 0.005
    const baseLng = -3.7038 + (Math.random() - 0.5) * 0.005
    const newDrone = {
      id,
      name: `Drone ${nextDroneNum}`,
      lat: baseLat,
      lng: baseLng,
      altitude: Math.floor(Math.random() * 80),
      battery: 60 + Math.floor(Math.random() * 40),
      mode: 'MANUAL' as DroneMode,
      active: false,
      pitch: 0,
      roll: 0,
      yaw: Math.floor(Math.random() * 360),
      airspeed: 0,
      groundspeed: 0,
    }
    addDrone(newDrone)
    setActiveDrone(id)
    setNextDroneNum((n) => n + 1)
  }

  const handleRemove = () => {
    if (selected) removeDrone(selected.id)
  }

  const disabled = !applyAll && !selected

  return (
    <div className="gcs-panel">
      {/* Header */}
      <div className="gcs-panel-header">
        <div className="gcs-panel-icon gcs-panel-icon--indigo">
          <Gamepad2 size={16} />
        </div>
        <span className="gcs-panel-title">Controles</span>
      </div>

      {/* Apply-all toggle */}
      <label className="ctrl-toggle">
        <input
          type="checkbox"
          checked={applyAll}
          onChange={(e) => setApplyAll(e.target.checked)}
        />
        <Users size={13} />
        <span>Aplicar a todos</span>
      </label>

      {/* Target indicator */}
      {!applyAll && (
        <div className="ctrl-target">
          {selected ? `Objetivo: ${selected.name}` : 'Selecciona un dron en Telemetría'}
        </div>
      )}

      {/* Buttons */}
      <div className="ctrl-buttons">
        {/* Selector de altitud rápida */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          <select value={quickAlt} onChange={e => setQuickAlt(Number(e.target.value))}>
            {quickAltitudes.map(a => (
              <option key={a} value={a}>{a} m</option>
            ))}
          </select>
          <button className="ctrl-btn" style={{ minWidth: 90 }} onClick={handleQuickAltitude} disabled={disabled}>
            Aplicar altitud
          </button>
        </div>
        <button className="ctrl-btn" onClick={handleMove} disabled={disabled}>
          <span className="ctrl-btn-icon ctrl-btn-icon--cyan">
            <Move size={14} />
          </span>
          <span className="ctrl-btn-label">Mover dron</span>
          <ChevronRight size={14} className="ctrl-btn-arrow" />
        </button>

        <button className="ctrl-btn" onClick={handleAltitude} disabled={disabled}>
          <span className="ctrl-btn-icon ctrl-btn-icon--indigo">
            <ArrowUpFromLine size={14} />
          </span>
          <span className="ctrl-btn-label">Subir 1 m</span>
          <ChevronRight size={14} className="ctrl-btn-arrow" />
        </button>

        <button className="ctrl-btn" onClick={handleBattery} disabled={disabled}>
          <span className="ctrl-btn-icon ctrl-btn-icon--warning">
            <BatteryWarning size={14} />
          </span>
          <span className="ctrl-btn-label">Consumir batería</span>
          <ChevronRight size={14} className="ctrl-btn-arrow" />
        </button>
      </div>

      {/* Add / Remove */}
      <div className="ctrl-manage">
        <button className="ctrl-btn ctrl-btn--success" onClick={handleAddDrone}>
          <span className="ctrl-btn-icon ctrl-btn-icon--success">
            <Plus size={14} />
          </span>
          <span className="ctrl-btn-label">Añadir dron</span>
        </button>

        <button className="ctrl-btn ctrl-btn--danger" onClick={handleRemove} disabled={!selected}>
          <span className="ctrl-btn-icon ctrl-btn-icon--danger">
            <Trash2 size={14} />
          </span>
          <span className="ctrl-btn-label">Eliminar dron</span>
        </button>
      </div>
    </div>
  )
}

export default ControlPanel
