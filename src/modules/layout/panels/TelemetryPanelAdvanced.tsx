/**
 * TelemetryPanelAdvanced.tsx
 *
 * Professional 7-section telemetry dashboard for the left sidebar.
 * Sections: Status header · Link · Battery · GPS · EKF · Position · Flight · Navigation
 *
 * All data comes from FlightTelemetry (full MAVLink-normalised snapshot).
 * Sections are individually collapsible.
 */

import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import {
  Radio, Satellite, Battery, Navigation, MapPin,
  Cpu, Wind, Settings, X,
} from 'lucide-react';
import './TelemetryPanelAdvanced.css';

import type { FlightTelemetry, NormalizedTelemetry } from '../../telemetry';
import {
  ArmState, BatteryWarningLevel, EKFHealthStatus, GPSFixType,
} from '../../telemetry';
import { useDroneStore } from '../../drone';
import { useMissionProgressStore } from '../../mission/store/missionProgressStore';
import {
  MissionState,
  MISSION_STATE_LABELS,
  MISSION_STATE_COLORS,
} from '../../mission';
import {
  fmtDist, fmtEta, fmt,
  fmtAmpere, fmtMah, fmtSpeedKmh,
  fmtVoltage,
  fmtAngle, fmtPercent, fmtGPSFix, fmtSats,
  fmtDOP, fmtHeartbeat,
} from '../../../utils/telemetryFormatters';
import { formatCoordinateRows } from '../../../utils/coordinateFormat';
import { useUIStore } from '../../../shared/store/uiStore';

// ── Types ──────────────────────────────────────────────────────────────────

interface Props {
  /** Live flight telemetry — drives all display fields. */
  telemetry: FlightTelemetry | null;
  /** Normalized telemetry metadata for readiness/source badges. */
  normTelemetry?: NormalizedTelemetry | null;
  /** Optional drone name shown in the panel header. */
  droneName?: string;
}

// ── Field config (user-configurable visibility) ────────────────────────────

/** Keys for every optional (non-default) field. */
type FieldKey =
  | 'link_heartbeat' | 'link_cpu'
  | 'bat_voltage'    | 'bat_current' | 'bat_mah'
  | 'gps_fix'        | 'gps_hdop'     | 'gps_vdop'
  | 'section_ekf'
  | 'pos_coords'     | 'pos_home_msl'
  | 'flight_airspeed'| 'flight_cog'
  | 'section_nav';

/** User-configurable field visibility. */
const DEFAULT_FIELDS: Record<FieldKey, boolean> = {
  link_heartbeat: false, link_cpu:       false,
  bat_voltage:    true,  bat_current:    false, bat_mah: false,
  gps_fix:        false, gps_hdop:       false, gps_vdop: false,
  section_ekf:    false,
  pos_coords:     true,
  pos_home_msl:   false,
  flight_airspeed:false, flight_cog:     false,
  section_nav:    false,
};

const FIELD_GROUPS: { section: string; fields: { key: FieldKey; label: string }[] }[] = [
  { section: 'Enlace',     fields: [{ key: 'link_heartbeat', label: 'Heartbeat' }, { key: 'link_cpu', label: 'CPU FCC' }] },
  { section: 'Batería',   fields: [{ key: 'bat_voltage', label: 'Voltaje' }, { key: 'bat_current', label: 'Corriente' }, { key: 'bat_mah', label: 'Consumido (mAh)' }] },
  { section: 'GPS',        fields: [{ key: 'gps_fix', label: 'Tipo de Fix' }, { key: 'gps_hdop', label: 'HDOP' }, { key: 'gps_vdop', label: 'VDOP' }] },
  { section: 'Estimador', fields: [{ key: 'section_ekf', label: 'Sección EKF completa' }] },
  { section: 'Posición',  fields: [{ key: 'pos_coords', label: 'Latitud / Longitud' }, { key: 'pos_home_msl', label: 'Alt. Home MSL' }] },
  { section: 'Vuelo',      fields: [{ key: 'flight_airspeed', label: 'Vel. Aire' }, { key: 'flight_cog', label: 'Curso (COG)' }] },
  { section: 'Navegación',fields: [{ key: 'section_nav', label: 'Sección Navegación' }] },
];

