import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  Radio,
  Plug,
  Unplug,
  ChevronDown,
  Activity,
  Gauge,
  Mountain,
  X,
} from 'lucide-react';

import { useDroneStore } from '../../drone';
import type { Drone } from '../../drone';
import { getBatteryColor } from '../../telemetry';
import {
  MissionState,
  MISSION_STATE_LABELS,
  MISSION_STATE_COLORS,
} from '../../mission';
import { BatteryIcon } from '../../../components/shared/BatteryIcon';

import './DroneFleetPanel.css';

/* ── Drone image placeholder (silhouette SVG) ───────────────────────── */
function DroneIcon({ size = 48 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* Simplified top-down quadcopter silhouette */}
      <circle cx="32" cy="32" r="6" fill="rgba(100,170,255,0.25)" stroke="rgba(100,170,255,0.6)" strokeWidth="1.5" />
      {/* Arms */}
      <line x1="26" y1="26" x2="14" y2="14" stroke="rgba(100,170,255,0.4)" strokeWidth="2" strokeLinecap="round" />
      <line x1="38" y1="26" x2="50" y2="14" stroke="rgba(100,170,255,0.4)" strokeWidth="2" strokeLinecap="round" />
      <line x1="26" y1="38" x2="14" y2="50" stroke="rgba(100,170,255,0.4)" strokeWidth="2" strokeLinecap="round" />
      <line x1="38" y1="38" x2="50" y2="50" stroke="rgba(100,170,255,0.4)" strokeWidth="2" strokeLinecap="round" />
      {/* Motors */}
      <circle cx="14" cy="14" r="8" fill="rgba(100,170,255,0.08)" stroke="rgba(100,170,255,0.3)" strokeWidth="1" />
      <circle cx="50" cy="14" r="8" fill="rgba(100,170,255,0.08)" stroke="rgba(100,170,255,0.3)" strokeWidth="1" />
      <circle cx="14" cy="50" r="8" fill="rgba(100,170,255,0.08)" stroke="rgba(100,170,255,0.3)" strokeWidth="1" />
      <circle cx="50" cy="50" r="8" fill="rgba(100,170,255,0.08)" stroke="rgba(100,170,255,0.3)" strokeWidth="1" />
    </svg>
  );
}

/* ── Battery bar visual ─────────────────────────────────────────────── */
function BatteryBar({ pct }: { pct: number }) {
  const color = getBatteryColor(pct);
  return (
    <div className="dfp-battery-bar">
      <div className="dfp-battery-bar__fill" style={{ width: `${Math.max(0, Math.min(100, pct))}%`, background: color }} />
    </div>
  );
}

/* ── Single drone card ──────────────────────────────────────────────── */
interface DroneCardProps {
  drone: Drone;
  isActive: boolean;
  onSelect: () => void;
}

function DroneCard({ drone, isActive, onSelect }: DroneCardProps) {
  const battColor = getBatteryColor(drone.battery);

  const lifecycleState = drone.missionLifecycleState ?? MissionState.IDLE;
  const missionLabel = MISSION_STATE_LABELS[lifecycleState];
  const missionColor = MISSION_STATE_COLORS[lifecycleState];

  const isFlying = drone.altitude > 0.5;

  return (
    <div
      className={`dfp-card ${isActive ? 'dfp-card--active' : ''}`}
      onClick={onSelect}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onSelect(); }}
    >
      {/* Active indicator bar */}
      {isActive && <div className="dfp-card__active-bar" />}

      {/* Top row: avatar + identity */}
      <div className="dfp-card__header">
        <div className="dfp-card__avatar">
          <DroneIcon size={44} />
        </div>
        <div className="dfp-card__identity">
          <span className="dfp-card__id">{drone.id}</span>
          <span className="dfp-card__name">{drone.name}</span>
        </div>
        <div className="dfp-card__conn-badge" data-connected={isFlying || drone.mode !== 'MANUAL' ? 'true' : undefined}>
          <span className="dfp-card__conn-dot" />
          <span className="dfp-card__conn-label">
            {isFlying || drone.mode !== 'MANUAL' ? 'Online' : 'Standby'}
          </span>
        </div>
      </div>

      {/* Stats row */}
      <div className="dfp-card__stats">
        {/* Battery */}
        <div className="dfp-card__stat" title="Batería">
          <BatteryIcon pct={drone.battery} size={13} showWarning />
          <span style={{ color: battColor }}>{drone.battery}%</span>
          <BatteryBar pct={drone.battery} />
        </div>

        {/* Mode */}
        <div className="dfp-card__stat" title="Modo">
          <Radio size={12} style={{ color: 'var(--mission-cyan)' }} />
          <span>{drone.mode}</span>
        </div>

        {/* Mission state */}
        <div className="dfp-card__stat" title="Misión">
          <Activity size={12} style={{ color: missionColor }} />
          <span style={{ color: missionColor }}>{missionLabel}</span>
        </div>
      </div>

      {/* Telemetry row — altitude & speed (only when flying) */}
      {isFlying && (
        <div className="dfp-card__telemetry">
          <div className="dfp-card__telem-item" title="Altitud AGL">
            <Mountain size={11} />
            <span>{drone.altitude.toFixed(1)} m</span>
          </div>
          <div className="dfp-card__telem-item" title="Velocidad">
            <Gauge size={11} />
            <span>{(drone.groundspeed * 3.6).toFixed(1)} km/h</span>
          </div>
        </div>
      )}

      {/* Actions row */}
      <div className="dfp-card__actions" onClick={(e) => e.stopPropagation()}>
        <button
          className={`dfp-card__action-btn ${isActive ? 'dfp-card__action-btn--disconnect' : 'dfp-card__action-btn--connect'}`}
          onClick={onSelect}
          title={isActive ? 'Dron activo' : 'Seleccionar dron'}
        >
          {isActive ? <Unplug size={13} /> : <Plug size={13} />}
          <span>{isActive ? 'Activo' : 'Seleccionar'}</span>
        </button>
      </div>
    </div>
  );
}

