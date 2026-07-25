/**
 * DroneHealthPanel.tsx — Estado panel
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * CONTENT
 * └── System Status cards (moved here from PreflightPanel)
 *     All values sourced from NormalizedTelemetry and updated in real-time.
 *
 * WHAT WAS REMOVED
 * └── Health Monitor section (Battery, GPS, Link, IMU, Mission rows from
 *     DroneHealthMonitor) — removed per user request. The DroneHealthMonitor
 *     import and all related state remain available in the codebase if needed
 *     in the future; they are just not rendered here anymore.
 *
 * HOW TO ADD A STATUS CARD
 * Add an entry to the `STATUS_CARD_DEFS` array below.
 * Each entry is a function (t: NormalizedTelemetry | null) → CardDef.
 *
 * HOW TO WIRE MISSING FIELDS (armState, cpuLoadPercent)
 * Replace the `'—'` values in the relevant entries with:
 *   t?.someFlightTelemetryField ?? '—'
 * Once FlightTelemetry is piped to this panel.
 */

import React, { useMemo, memo } from 'react';
import {
  Radio, Satellite, Hexagon, Zap, Battery,
  ArrowUpDown, MoveRight, ChevronsUpDown, Lock, Cpu,
} from 'lucide-react';
import type { NormalizedTelemetry } from '../../telemetry';
import type { OperationalReadiness } from '../../operational';
import { GPSFixType, BatteryWarningLevel } from '../../telemetry';
import { OperationalReadinessSummary } from '../../operational';
import './DroneHealthPanel.css';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface Props {
  normTelemetry: NormalizedTelemetry | null;
  readiness: OperationalReadiness;
}

type CardStatus = 'ok' | 'warn' | 'error' | 'info' | 'na';

