/**
 * PFDBottomBar.tsx
 *
 * Compact telemetry data strip displayed below the PFD canvas.
 *
 * 4-column × 2-row grid layout:
 *
 *   ┌────────────┬────────────┬────────────┬────────────┐
 *   │  GS  m/s  │ ALT AGL m  │  VS  m/s   │   HDG  °   │
 *   ├────────────┼────────────┼────────────┼────────────┤
 *   │  WP dist   │ HOME dist  │  LAT       │  LON       │
 *   └────────────┴────────────┴────────────┴────────────┘
 *
 * VS is color-coded: cyan for climb, orange for significant sink.
 * Distances auto-switch to km when ≥ 1000 m.
 * Coordinates show 7 decimal places (Mission Planner style).
 *
 * Uses --hud-* tokens from hud-tokens.css.
 */

import React from 'react';
import type {
  FlightTelemetry,
  NormalizedTelemetry,
} from '../telemetry';
import { CoordinateDisplay } from '../../components/shared/CoordinateDisplay';
import './styles/pfd-chrome.css';

// ── Props ─────────────────────────────────────────────────────────────────

interface PFDBottomBarProps {
  telemetry:     FlightTelemetry;
  normTelemetry: NormalizedTelemetry | null;
}

// ── Formatters ────────────────────────────────────────────────────────────

function fmt(v: number | null | undefined, dec: number): string {
  if (v == null || !Number.isFinite(v)) return '--';
  return v.toFixed(dec);
}

function toKmh(ms: number | null | undefined): number | null {
  if (ms == null || !Number.isFinite(ms)) return null;
  return ms * 3.6;
}

function fmtVS(vMs: number | null | undefined): { text: string; cls: string } {
  const v = toKmh(vMs);
  if (v == null || !Number.isFinite(v)) return { text: '--', cls: '' };
  const sign = v >= 0 ? '+' : '';
  const cls  = v >  0.4 ? 'pbb-val--up'
             : v < -0.4 ? 'pbb-val--down'
             : '';
  return { text: `${sign}${v.toFixed(1)}`, cls };
}

function fmtDist(m: number | null | undefined): string {
  if (m == null || !Number.isFinite(m)) return '--';
  if (m >= 1000) return `${(m / 1000).toFixed(2)} km`;
  return `${Math.round(m)} m`;
}


// ── Component ─────────────────────────────────────────────────────────────

const PFDBottomBar: React.FC<PFDBottomBarProps> = ({
  telemetry,
  normTelemetry,
}) => {
  const { velocity, navigation } = telemetry;

  // Prefer normTelemetry values (may be smoothed / EMA-filtered by TelemetryManager).
  // Fall back to raw FlightTelemetry values when normTelemetry is not yet available.
  const gs        = toKmh(normTelemetry?.groundSpeed   ?? velocity.groundSpeedMs);
  // const alt       = normTelemetry?.altitude      ?? altitude.altitudeAGLm; // kept for quick re-enable in footer
  const vsRaw     = normTelemetry?.verticalSpeed ?? velocity.verticalSpeedMs;
  const distWP    = normTelemetry?.distToWP      ?? null;
  const distHome  = normTelemetry?.distToMAV     ?? null;

  const { text: vsText, cls: vsCls } = fmtVS(vsRaw);
  const hasCoordinates =
    navigation.latitude != null &&
    navigation.longitude != null &&
    Number.isFinite(navigation.latitude) &&
    Number.isFinite(navigation.longitude);

  return (
    <div className="pfd-bottom-bar" role="region" aria-label="Flight telemetry data">
      <div className="pbb-grid">

        {/* ── Row 1: kinematic data ──────────────────────── */}

        {/* Ground speed */}
        <div className="pbb-cell" title="Ground speed">
          <span className="pbb-lbl">GS</span>
          <span className="pbb-val">{fmt(gs, 1)}</span>
          <span className="pbb-unit">km/h</span>
        </div>

        {/* Altitude AGL hidden temporarily in footer.
            Re-enable by uncommenting this block. */}
        {/*
          <div className="pbb-cell" title="Altitude above ground level">
            <span className="pbb-lbl">ALT AGL</span>
            <span className="pbb-val">{fmt(alt, 1)}</span>
            <span className="pbb-unit">m</span>
          </div>
        */}

        {/* Vertical speed */}
        <div className="pbb-cell" title="Vertical speed (positive = climb)">
          <span className="pbb-lbl">VS</span>
          <span className={`pbb-val ${vsCls}`}>{vsText}</span>
          <span className="pbb-unit">km/h</span>
        </div>

        {/* Heading */}
        <div className="pbb-cell" title="Magnetic heading">
          <span className="pbb-lbl">HDG</span>
          <span className="pbb-val">{fmt(navigation.headingDeg, 0)}</span>
          <span className="pbb-unit">°</span>
        </div>

        {/* ── Row 2: navigation data ─────────────────────── */}

        {/* Distance to waypoint */}
        <div className="pbb-cell" title="Distance to active waypoint">
          <span className="pbb-lbl">WP</span>
          <span className="pbb-val pbb-val--nav">{fmtDist(distWP)}</span>
        </div>

        {/* Distance to home */}
        <div className="pbb-cell" title="Distance to home position">
          <span className="pbb-lbl">HOME</span>
          <span className="pbb-val pbb-val--nav">{fmtDist(distHome)}</span>
        </div>

        {hasCoordinates ? (
          <CoordinateDisplay
            latitude={navigation.latitude}
            longitude={navigation.longitude}
            rowClassName="pbb-cell pbb-cell--coord"
            labelClassName="pbb-lbl"
            valueClassName="pbb-val pbb-val--coord"
          />
        ) : (
          <div className="pbb-cell pbb-cell--coord">
            <span className="pbb-lbl">COORDS</span>
            <span className="pbb-val pbb-val--coord">--</span>
          </div>
        )}

      </div>
    </div>
  );
};

export default PFDBottomBar;
