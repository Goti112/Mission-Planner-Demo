/**
 * FlightDisplayViewport.tsx
 *
 * ══════════════════════════════════════════════════════════════════════
 * FULL-SCREEN COCKPIT INSTRUMENT OVERLAY
 * ══════════════════════════════════════════════════════════════════════
 *
 * Transforms the PFD from a sidebar widget into a large standalone
 * cockpit display — inspired by Garmin G1000 / glass-cockpit avionics.
 *
 * Layout:
 *   ┌──────────────────────────────────────────────────────┐ ← fdv-chrome (42px)
 *   │  PFD · PRIMARY FLIGHT DISPLAY  │ GS │ ALT │ HDG │ x  │
 *   ├──────────────────────────────────────────────────────┤
 *   │                                                      │
 *   │          PrimaryFlightDisplay (fills stage)          │ ← fdv-stage (1fr)
 *   │                                                      │
 *   ├──────────────────────────────────────────────────────┤
 *   │ ROHU GCS  │  ROLL │ PITCH │  VS  │  AGL             │ ← fdv-ribbon (32px)
 *   └──────────────────────────────────────────────────────┘
 *
 * Overlay sits fixed between: navbar (52px top) and statusbar (36px bottom).
 * z-index: 900 — above map and sidebar, below modals.
 *
 * All telemetry is read from the existing FlightTelemetry object.
 * No new data sources — this is purely a visual architecture change.
 */

import React from 'react';
import { X } from 'lucide-react';

import PrimaryFlightDisplay from './PrimaryFlightDisplay';
import type { FlightTelemetry } from '../../telemetry';
import { ArmState } from '../../telemetry';
import type { SnapshotProvider } from '../hooks/useHUDLoop';
import { getPFDModeDisplayLabel } from '../core/flightModeDisplay';

import '../styles/hud-tokens.css';
import './FlightDisplayViewport.css';

// ── Props ─────────────────────────────────────────────────────────────────

export interface FlightDisplayViewportProps {
  /** Full normalized telemetry — drives all canvas instruments + chrome readouts. */
  telemetry: FlightTelemetry;
  /**
   * Direct TelemetryManager snapshot ref for zero-delay canvas rendering.
   * Passed straight through to PrimaryFlightDisplay's rAF loop.
   */
  snapshotProvider?: React.RefObject<SnapshotProvider | null>;
  /** Called when the user clicks the close / collapse button. */
  onClose: () => void;
}

// ── Helpers ───────────────────────────────────────────────────────────────

/** Format a heading value as a zero-padded 3-digit string (e.g. "045"). */
function fmtHdg(deg: number): string {
  return Math.round(deg).toString().padStart(3, '0');
}

/** Format a numeric value with fixed decimals, returning em-dash on null. */
function fmtNum(val: number | null | undefined, decimals: number): string {
  return val == null ? '—' : val.toFixed(decimals);
}

function toKmh(ms: number | null | undefined): number | null {
  if (ms == null || !Number.isFinite(ms)) return null;
  return ms * 3.6;
}

/** Battery percentage color — matches standard avionics conventions. */
function battColor(pct: number | null): string {
  if (pct == null) return 'rgba(150,180,210,0.6)';
  if (pct < 15) return '#ff4040';
  if (pct < 30) return '#ffaa20';
  return '#44cc88';
}

// ── Component ─────────────────────────────────────────────────────────────