interface CardDef {
  id: string;
  label: string;
  icon: React.ReactNode;
  value: string;
  subValue?: string;
  status: CardStatus;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

const GPS_LABELS: Record<number, string> = {
  [GPSFixType.NO_GPS]:    'NO GPS',
  [GPSFixType.NO_FIX]:   'NO FIX',
  [GPSFixType.FIX_2D]:   '2D FIX',
  [GPSFixType.FIX_3D]:   '3D FIX',
  [GPSFixType.DGPS]:     'DGPS',
  [GPSFixType.RTK_FLOAT]:'RTK FLOAT',
  [GPSFixType.RTK_FIXED]:'RTK FIXED',
};

const gpsLabel   = (fix: number): string => GPS_LABELS[fix] ?? `FIX ${fix}`;
const gpsStatus  = (fix: number): CardStatus => fix >= GPSFixType.FIX_3D ? 'ok' : fix === GPSFixType.FIX_2D ? 'warn' : 'error';
const batPctSt   = (p: number | null | undefined): CardStatus => p == null ? 'na' : p < 20 ? 'error' : p < 40 ? 'warn' : 'ok';
const batVoltSt  = (v: number | null | undefined): CardStatus => !v ? 'na' : v < 10.5 ? 'error' : v < 11.1 ? 'warn' : 'ok';

// ─────────────────────────────────────────────────────────────────────────────
// Card definitions — add new cards here
// ─────────────────────────────────────────────────────────────────────────────

function buildCards(t: NormalizedTelemetry | null): CardDef[] {
  const bat  = t?.battery;
  const pct  = bat?.remainingPercent ?? null;
  const volts = bat?.voltageV ?? null;
  const fix  = t?.gpsFixStatus ?? GPSFixType.NO_GPS;

  return [
    // ── RC Link ─────────────────────────────────────────────────────────────
    {
      id:     'link',
      label:  'RC Link',
      icon:   <Radio size={14} />,
      value:  t ? (t.connected ? 'CONNECTED' : 'NO LINK') : '—',
      status: t ? (t.connected ? 'ok' : 'error') : 'na',
    },
    // ── GPS Fix ──────────────────────────────────────────────────────────────
    {
      id:     'gps',
      label:  'GPS Fix',
      icon:   <Satellite size={14} />,
      value:  t ? gpsLabel(fix) : '—',
      status: t ? gpsStatus(fix) : 'na',
    },
    // ── EKF Health ───────────────────────────────────────────────────────────
    {
      id:     'ekf',
      label:  'EKF',
      icon:   <Hexagon size={14} />,
      value:  t ? (t.ekfHealthy ? 'HEALTHY' : 'DEGRADED') : '—',
      status: t ? (t.ekfHealthy ? 'ok' : 'warn') : 'na',
    },
    // ── Battery % ────────────────────────────────────────────────────────────
    {
      id:       'bat-pct',
      label:    'Battery',
      icon:     <Zap size={14} />,
      value:    pct != null ? `${pct} %` : '—',
      subValue: bat?.warningLevel === BatteryWarningLevel.CRITICAL ? 'CRITICAL'
                : bat?.warningLevel === BatteryWarningLevel.LOW    ? 'LOW'
                : undefined,
      status: batPctSt(pct),
    },
    // ── Voltage ──────────────────────────────────────────────────────────────
    {
      id:     'bat-v',
      label:  'Voltage',
      icon:   <Battery size={14} />,
      value:  volts && volts > 0 ? `${volts.toFixed(2)} V` : '—',
      status: batVoltSt(volts),
    },
    // ── Altitude ─────────────────────────────────────────────────────────────
    {
      id:     'alt',
      label:  'Altitude',
      icon:   <ArrowUpDown size={14} />,
      value:  t ? `${t.altitude.toFixed(1)} m` : '—',
      status: 'info',
    },
    // ── Ground Speed ─────────────────────────────────────────────────────────
    {
      id:     'gnd',
      label:  'Gnd Speed',
      icon:   <MoveRight size={14} />,
      value:  t ? `${(t.groundSpeed * 3.6).toFixed(1)} km/h` : '—',
      status: 'info',
    },
    // ── Vertical Speed ───────────────────────────────────────────────────────
    {
      id:     'vs',
      label:  'V. Speed',
      icon:   <ChevronsUpDown size={14} />,
      value:  t ? `${t.verticalSpeed.toFixed(1)} m/s` : '—',
      status: 'info',
    },
    // ── ARM State: pending until NormalizedTelemetry exposes vehicleStatus.armState.
    {
      id:       'arm',
      label:    'ARM State',
      icon:     <Lock size={14} />,
      value:    '—',
      subValue: 'pending',
      status:   'na',
    },
    // ── CPU Load: pending until NormalizedTelemetry exposes vehicleStatus.cpuLoadPercent.
    {
      id:       'cpu',
      label:    'CPU Load',
      icon:     <Cpu size={14} />,
      value:    '—',
      subValue: 'pending',
      status:   'na',
    },
  ];
}

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

const DroneHealthPanel: React.FC<Props> = memo(({ normTelemetry, readiness }) => {
  const cards = useMemo(() => buildCards(normTelemetry), [normTelemetry]);

  return (
    <div className="dhp-panel" role="region" aria-label="System status">
      <OperationalReadinessSummary readiness={readiness} />

      {/* ── Section header ──────────────────────────────────────────────── */}
      <div className="dhp-section-title">System Status</div>

      {/* ── Status card grid ────────────────────────────────────────────── */}
      <div className="dhp-status-grid">
        {cards.map(card => (
          <div
            key={card.id}
            className={`dhp-card dhp-card--${card.status}`}
            title={card.label}
          >
            <div className="dhp-card-top">
              <span className="dhp-card-icon" aria-hidden="true">{card.icon}</span>
              <span className={`dhp-card-badge dhp-badge--${card.status}`}>
                {card.status === 'ok'    ? '●'
                 : card.status === 'warn'  ? '◐'
                 : card.status === 'error' ? '●'
                 : card.status === 'na'    ? '○'
                 : '◦'}
              </span>
            </div>
            <div className="dhp-card-value" aria-label={`${card.label}: ${card.value}`}>
              {card.value}
            </div>
            {card.subValue && (
              <div className={`dhp-card-sub dhp-card-sub--${card.status}`}>
                {card.subValue}
              </div>
            )}
            <div className="dhp-card-label">{card.label}</div>
          </div>
        ))}
      </div>

      {/* ── No telemetry notice ─────────────────────────────────────────── */}
      {!normTelemetry && (
        <div className="dhp-no-data">
          <span className="dhp-no-data-icon" aria-hidden="true">◫</span>
          <span>Sin telemetria activa. Revisa link, bridge o seleccion de dron.</span>
        </div>
      )}

    </div>
  );
});

export default DroneHealthPanel;
