/**
 * NavigationInfoBar.tsx
 *
 * Full-width bottom strip of the PFD showing all navigation telemetry
 * as human-readable text fields in a single horizontal bar.
 *
 * Displays (left → right):
 *   MODE · WP BRG · WP DIST · TRK ERR · HOME · GS · ALT AGL · VS · HDG · LAT/LON
 *
 * Each field appears ONCE here and nowhere else in the PFD.
 * Canvas instruments (tapes, VSI) provide the graphical scale; this bar
 * provides the precise numeric readout and mission navigation data.
 *
 * Bearing arrows rotate via CSS transform to indicate direction relative
 * to the vehicle's current heading.
 *
 * Visual conventions match real avionics:
 *   Magenta = active waypoint navigation data
 *   Green   = home data / on-track status
 *   Amber   = warnings, moderate track errors
 *   Red     = critical track deviation
 *   Cyan    = climb / positive vertical speed
 */

import React from 'react';
import type { FlightTelemetry, FlightDerivedData } from '../../telemetry';
import { getPFDModeDisplayLabel, getPFDModeDisplayKey } from '../core/flightModeDisplay';

// ── Props ─────────────────────────────────────────────────────────────────

interface NavigationInfoBarProps {
  telemetry: FlightTelemetry;
  derived: FlightDerivedData;
}

// ── Mode color mapping (matches WaypointDirector.ts conventions) ──────────

const MODE_COLORS: Record<string, string> = {
  AUTO:      '#ff3eb5',
  MISSION:   '#ff3eb5',
  GUIDED:    '#ff3eb5',
  RTL:       '#ff8c00',
  SMART_RTL: '#ff8c00',
  LOITER:    '#00d4ff',
  POSHOLD:   '#00d4ff',
  POSITION:  '#00d4ff',
  HOLD:      '#00d4ff',
  LAND:      '#ffcc00',
  TAKEOFF:   '#ffcc00',
};

const MODE_ABBR: Record<string, string> = {
  STABILIZE: 'STAB',
  ALT_HOLD:  'ALTH',
  SMART_RTL: 'SRTL',
  OFFBOARD:  'OFFB',
  AUTOTUNE:  'ATUN',
};

// ── Formatters ────────────────────────────────────────────────────────────

function fmt(v: number | null | undefined, dec: number): string {
  if (v == null || !Number.isFinite(v)) return '--';
  return v.toFixed(dec);
}

function toKmh(ms: number | null | undefined): number | null {
  if (ms == null || !Number.isFinite(ms)) return null;
  return ms * 3.6;
}

function fmtDist(m: number | null | undefined): string {
  if (m == null || !Number.isFinite(m)) return '--';
  if (m >= 1000) return `${(m / 1000).toFixed(2)}km`;
  return `${Math.round(m)}m`;
}


// ── Bearing arrow ─────────────────────────────────────────────────────────

/**
 * Bearing relative to vehicle heading, already normalized to [0, 360).
 * Returns a rotated Unicode arrow pointing in the relative direction.
 */
function BearingArrow({ relativeDeg }: { relativeDeg: number | null }): React.ReactElement {
  if (relativeDeg == null) return <span>–</span>;
  return (
    <span
      className="pfd-nav-arrow"
      style={{ transform: `rotate(${relativeDeg}deg)` }}
      aria-hidden="true"
    >
      ▲
    </span>
  );
}

// ── Track error ───────────────────────────────────────────────────────────

function computeTrkErr(cog: number | null, wpBrg: number | null): { text: string; cls: string } {
  if (cog == null || wpBrg == null) return { text: '--', cls: '' };
  // Signed angular error: positive = right of track, negative = left
  const err = ((cog - wpBrg) + 540) % 360 - 180;
  const abs = Math.abs(err);
  if (abs < 2) return { text: 'ON TRK', cls: 'pfd-nav-value--green' };
  const side = err > 0 ? 'R' : 'L';
  const cls = abs > 20
    ? 'pfd-nav-value--red'
    : abs > 8
      ? 'pfd-nav-value--amber'
      : 'pfd-nav-value--green';
  return { text: `${side} ${abs.toFixed(0)}°`, cls };
}

// ── Component ─────────────────────────────────────────────────────────────

