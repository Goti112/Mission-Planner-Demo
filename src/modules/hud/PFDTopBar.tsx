/**
 * PFDTopBar.tsx
 *
 * Compact two-row status strip displayed above the PFD canvas.
 *
 * Row 1 — Identity & mode:
 *   [● DRONE NAME]  [DISARMED / ARMED]  [FLIGHT MODE badge]
 *
 * Row 2 — Sensor & link health:
 *   [GPS fix + sats + HDOP]  ...spacer...  [battery bar + % + V]  [link quality]
 *
 * Uses --hud-* tokens from hud-tokens.css.
 * No logic beyond presentation — all classification done inline from props.
 */

import React from 'react';
import { Triangle, CircleOff, Sparkles } from 'lucide-react';
import type { FlightTelemetry } from '../telemetry';
import {
  ArmState,
  BatteryWarningLevel,
  FlightMode,
  GPSFixType,
} from '../telemetry';
import { getPFDModeDisplayLabel, getPFDModeDisplayKey } from './core/flightModeDisplay';
import './styles/pfd-chrome.css';

// ── Props ─────────────────────────────────────────────────────────────────

interface PFDTopBarProps {
  telemetry: FlightTelemetry;
  droneName?: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────

const AUTONOMOUS_MODES = new Set<FlightMode>([
  FlightMode.AUTO, FlightMode.GUIDED, FlightMode.MISSION,
  FlightMode.OFFBOARD, FlightMode.TAKEOFF, FlightMode.THROW,
]);
const ASSISTED_MODES = new Set<FlightMode>([
  FlightMode.ALT_HOLD, FlightMode.LOITER, FlightMode.POSHOLD,
  FlightMode.CIRCLE, FlightMode.HOLD, FlightMode.POSITION,
]);
const EMERGENCY_MODES = new Set<FlightMode>([
  FlightMode.RTL, FlightMode.SMART_RTL, FlightMode.LAND, FlightMode.BRAKE,
]);

function modeColor(mode: FlightMode): string {
  if (AUTONOMOUS_MODES.has(mode)) return 'var(--hud-safe)';
  if (ASSISTED_MODES.has(mode))   return 'var(--hud-accent)';
  if (EMERGENCY_MODES.has(mode))  return 'var(--hud-critical)';
  return 'var(--hud-warning)';
}

function gpsFix(fixType: number): string {
  if (fixType >= GPSFixType.RTK_FIXED) return 'RTK';
  if (fixType >= GPSFixType.RTK_FLOAT) return 'RTK~';
  if (fixType >= GPSFixType.DGPS)      return 'DGPS';
  if (fixType >= GPSFixType.FIX_3D)    return '3D';
  if (fixType >= GPSFixType.FIX_2D)    return '2D';
  return 'NO FIX';
}

function gpsColor(fixType: number): string {
  if (fixType >= GPSFixType.RTK_FLOAT) return 'var(--hud-accent)';
  if (fixType >= GPSFixType.FIX_3D)   return 'var(--hud-safe)';
  if (fixType >= GPSFixType.FIX_2D)   return 'var(--hud-warning)';
  return 'var(--hud-critical)';
}

function batteryColor(level: BatteryWarningLevel): string {
  if (level === BatteryWarningLevel.CRITICAL) return 'var(--hud-critical)';
  if (level === BatteryWarningLevel.LOW)      return 'var(--hud-warning)';
  return 'var(--hud-safe)';
}

// ── Component ─────────────────────────────────────────────────────────────

const PFDTopBar: React.FC<PFDTopBarProps> = ({
  telemetry,
  droneName = 'DRONE',
}) => {
  const { vehicleStatus, gpsStatus, battery } = telemetry;

  const isArmed    = vehicleStatus.armState === ArmState.ARMED;
  const displayMode = getPFDModeDisplayKey(vehicleStatus.flightMode, vehicleStatus.flightModeLabel) as FlightMode;
  const displayModeLabel = getPFDModeDisplayLabel(vehicleStatus.flightMode, vehicleStatus.flightModeLabel);
  const modColor   = modeColor(displayMode);
  const gpsClr     = gpsColor(gpsStatus.fixType);
  const batClr     = batteryColor(battery.warningLevel);
  const batPct     = battery.remainingPercent ?? 0;
  const isCritical = battery.warningLevel === BatteryWarningLevel.CRITICAL;

  const isLinkLost = !vehicleStatus.isConnected || vehicleStatus.lastHeartbeatMs > 3000;
  const isLinkWeak = vehicleStatus.isConnected && vehicleStatus.lastHeartbeatMs > 1500;
  const linkColor  = isLinkLost ? 'var(--hud-critical)'
                   : isLinkWeak ? 'var(--hud-warning)'
                   : 'var(--hud-safe)';
  const linkLabel  = isLinkLost ? 'LOST' : isLinkWeak ? 'WEAK' : 'GOOD';

  return (
    <div className="pfd-top-bar" role="status" aria-label="Vehicle status">

      {/* ── Row 1: identity + arm state + flight mode ─────────────── */}
      <div className="ptb-row ptb-row--primary">
        <span
          className={`ptb-arm-dot ${isArmed ? 'ptb-arm-dot--armed' : 'ptb-arm-dot--disarmed'}`}
          aria-hidden="true"
        />
        <span className="ptb-drone-name">{droneName.toUpperCase()}</span>

        <span className="ptb-divider-v" aria-hidden="true" />

        <span
          className={`ptb-arm-label ${isArmed ? 'ptb-arm-label--armed' : 'ptb-arm-label--disarmed'}`}
          title={isArmed ? 'Vehicle ARMED — motors enabled' : 'Vehicle DISARMED — safe'}
        >
          {isArmed ? <><Triangle size={11} fill="currentColor" /> ARMED</> : <><CircleOff size={11} /> DISARM</>}
        </span>

        <span className="ptb-spacer" />

        <span
          className="ptb-mode-badge"
          style={{ color: modColor, borderColor: modColor }}
          title={`Flight mode: ${displayModeLabel}`}
        >
          {displayModeLabel}
        </span>
      </div>

      {/* ── Row 2: sensors + battery + link ──────────────────────── */}
      <div className="ptb-row ptb-row--secondary">

        {/* GPS */}
        <span className="ptb-field" title={`GPS fix: ${gpsFix(gpsStatus.fixType)} · ${gpsStatus.satellitesVisible} satellites`}>
          <span className="ptb-field-lbl">GPS</span>
          <span className="ptb-field-val" style={{ color: gpsClr }}>
            {gpsFix(gpsStatus.fixType)}
          </span>
          <span className="ptb-field-sub">{gpsStatus.satellitesVisible}<Sparkles size={10} /></span>
        </span>

        {gpsStatus.hdop !== null && (
          <span className="ptb-field ptb-field--dim" title={`HDOP: ${gpsStatus.hdop.toFixed(1)}`}>
            <span className="ptb-field-lbl">HDOP</span>
            <span className="ptb-field-val">{gpsStatus.hdop.toFixed(1)}</span>
          </span>
        )}

        <span className="ptb-spacer" aria-hidden="true" />

        {/* Battery */}
        <span
          className={`ptb-battery ${isCritical ? 'ptb-battery--critical' : ''}`}
          title={`Battery: ${Math.round(batPct)}% · ${battery.voltageV.toFixed(2)}V${battery.currentA !== null ? ` · ${battery.currentA.toFixed(1)}A` : ''}`}
        >
          <span className="ptb-bat-track">
            <span
              className="ptb-bat-fill"
              style={{
                width: `${Math.max(0, Math.min(100, batPct))}%`,
                backgroundColor: batClr,
              }}
            />
          </span>
          <span className="ptb-field-val" style={{ color: batClr }}>
            {battery.remainingPercent !== null ? `${Math.round(batPct)}%` : '--'}
          </span>
          <span className="ptb-field-sub">{battery.voltageV.toFixed(1)}V</span>
        </span>

        <span className="ptb-divider-v" aria-hidden="true" />

        {/* Link */}
        <span
          className={`ptb-field ${isLinkLost ? 'ptb-field--lost' : ''}`}
          title={`Telemetry link: ${linkLabel}${vehicleStatus.isConnected ? ` · ${vehicleStatus.lastHeartbeatMs} ms` : ' · offline'}`}
        >
          <span className="ptb-field-lbl">LINK</span>
          <span className="ptb-field-val" style={{ color: linkColor }}>
            {linkLabel}
          </span>
        </span>

      </div>
    </div>
  );
};

export default PFDTopBar;