const LS_KEY = 'tap-field-config';

function loadFieldConfig(): Record<FieldKey, boolean> {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return { ...DEFAULT_FIELDS };
    return { ...DEFAULT_FIELDS, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULT_FIELDS };
  }
}

function saveFieldConfig(cfg: Record<FieldKey, boolean>): void {
  try { localStorage.setItem(LS_KEY, JSON.stringify(cfg)); } catch { /* ignore */ }
}

// ── Group ──────────────────────────────────────────────────────────────────

const Group: React.FC<{
  label: string;
  icon?: React.ReactNode;
  badge?: React.ReactNode;
  children: React.ReactNode;
}> = ({ label, icon, badge, children }) => (
  <div className="tap-group">
    <div className="tap-group-head">
      {icon && <span className="tap-group-icon" aria-hidden="true">{icon}</span>}
      <span className="tap-group-label">{label}</span>
      {badge !== undefined && <span className="tap-group-badge">{badge}</span>}
    </div>
    <div className="tap-grid">
      {children}
    </div>
  </div>
);

// ── Data cell ──────────────────────────────────────────────────────────────

const Cell: React.FC<{
  label: string;
  value: React.ReactNode;
  wide?: boolean;
  dim?: boolean;
}> = ({ label, value, wide, dim }) => (
  <div className={`tap-cell${wide ? ' tap-cell--wide' : ''}`}>
    <span className="tap-cell-label">{label}</span>
    <span className={`tap-cell-value${dim ? ' tap-cell-value--dim' : ''}`}>{value}</span>
  </div>
);

// ── Helper: battery fill colour ────────────────────────────────────────────

function batteryColor(level: BatteryWarningLevel, pct: number | null): string {
  if (level === BatteryWarningLevel.CRITICAL || (pct !== null && pct < 15))
    return 'var(--rohu-danger, #EF4444)';
  if (level === BatteryWarningLevel.LOW || (pct !== null && pct < 30))
    return 'var(--rohu-warning, #F59E0B)';
  return 'var(--rohu-success, #22C55E)';
}

// ── Helper: GPS badge class ────────────────────────────────────────────────

function gpsBadgeClass(fixType: number): string {
  if (fixType >= GPSFixType.RTK_FLOAT) return 'tap-badge tap-badge--rtk';
  if (fixType === GPSFixType.DGPS)     return 'tap-badge tap-badge--dgps';
  if (fixType >= GPSFixType.FIX_3D)   return 'tap-badge tap-badge--good';
  if (fixType === GPSFixType.FIX_2D)  return 'tap-badge tap-badge--warn';
  return 'tap-badge tap-badge--bad';
}

// ── Helper: EKF badge class ────────────────────────────────────────────────

function ekfBadgeClass(health: string): string {
  if (health === EKFHealthStatus.GOOD)     return 'tap-badge tap-badge--good';
  if (health === EKFHealthStatus.DEGRADED) return 'tap-badge tap-badge--warn';
  if (health === EKFHealthStatus.BAD)      return 'tap-badge tap-badge--bad';
  return 'tap-badge tap-badge--unknown';
}

// ── Helper: link dot class ─────────────────────────────────────────────────

function linkDotClass(connected: boolean, elapsedMs: number): string {
  if (!connected || elapsedMs > 5000) return 'tap-link-dot tap-link-dot--lost';
  if (elapsedMs > 2000)               return 'tap-link-dot tap-link-dot--weak';
  return 'tap-link-dot tap-link-dot--ok';
}