const NavigationInfoBar: React.FC<NavigationInfoBarProps> = ({ telemetry, derived }) => {
  const { velocity, navigation, vehicleStatus } = telemetry;

  // ── Mode ────────────────────────────────────────────────────────────
  const rawMode  = getPFDModeDisplayKey(
    vehicleStatus.flightMode,
    vehicleStatus.flightModeLabel || vehicleStatus.flightMode,
  );
  const modeLabel = MODE_ABBR[rawMode]
    ?? getPFDModeDisplayLabel(
      vehicleStatus.flightMode,
      vehicleStatus.flightModeLabel || vehicleStatus.flightMode,
    );
  const modeColor = MODE_COLORS[rawMode] ?? '#778899';

  // ── Navigation data ──────────────────────────────────────────────────
  const hdg       = navigation.headingDeg;
  const cog       = navigation.courseOverGroundDeg;
  const wpBrg     = derived.bearingToWaypointDeg;
  const wpDist    = derived.distanceToWaypointM;
  const homeBrg   = derived.bearingToHomeDeg;
  const homeDist  = derived.distanceToHomeM;

  // Relative bearing = absolute bearing − current heading
  const wpRelBrg   = wpBrg != null ? ((wpBrg - hdg + 360) % 360) : null;
  const homeRelBrg = homeBrg != null ? ((homeBrg - hdg + 360) % 360) : null;

  const { text: trkText, cls: trkCls } = computeTrkErr(cog, wpBrg);

  // ── Kinematic data ───────────────────────────────────────────────────
  const gs  = toKmh(velocity.groundSpeedMs);
  // const alt = altitude.altitudeAGLm; // kept for quick re-enable in footer
  const vs  = toKmh(velocity.verticalSpeedMs);

  const vsSign = vs != null && vs > 0.4 ? '+' : '';
  const vsCls  = vs != null && vs > 0.4 ? 'pfd-nav-value--up' : vs != null && vs < -0.4 ? 'pfd-nav-value--down' : '';

  // ── Coordinates ──────────────────────────────────────────────────────
  // const lat = navigation.latitude; // kept for quick re-enable in footer
  // const lon = navigation.longitude; // kept for quick re-enable in footer

  return (
    <div className="pfd-cell pfd-cell--navinfo">
      <div className="pfd-nav-bar" role="region" aria-label="Navigation telemetry strip">

        {/* 1. Flight mode badge */}
        <div className="pfd-nav-mode">
          <span className="pfd-nav-label">MODE</span>
          <span
            className="pfd-nav-mode-badge"
            style={{ color: modeColor, borderColor: modeColor }}
          >
            {modeLabel}
          </span>
        </div>

        {/* 2. Waypoint bearing */}
        <div className="pfd-nav-field">
          <span className="pfd-nav-label">WP BRG</span>
          <span className="pfd-nav-value pfd-nav-value--magenta">
            <BearingArrow relativeDeg={wpRelBrg} />
            {fmt(wpBrg, 0)}°
          </span>
        </div>

        {/* 3. Waypoint distance */}
        <div className="pfd-nav-field">
          <span className="pfd-nav-label">WP DIST</span>
          <span className="pfd-nav-value pfd-nav-value--magenta">
            {fmtDist(wpDist)}
          </span>
        </div>

        {/* 4. Track error */}
        <div className="pfd-nav-field">
          <span className="pfd-nav-label">TRK ERR</span>
          <span className={`pfd-nav-value ${trkCls}`}>{trkText}</span>
        </div>

        {/* 5. Home bearing + distance */}
        <div className="pfd-nav-field">
          <span className="pfd-nav-label">HOME</span>
          <span className="pfd-nav-value pfd-nav-value--green">
            <BearingArrow relativeDeg={homeRelBrg} />
            {fmtDist(homeDist)}
          </span>
        </div>

        {/* 6. Ground speed */}
        <div className="pfd-nav-field">
          <span className="pfd-nav-label">GS</span>
          <span className="pfd-nav-value">{fmt(gs, 1)}</span>
          <span className="pfd-nav-unit">km/h</span>
        </div>

        {/* 7. Altitude AGL hidden temporarily in footer.
            Re-enable by uncommenting this block. */}
        {/*
          <div className="pfd-nav-field">
            <span className="pfd-nav-label">ALT AGL</span>
            <span className="pfd-nav-value">{fmt(alt, 1)}</span>
            <span className="pfd-nav-unit">m</span>
          </div>
        */}

        {/* 8. Vertical speed */}
        <div className="pfd-nav-field">
          <span className="pfd-nav-label">VS</span>
          <span className={`pfd-nav-value ${vsCls}`}>
            {vsSign}{fmt(vs, 1)}
          </span>
          <span className="pfd-nav-unit">km/h</span>
        </div>

        {/* 9. Heading */}
        <div className="pfd-nav-field">
          <span className="pfd-nav-label">HDG</span>
          <span className="pfd-nav-value">{fmt(hdg, 0)}°</span>
        </div>

        {/* 10. Coordinates (two stacked rows) */}
        <div className="pfd-nav-coord">
          {/* Latitude hidden temporarily in footer.
              Re-enable by uncommenting this block. */}
          {/*
            <div className="pfd-nav-coord-row">
              <span className="pfd-nav-label">LAT</span>
              <span className="pfd-nav-coord-val">{fmtCoord(lat)}</span>
            </div>
          */}
          {/* Longitude hidden temporarily in footer.
              Re-enable by uncommenting this block. */}
          {/*
            <div className="pfd-nav-coord-row">
              <span className="pfd-nav-label">LON</span>
              <span className="pfd-nav-coord-val">{fmtCoord(lon)}</span>
            </div>
          */}
        </div>

      </div>
    </div>
  );
};

export default NavigationInfoBar;