const FlightDisplayViewport: React.FC<FlightDisplayViewportProps> = ({
  telemetry,
  snapshotProvider,
  onClose,
}) => {
  const { attitude, velocity, altitude, navigation, vehicleStatus, gpsStatus, battery } = telemetry;

  const isArmed    = vehicleStatus.armState === ArmState.ARMED;
  const modeLabel  = getPFDModeDisplayLabel(
    vehicleStatus.flightMode,
    vehicleStatus.flightModeLabel || vehicleStatus.flightMode || 'UNKNOWN',
  );
  const batt       = battery.remainingPercent;
  const gsKmh      = toKmh(velocity.groundSpeedMs);
  const iasKmh     = toKmh(velocity.airSpeedMs);
  const vsKmh      = toKmh(velocity.verticalSpeedMs);

  return (
    <div className="fdv-overlay" role="dialog" aria-label="Primary Flight Display — Full Screen">

      {/* ── Cockpit chrome header ──────────────────────────────────── */}
      <div className="fdv-chrome">

        {/* Left: PFD identifier */}
        <div className="fdv-chrome-left">
          <span className="fdv-chrome-title">PFD</span>
          <span className="fdv-chrome-sep">·</span>
          <span className="fdv-chrome-sub">Primary Flight Display</span>
        </div>

        {/* Center: quick-access telemetry readouts */}
        <div className="fdv-chrome-center">

          <div className="fdv-readout" title="Ground Speed">
            <span className="fdv-readout-label">GS</span>
            <span className="fdv-readout-value">{fmtNum(gsKmh, 1)}</span>
            <span className="fdv-readout-unit">km/h</span>
          </div>

          {velocity.airSpeedMs != null && (
            <div className="fdv-readout" title="Airspeed">
              <span className="fdv-readout-label">IAS</span>
              <span className="fdv-readout-value">{fmtNum(iasKmh, 1)}</span>
              <span className="fdv-readout-unit">km/h</span>
            </div>
          )}

          <div className="fdv-readout" title="Altitude MSL">
            <span className="fdv-readout-label">ALT</span>
            <span className="fdv-readout-value">{fmtNum(altitude.altitudeMSLm, 0)}</span>
            <span className="fdv-readout-unit">m</span>
          </div>

          <div className="fdv-readout" title="Magnetic Heading">
            <span className="fdv-readout-label">HDG</span>
            <span className="fdv-readout-value">{fmtHdg(navigation.headingDeg)}</span>
            <span className="fdv-readout-unit">°</span>
          </div>

          <div className="fdv-readout" title="Battery remaining">
            <span className="fdv-readout-label">BATT</span>
            <span
              className="fdv-readout-value"
              style={{ color: battColor(batt) }}
            >
              {fmtNum(batt, 0)}
            </span>
            <span className="fdv-readout-unit">%</span>
          </div>

        </div>

        {/* Right: status chips + close button */}
        <div className="fdv-chrome-right">

          <div
            className={`fdv-status-chip ${isArmed ? 'fdv-status-chip--armed' : 'fdv-status-chip--disarmed'}`}
            title="Arm state"
          >
            {isArmed ? 'ARMED' : 'DISARMED'}
          </div>

          <div className="fdv-status-chip fdv-status-chip--mode" title="Flight mode">
            {modeLabel}
          </div>

          <div className="fdv-status-chip" title="GPS satellites">
            {gpsStatus.satellitesVisible} SAT
          </div>

          <button
            className="fdv-close-btn"
            onClick={onClose}
            title="Collapse Flight Display"
            aria-label="Close full-screen flight display"
          >
            <X size={14} />
            <span>CLOSE</span>
          </button>

        </div>
      </div>

      {/* ── Main PFD stage ─────────────────────────────────────────── */}
      <div className="fdv-stage">
        <div className="fdv-pfd-wrap">
          <PrimaryFlightDisplay
            telemetry={telemetry}
            snapshotProvider={snapshotProvider}
            viewportMode
          />
        </div>
      </div>

      {/* ── Bottom data ribbon ─────────────────────────────────────── */}
      <div className="fdv-ribbon">

        <span className="fdv-ribbon-brand">ROHU GCS</span>

        <div className="fdv-ribbon-items">

          <span className="fdv-ribbon-item" title="Roll angle">
            <span className="fdv-ribbon-label">ROLL</span>
            <span className="fdv-ribbon-value">{fmtNum(attitude.rollDeg, 1)}°</span>
          </span>

          <span className="fdv-ribbon-item" title="Pitch angle">
            <span className="fdv-ribbon-label">PITCH</span>
            <span className="fdv-ribbon-value">{fmtNum(attitude.pitchDeg, 1)}°</span>
          </span>

          <span className="fdv-ribbon-item" title="Vertical speed">
            <span className="fdv-ribbon-label">VS</span>
            <span className="fdv-ribbon-value">
              {vsKmh != null && vsKmh >= 0 ? '+' : ''}{fmtNum(vsKmh, 1)} km/h
            </span>
          </span>

          <span className="fdv-ribbon-item" title="Altitude above ground level">
            <span className="fdv-ribbon-label">AGL</span>
            <span className="fdv-ribbon-value">
              {altitude.altitudeAGLm != null ? fmtNum(altitude.altitudeAGLm, 0) : '—'} m
            </span>
          </span>

          {/* Battery voltage hidden temporarily in bottom footer.
              Re-enable by uncommenting this block. */}
          {/*
            <span className="fdv-ribbon-item" title="Battery voltage">
              <span className="fdv-ribbon-label">VLT</span>
              <span className="fdv-ribbon-value">{fmtNum(battery.voltageV, 1)} V</span>
            </span>
          */}

          {navigation.courseOverGroundDeg != null && (
            <span className="fdv-ribbon-item" title="Course over ground">
              <span className="fdv-ribbon-label">COG</span>
              <span className="fdv-ribbon-value">{fmtHdg(navigation.courseOverGroundDeg)}°</span>
            </span>
          )}

        </div>

        <span className="fdv-ribbon-sig">v1.0</span>

      </div>
    </div>
  );
};

export default FlightDisplayViewport;