function normalizeNumber(value: number | null | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function wrap360(value: number): number {
  let out = value % 360;
  if (out < 0) out += 360;
  return out;
}

function shortestArcDeg(from: number, to: number): number {
  return ((to - from + 540) % 360) - 180;
}

function useSmoothedScalar(target: number | null | undefined, tauMs = 220): number | null {
  const initial = normalizeNumber(target);
  const [display, setDisplay] = useState<number | null>(initial);
  const displayRef = useRef<number | null>(initial);
  const targetRef = useRef<number | null>(normalizeNumber(target));

  useEffect(() => {
    targetRef.current = normalizeNumber(target);
  }, [target]);

  useEffect(() => {
    let raf = 0;
    let last = performance.now();

    const tick = (now: number): void => {
      const dt = Math.max(1, now - last);
      last = now;

      const tgt = targetRef.current;
      const cur = displayRef.current;

      if (tgt === null && cur !== null) {
        displayRef.current = null;
        setDisplay(null);
      } else if (tgt !== null && cur === null) {
        displayRef.current = tgt;
        setDisplay(tgt);
      } else if (tgt !== null && cur !== null) {
        const alpha = 1 - Math.exp(-dt / tauMs);
        const next = Math.abs(tgt - cur) < 1e-3 ? tgt : cur + (tgt - cur) * alpha;
        if (next !== cur) {
          displayRef.current = next;
          setDisplay(next);
        }
      }

      raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [tauMs]);

  return display;
}

function useSmoothedAngle(target: number | null | undefined, tauMs = 220): number | null {
  const initial = normalizeNumber(target);
  const [display, setDisplay] = useState<number | null>(initial);
  const displayRef = useRef<number | null>(initial);
  const targetRef = useRef<number | null>(normalizeNumber(target));

  useEffect(() => {
    const normalized = normalizeNumber(target);
    targetRef.current = normalized !== null ? wrap360(normalized) : null;
  }, [target]);

  useEffect(() => {
    let raf = 0;
    let last = performance.now();

    const tick = (now: number): void => {
      const dt = Math.max(1, now - last);
      last = now;
      const tgt = targetRef.current;
      const cur = displayRef.current;

      if (tgt === null && cur !== null) {
        displayRef.current = null;
        setDisplay(null);
      } else if (tgt !== null && cur === null) {
        displayRef.current = tgt;
        setDisplay(tgt);
      } else if (tgt !== null && cur !== null) {
        const alpha = 1 - Math.exp(-dt / tauMs);
        const delta = shortestArcDeg(cur, tgt);
        const next = Math.abs(delta) < 1e-3 ? tgt : wrap360(cur + delta * alpha);
        if (next !== cur) {
          displayRef.current = next;
          setDisplay(next);
        }
      }

      raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [tauMs]);

  return display;
}

// ── Component ──────────────────────────────────────────────────────────────

const TelemetryPanelAdvanced: React.FC<Props> = ({
  telemetry,
  normTelemetry = null,
  droneName = 'TELEMETRÍA',
}) => {

  const [minimized, setMinimized] = useState(false);

  // ── Field config ─────────────────────────────────────────────────────────
  const [fieldConfig, setFieldConfig] = useState<Record<FieldKey, boolean>>(loadFieldConfig);
  const [showConfig, setShowConfig]   = useState(false);
  const configWrapRef = useRef<HTMLDivElement | null>(null);

  const toggleField = useCallback((key: FieldKey) => {
    setFieldConfig(prev => {
      const next = { ...prev, [key]: !prev[key] };
      saveFieldConfig(next);
      return next;
    });
  }, []);

  const resetFields = useCallback(() => {
    const fresh = { ...DEFAULT_FIELDS };
    setFieldConfig(fresh);
    saveFieldConfig(fresh);
  }, []);

  // close settings on outside click
  useEffect(() => {
    if (!showConfig) return;
    const handler = (e: MouseEvent) => {
      if (configWrapRef.current && !configWrapRef.current.contains(e.target as Node))
        setShowConfig(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showConfig]);

  const f = fieldConfig; // shorthand

  // ── Clock for heartbeat elapsed time (updates 1 Hz) ─────────────────────
  const [nowMs, setNowMs] = useState(() => Date.now());
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => {
    tickRef.current = setInterval(() => setNowMs(Date.now()), 1000);
    return () => { if (tickRef.current) clearInterval(tickRef.current); };
  }, []);

  // ── Telemetry aliases ────────────────────────────────────────────────────
  const status = telemetry?.vehicleStatus;
  const bat    = telemetry?.battery;
  const gps    = telemetry?.gpsStatus;
  const ekf    = telemetry?.ekf;
  // const alt    = telemetry?.altitude; // kept for quick re-enable of hidden altitude fields
  const vel    = telemetry?.velocity;
  const att    = telemetry?.attitude;
  const nav    = telemetry?.navigation;

  // ── Smoothed numeric values (UI-only; no impact on PFD processing) ─────────
  const smoothCpu         = useSmoothedScalar(status?.cpuLoadPercent, 260);
  const smoothBatPct      = useSmoothedScalar(bat?.remainingPercent, 280);
  const smoothBatVoltage  = useSmoothedScalar(bat?.voltageV, 240);
  const smoothBatCurrent  = useSmoothedScalar(bat?.currentA, 240);
  const smoothBatMah      = useSmoothedScalar(bat?.consumedMah, 280);
  // Altitude smoothing kept here for quick re-enable of hidden altitude fields.
  // const smoothAltMSL      = useSmoothedScalar(alt?.altitudeMSLm, 220);
  // const smoothAltAGL      = useSmoothedScalar(alt?.altitudeAGLm, 220);
  // const smoothHomeMSL     = useSmoothedScalar(alt?.homeAltitudeMSLm, 240);
  const smoothGroundSpeed = useSmoothedScalar(vel?.groundSpeedMs, 180);
  const smoothVertSpeed   = useSmoothedScalar(vel?.verticalSpeedMs, 180);
  const smoothAirSpeed    = useSmoothedScalar(vel?.airSpeedMs, 180);
  const smoothHeading     = useSmoothedAngle(nav?.headingDeg, 200);
  const smoothCOG         = useSmoothedAngle(nav?.courseOverGroundDeg, 220);
  const smoothPitch       = useSmoothedScalar(att?.pitchDeg, 160);
  const smoothRoll        = useSmoothedScalar(att?.rollDeg, 160);
  const smoothDistWp      = useSmoothedScalar(nav?.distanceToWaypointM, 220);
  const smoothBearingWp   = useSmoothedAngle(nav?.bearingToWaypointDeg, 220);
  const coordinateFormat  = useUIStore((s) => s.coordinateFormat);
  const coordinateRows =
    nav?.latitude == null || nav.longitude == null
      ? [{ label: coordinateFormat === 'geo' ? 'Lat' : coordinateFormat.toUpperCase(), value: '--' }]
      : formatCoordinateRows(coordinateFormat, nav.latitude, nav.longitude);

  // ── Drone store — mission state ──────────────────────────────────────────
  const dronesObj   = useDroneStore(s => s.drones);
  const activeDrone = useMemo(() => Object.values(dronesObj).find(d => d.active) ?? null, [dronesObj]);
  const lifecycleState = activeDrone?.missionLifecycleState ?? MissionState.IDLE;
  const lifecycleLabel = MISSION_STATE_LABELS[lifecycleState];
  const lifecycleColor = MISSION_STATE_COLORS[lifecycleState];

  const allProgress = useMissionProgressStore(s => s.progress);
  const missionProg = activeDrone ? allProgress[activeDrone.id] ?? null : null;

  // ── Derived values ───────────────────────────────────────────────────────
  const isArmed      = status?.armState === ArmState.ARMED;
  const readyForFlight = normTelemetry?.readyForFlight ?? false;
  const speedSource = normTelemetry?.speedSource ?? 'INVALID';
  const batPct       = smoothBatPct;
  const batColor     = batteryColor(bat?.warningLevel ?? BatteryWarningLevel.UNKNOWN, batPct);
  const batWidth     = batPct != null ? `${Math.max(0, Math.min(100, batPct))}%` : '0%';
  const isConnected  = status?.isConnected ?? false;
  const lastBeat     = status?.lastHeartbeatMs ?? 0;
  const elapsed      = lastBeat > 0 ? nowMs - lastBeat : Infinity;

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <div className={`tap-panel${minimized ? ' tap-panel--minimized' : ''}`}>

      {/* ═══ HEADER ════════════════════════════════════════════════════════ */}
      <div className="tap-header">
        <span className="tap-drone-name">{droneName}</span>
        <div className="tap-header-badges">
          <span className={`tap-arm-badge${isArmed ? ' tap-arm-badge--armed' : ''}`}>
            {isArmed ? 'ARMADO' : 'DESARMADO'}
          </span>
          <span className="tap-mode-badge">
            {readyForFlight ? 'READY' : 'NOT READY'}
          </span>
          <span className="tap-mode-badge">
            {`SPD ${speedSource}`}
          </span>
          {status && (
            <span className="tap-mode-badge">{status.flightModeLabel}</span>
          )}
        </div>
        <button
          className="tap-settings-btn"
          title="Configurar campos visibles"
          onClick={() => setShowConfig(v => !v)}
          aria-pressed={showConfig}
          type="button"
        >
          <Settings size={11} />
        </button>
        <button
          className="tap-minimize-btn"
          title={minimized ? 'Expandir' : 'Minimizar'}
          onClick={() => setMinimized(v => !v)}
          type="button"
        >
          {minimized ? '▸' : '▾'}
        </button>
      </div>

      {/* ═══ SETTINGS OVERLAY ══════════════════════════════════════════════ */}
      {showConfig && (
        <div className="tap-config-overlay" ref={configWrapRef}>
          <div className="tap-config-hdr">
            <span className="tap-config-title">Campos visibles</span>
            <button className="tap-config-close" onClick={() => setShowConfig(false)} type="button" aria-label="Cerrar configuración"><X size={11} /></button>
          </div>
          <div className="tap-config-body">
            {FIELD_GROUPS.map(grp => (
              <div key={grp.section} className="tap-config-group">
                <span className="tap-config-group-label">{grp.section}</span>
                {grp.fields.map(field => (
                  <label key={field.key} className="tap-config-item">
                    <input
                      type="checkbox"
                      checked={f[field.key]}
                      onChange={() => toggleField(field.key)}
                    />
                    <span>{field.label}</span>
                  </label>
                ))}
              </div>
            ))}
          </div>
          <button className="tap-config-reset" onClick={resetFields} type="button">Restaurar por defecto</button>
        </div>
      )}

      {!minimized && (
        <div className="tap-body">

          {/* ═══ ENLACE ════════════════════════════════════════════════════ */}
          <Group
            label="ENLACE"
            icon={<Radio size={11} />}
            badge={
              <span className={linkDotClass(isConnected, elapsed)}>
                <span className="tap-link-dot-pulse" aria-hidden="true" />
              </span>
            }
          >
            <Cell
              label="Estado" wide
              value={
                <span className={isConnected ? 'tap-text-ok' : 'tap-text-bad'}>
                  {isConnected ? 'CONECTADO' : 'SIN ENLACE'}
                </span>
              }
            />
            {f.link_heartbeat && (
              <Cell label="Heartbeat" value={isConnected ? fmtHeartbeat(elapsed) : '--'} />
            )}
            {f.link_cpu && status?.cpuLoadPercent != null && (
              <Cell label="CPU FCC" value={fmtPercent(smoothCpu)} />
            )}
          </Group>

          {/* ═══ BATERÍA ═══════════════════════════════════════════════════ */}
          <Group
            label="BATERÍA"
            icon={<Battery size={11} />}
            badge={
              <span className="tap-pct-inline" style={{ color: batColor }}>
                {fmtPercent(batPct)}
              </span>
            }
          >
            <div className="tap-bat-bar-wrap">
              <div
                className="tap-bat-bar"
                role="progressbar"
                aria-valuenow={batPct ?? 0} aria-valuemin={0} aria-valuemax={100}
              >
                <div
                  className={`tap-bat-bar-fill${bat?.warningLevel === BatteryWarningLevel.CRITICAL ? ' tap-bat-pulse' : ''}`}
                  style={{ width: batWidth, background: batColor }}
                />
              </div>
            </div>
            {f.bat_voltage && <Cell label="Voltaje" value={fmtVoltage(smoothBatVoltage)} />}
            <Cell label="Carga" value={<span style={{ color: batColor }}>{fmtPercent(batPct)}</span>} />
            {f.bat_current && <Cell label="Corriente" value={fmtAmpere(smoothBatCurrent)} />}
            {f.bat_mah     && <Cell label="Consumido" value={fmtMah(smoothBatMah)} />}
          </Group>

          {/* ═══ GPS ═══════════════════════════════════════════════════════ */}
          <Group
            label="GPS"
            icon={<Satellite size={11} />}
            badge={
              gps
                ? <span className={gpsBadgeClass(gps.fixType)}>{fmtGPSFix(gps.fixType)}</span>
                : <span className="tap-badge tap-badge--unknown">--</span>
            }
          >
            <Cell label="Satélites" value={fmtSats(gps?.satellitesVisible)} />
            {f.gps_fix  && <Cell label="Fix"  value={gps ? fmtGPSFix(gps.fixType) : '--'} />}
            {f.gps_hdop && <Cell label="HDOP" value={fmtDOP(gps?.hdop)} />}
            {f.gps_vdop && <Cell label="VDOP" value={fmtDOP(gps?.vdop)} />}
          </Group>

          {/* ═══ ESTIMADOR EKF ═════════════════════════════════════════════ */}
          {f.section_ekf && (
            <Group
              label="ESTIMADOR"
              icon={<Cpu size={11} />}
              badge={
                ekf
                  ? <span className={ekfBadgeClass(ekf.healthStatus)}>{ekf.healthStatus}</span>
                  : <span className="tap-badge tap-badge--unknown">EKF</span>
              }
            >
              <Cell label="Estado"       value={ekf?.healthStatus ?? '--'} wide />
              <Cell label="Var. pos H"   value={fmt(ekf?.posHorizVariance, 3)} />
              <Cell label="Var. pos V"   value={fmt(ekf?.posVertVariance, 3)} />
              <Cell label="Var. vel"     value={fmt(ekf?.velocityVariance, 3)} />
              <Cell label="Var. brújula" value={fmt(ekf?.compassVariance, 3)} />
            </Group>
          )}

          {/* ═══ POSICIÓN ══════════════════════════════════════════════════ */}
          {f.pos_coords && (
            <Group label="POSICIÓN" icon={<MapPin size={11} />}>
              {coordinateRows.map((row) => (
                <Cell
                  key={row.label}
                  label={row.label}
                  value={row.value}
                  wide
                  dim
                />
              ))}
            </Group>
          )}

          {/* ═══ VUELO ═════════════════════════════════════════════════════ */}
          <Group label="VUELO" icon={<Wind size={11} />}>
            <Cell label="Vel. suelo" value={fmtSpeedKmh(smoothGroundSpeed)} />
            <Cell label="Vel. vert." value={fmtSpeedKmh(smoothVertSpeed)} />
            {f.flight_airspeed && vel?.airSpeedMs != null && (
              <Cell label="Vel. aire" value={fmtSpeedKmh(smoothAirSpeed)} />
            )}
            <Cell label="Rumbo" value={fmtAngle(smoothHeading)} wide />
            <Cell
              label="Pitch"
              value={<>{fmt(smoothPitch, 1)}<span className="tap-cell-unit">°</span></>}
            />
            <Cell
              label="Roll"
              value={<>{fmt(smoothRoll, 1)}<span className="tap-cell-unit">°</span></>}
            />
            {f.flight_cog && nav?.courseOverGroundDeg != null && (
              <Cell label="COG" value={fmtAngle(smoothCOG)} />
            )}
          </Group>

          {/* ═══ NAVEGACIÓN ════════════════════════════════════════════════ */}
          {f.section_nav && (
            <Group
              label="NAVEGACIÓN"
              icon={<Navigation size={11} />}
              badge={
                <span className="tap-mission-state" style={{ color: lifecycleColor }}>
                  {lifecycleLabel}
                </span>
              }
            >
              <Cell label="Misión" value={lifecycleLabel} wide />
              {nav?.currentWaypointIndex != null && (
                <Cell
                  label="Waypoint"
                  value={
                    missionProg
                      ? `${nav.currentWaypointIndex + 1} / ${missionProg.totalWaypoints}`
                      : `${nav.currentWaypointIndex + 1}`
                  }
                />
              )}
              <Cell label="Dist. WP" value={fmtDist(smoothDistWp)} />
              <Cell label="Rumbo WP" value={fmtAngle(smoothBearingWp)} />
              {missionProg && (
                <>
                  <Cell label="Restante" value={fmtDist(missionProg.totalDistanceRemaining)} />
                  <Cell label="ETA"      value={fmtEta(missionProg.etaSeconds)} />
                  <Cell label="Progreso" value={fmtPercent(missionProg.missionPercentComplete)} wide />
                </>
              )}
            </Group>
          )}

        </div>
      )}
    </div>
  );
};

export default TelemetryPanelAdvanced;