/* ══ Main Panel ══════════════════════════════════════════════════════ */

export const DroneFleetPanel: React.FC = () => {
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);

  const dronesObj = useDroneStore((s) => s.drones);
  const setActiveDrone = useDroneStore((s) => s.setActiveDrone);
  const drones = React.useMemo(() => Object.values(dronesObj), [dronesObj]);
  const activeDrone = drones.find((d) => d.active) ?? null;

  const droneCount = drones.length;
  const flyingCount = drones.filter((d) => d.altitude > 0.5).length;

  /* Close panel on outside click */
  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (
        panelRef.current && !panelRef.current.contains(e.target as Node) &&
        btnRef.current && !btnRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  /* Close on Escape */
  useEffect(() => {
    if (!open) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [open]);

  const handleSelect = useCallback(
    (id: string) => {
      setActiveDrone(id);
    },
    [setActiveDrone],
  );

  return (
    <div className="dfp-root">
      {/* ── Trigger button ────────────────────────────────────────── */}
      <button
        ref={btnRef}
        className={`dfp-trigger ${open ? 'dfp-trigger--open' : ''}`}
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="true"
        title="Panel de flota"
      >
        <svg className="dfp-trigger__icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="3" />
          <line x1="8.5" y1="8.5" x2="4" y2="4" />
          <line x1="15.5" y1="8.5" x2="20" y2="4" />
          <line x1="8.5" y1="15.5" x2="4" y2="20" />
          <line x1="15.5" y1="15.5" x2="20" y2="20" />
          <circle cx="4" cy="4" r="2" />
          <circle cx="20" cy="4" r="2" />
          <circle cx="4" cy="20" r="2" />
          <circle cx="20" cy="20" r="2" />
        </svg>
        <span className="dfp-trigger__label">Flota</span>
        <span className="dfp-trigger__badge">{droneCount}</span>
        <ChevronDown size={14} className={`dfp-trigger__chevron ${open ? 'dfp-trigger__chevron--open' : ''}`} />
      </button>

      {/* ── Dropdown panel ────────────────────────────────────────── */}
      <div ref={panelRef} className={`dfp-panel ${open ? 'dfp-panel--open' : ''}`}>
        {/* Header */}
        <div className="dfp-panel__header">
          <div className="dfp-panel__header-left">
            <h3 className="dfp-panel__title">Flota de Drones</h3>
            <span className="dfp-panel__subtitle">
              {droneCount} registrado{droneCount !== 1 ? 's' : ''}
              {flyingCount > 0 && <> &middot; <span className="dfp-panel__flying">{flyingCount} en vuelo</span></>}
            </span>
          </div>
          <button className="dfp-panel__close" onClick={() => setOpen(false)} title="Cerrar">
            <X size={16} />
          </button>
        </div>

        {/* Drone list */}
        <div className="dfp-panel__list">
          {drones.length === 0 ? (
            <div className="dfp-panel__empty">
              <Radio size={24} />
              <span>Sin drones registrados</span>
            </div>
          ) : (
            drones.map((drone) => (
              <DroneCard
                key={drone.id}
                drone={drone}
                isActive={drone.id === activeDrone?.id}
                onSelect={() => handleSelect(drone.id)}
              />
            ))
          )}
        </div>
      </div>
    </div>
  );
};

export default DroneFleetPanel;
