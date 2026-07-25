/**
 * WaypointDirector.ts
 *
 * Advanced avionics navigation strip — rendered at the bottom of the PFD.
 *
 * Layout (5 equal columns):
 *
 *   ┌──────────┬──────────────┬──────────┬──────────┬──────────────┐
 *   │  MODE    │   WP BRG     │  WP DIST │  TRK ERR │    HOME      │
 *   │ MISSION  │   ↗  247°   │  523 m   │  L 8°    │  ↗  1.2km   │
 *   └──────────┴──────────────┴──────────┴──────────┴──────────────┘
 *
 * Columns:
 *   1. MODE     — flight mode badge with color coding (MISSION=magenta, RTL=orange, ...)
 *   2. WP BRG   — rotating arrow toward active waypoint (relative to heading) + absolute degrees
 *   3. WP DIST  — distance to active waypoint in m / km (magenta)
 *   4. TRK ERR  — track error: angular deviation of COG from bearing to WP
 *                  "ON TRK" (green) | "L Xdeg" (left, yellow/red) | "R Xdeg" (right)
 *   5. HOME     — rotating arrow toward home base + distance, always visible
 *
 * Home bearing/distance are provided via setNavContext() from FlightHUD's derived data.
 * COG is computed from NED velocity components as fallback when courseOverGroundDeg is null.
 *
 * Visual conventions match real avionics:
 *   - Magenta (#ff3eb5) for active waypoint navigation data
 *   - Green  (#00cc66) for home data and "on-track" status
 *   - Orange (#ff8c00) for RTL, warning-level track errors
 *
 * Inputs:  FlightTelemetry (navigation + velocity + vehicleStatus)
 *          NavContext      (home bearing/distance via setNavContext)
 * Render:  Canvas 2D — called every frame by the global rAF loop
 * Base:    CanvasInstrument (DPI-aware resize, theme, clear)
 */

import { CanvasInstrument } from '../core/CanvasInstrument';
import type { FlightTelemetry } from '../../telemetry';
import type { HUDTheme } from '../core/HUDTheme';
import { getPFDModeDisplayLabel } from '../core/flightModeDisplay';

// ── Color constants ───────────────────────────────────────────────────
const NAV_MAGENTA = '#ff3eb5';   // avionics magenta — active nav data
const HOME_GREEN  = '#00cc66';   // home indicator
const WARN_AMBER  = '#ff8c00';   // RTL / significant track deviation
const CRIT_RED    = '#ff2d2d';   // severe track deviation
const ARMED_DOT   = '#00ff88';   // bright green armed indicator

// ── Mode display config ───────────────────────────────────────────────
const MODE_COLORS: Record<string, string> = {
  // Active navigation — magenta
  'AUTO':      NAV_MAGENTA,
  'MISSION':   NAV_MAGENTA,
  'GUIDED':    NAV_MAGENTA,
  // Return to launch — warning orange
  'RTL':       WARN_AMBER,
  'SMART_RTL': WARN_AMBER,
  // Position hold variants — cyan
  'LOITER':    '#00d4ff',
  'POSHOLD':   '#00d4ff',
  'POSITION':  '#00d4ff',
  'HOLD':      '#00d4ff',
  // Landing phases — yellow
  'LAND':      '#ffcc00',
  'TAKEOFF':   '#ffcc00',
  // Manual / attitude — dim
  'STABILIZE': '#778899',
  'ACRO':      '#778899',
  'MANUAL':    '#778899',
};

// Short abbreviations for mode labels that are too long (> 6 chars)
const MODE_ABBR: Record<string, string> = {
  'STABILIZE':    'STAB',
  'ALT_HOLD':     'ALTH',
  'ALTITUDE HOLD':'ALTH',
  'SMART_RTL':    'SRTL',
  'POSITION':     'POS',
  'POSHOLD':      'POSH',
  'AUTOTUNE':     'ATUN',
  'OFFBOARD':     'OFFB',
};

// ── Navigation context (slowly-changing, set from React effects) ───────
export interface NavContext {
  /** Bearing from aircraft to home base. Degrees [0, 360). Null if unknown. */
  homeBearingDeg: number | null;
  /** Distance from aircraft to home base. Metres. Null if unknown. */
  homeDistanceM:  number | null;
  /** Bearing from aircraft to active waypoint. Degrees [0, 360). Null if no active waypoint. */
  wpBearingDeg:   number | null;
  /** Distance from aircraft to active waypoint. Metres. Null if no active waypoint. */
  wpDistanceM:    number | null;
}

// ── Constants ─────────────────────────────────────────────────────────
const DEG_TO_RAD = Math.PI / 180;

export class WaypointDirector extends CanvasInstrument {
  // ── Cached layout — rebuilt in resize(), read in draw() ─────────────
  private _d1X       = 0;   // divider x between col 1 (MODE) and col 2 (BRG)
  private _d2X       = 0;   // divider x between col 2 (BRG)  and col 3 (DIST)
  private _d3X       = 0;   // divider x between col 3 (DIST) and col 4 (XTE)
  private _d4X       = 0;   // divider x between col 4 (XTE)  and col 5 (HOME)
  private _labelY    = 0;   // y baseline for column label text (top row)
  private _valueY    = 0;   // y baseline for column value text (bottom row)
  private _labelFont = '';  // pre-built font string for labels
  private _valueFont = '';  // pre-built font string for values
  private _modeFont  = '';  // slightly larger bold font for mode badge text
  private _arrowR    = 0;   // radius of bearing/home arrow triangle

  // ── External nav context (home data doesn't come from FlightTelemetry) ─
  private _navCtx: NavContext = { homeBearingDeg: null, homeDistanceM: null, wpBearingDeg: null, wpDistanceM: null };

  constructor(canvas: HTMLCanvasElement, theme?: HUDTheme) {
    super(canvas, theme);
  }

  /**
   * Update home bearing and distance.
   * Called from FlightHUD's derived-data useEffect whenever telemetry changes.
   * Safe to call from React render threads — only read in draw() (same JS thread).
   */
  setNavContext(ctx: NavContext): void {
    this._navCtx = ctx;
  }

  override resize(width: number, height: number): void {
    super.resize(width, height);
    const w = this.width;
    const h = this.height;

    // 5 equal columns at 20% each
    this._d1X = w * 0.20;
    this._d2X = w * 0.40;
    this._d3X = w * 0.60;
    this._d4X = w * 0.80;

    this._labelY = h * 0.35;
    this._valueY = h * 0.84;

    const labelSz = Math.max(7.7, Math.round(h * 0.242));
    const valueSz = Math.max(9.9, Math.round(h * 0.396));
    const modeSz  = Math.max(8.8, Math.round(h * 0.33));

    this._labelFont = `${labelSz}px ${this.theme.fontHUD}`;
    this._valueFont = `bold ${valueSz}px ${this.theme.fontMono}`;
    this._modeFont  = `bold ${modeSz}px ${this.theme.fontHUD}`;
    this._arrowR    = Math.max(5, Math.round(h * 0.26));
  }

  override draw(data: Readonly<FlightTelemetry>): void {
    const { ctx, theme } = this;
    const w = this.width;
    const h = this.height;

    if (w === 0 || h === 0) return;
    this.clear();

    // ── Background ──────────────────────────────────────────────────
    ctx.fillStyle = '#08111c';
    ctx.fillRect(0, 0, w, h);

    // Top separator line
    ctx.strokeStyle = theme.tapeBorder;
    ctx.lineWidth   = 1;
    ctx.beginPath();
    ctx.moveTo(0, 0.5);
    ctx.lineTo(w, 0.5);
    ctx.stroke();

    // Vertical dividers (dim, thin)
    ctx.lineWidth = 0.5;
    for (const x of [this._d1X, this._d2X, this._d3X, this._d4X]) {
      ctx.beginPath();
      ctx.moveTo(x, 4);
      ctx.lineTo(x, h - 4);
      ctx.stroke();
    }

    ctx.textBaseline = 'alphabetic';

    // Extract nav data used by multiple sections
    // WP bearing/distance come from NavContext (computed by DerivedDataEngine from activeWaypoint)
    // rather than FlightTelemetry.navigation (which is only set from real MAVLink data).
    const bearing  = this._navCtx.wpBearingDeg  ?? data.navigation.bearingToWaypointDeg;
    const distance = this._navCtx.wpDistanceM   ?? data.navigation.distanceToWaypointM;
    const heading  = data.navigation.headingDeg;
    const cog      = this._getCOG(data);

    const d1 = this._d1X;
    const d2 = this._d2X;
    const d3 = this._d3X;
    const d4 = this._d4X;

    // ── Section 1 — Flight Mode ──────────────────────────────────────
    this._drawModeCell(data, 0, d1, h);

    // ── Section 2 — Waypoint Bearing ────────────────────────────────
    const sec2L = d1;
    const sec2R = d2;
    this._drawLabel('WP BRG', (sec2L + sec2R) / 2);
    this._drawBearingCell(sec2L, sec2R, bearing, heading, NAV_MAGENTA);

    // ── Section 3 — Waypoint Distance ────────────────────────────────
    const sec3Cx = (d2 + d3) / 2;
    this._drawLabel('WP DIST', sec3Cx);
    if (distance !== null && Number.isFinite(distance)) {
      const distStr = distance >= 1000
        ? `${(distance / 1000).toFixed(2)}km`
        : `${Math.round(distance)}m`;
      this._drawValue(distStr, sec3Cx, NAV_MAGENTA);
    } else {
      this._drawValue('--', sec3Cx, theme.textDim);
    }

    // ── Section 4 — Track Error ──────────────────────────────────────
    const sec4Cx = (d3 + d4) / 2;
    this._drawLabel('TRK ERR', sec4Cx);
    this._drawTrackError(sec4Cx, cog, bearing);

    // ── Section 5 — Home Direction + Distance ────────────────────────
    const sec5L = d4;
    const sec5R = w;
    this._drawLabel('HOME', (sec5L + sec5R) / 2);
    this._drawBearingCell(sec5L, sec5R, this._navCtx.homeBearingDeg, heading, HOME_GREEN,
                          this._navCtx.homeDistanceM);
  }

  // ── Cell renderers ────────────────────────────────────────────────

  /**
   * Draw the MODE cell: colored accent bar, tinted background, badge text
   * and a small armed indicator dot.
   */
  private _drawModeCell(
    data: Readonly<FlightTelemetry>,
    x0: number, x1: number, h: number,
  ): void {
    const { ctx, theme } = this;
    const modeLabel = getPFDModeDisplayLabel(
      data.vehicleStatus.flightMode,
      data.vehicleStatus.flightModeLabel ?? 'UNKNOWN',
    );
    const isArmed   = data.vehicleStatus.armState === 'ARMED';
    const color     = this._modeColor(modeLabel);
    const abbr      = this._modeAbbr(modeLabel);
    const cx        = (x0 + x1) / 2;

    // Tinted background
    ctx.fillStyle = color + '22'; // ~13% opacity
    ctx.fillRect(x0, 2, x1 - x0, h - 4);

    // Left accent bar
    ctx.fillStyle = color;
    ctx.fillRect(x0, 2, 2, h - 4);

    // "MODE" label
    ctx.fillStyle   = theme.textSecondary;
    ctx.font        = this._labelFont;
    ctx.textAlign   = 'center';
    ctx.fillText('MODE', cx, this._labelY);

    // Mode abbreviation as main value
    ctx.fillStyle = color;
    ctx.font      = this._modeFont;
    ctx.textAlign = 'center';
    ctx.fillText(abbr, cx, this._valueY);

    // Armed indicator dot (top-right corner of cell)
    if (isArmed) {
      ctx.fillStyle = ARMED_DOT;
      ctx.beginPath();
      ctx.arc(x1 - 6, h * 0.28, 3.5, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  /**
   * Draw an arrow cell: rotating directional arrow (relative to heading) +
   * absolute bearing degrees.  Optionally appends a distance string below.
   *
   * The arrow is drawn on the left half of the cell, the text on the right.
   * When bearing is null the cell shows '--'.
   *
   * @param x0       Left edge of cell (px)
   * @param x1       Right edge of cell (px)
   * @param bearing  Absolute bearing in degrees [0, 360). Null if unknown.
   * @param heading  Aircraft heading in degrees. Null treated as 0.
   * @param color    Stroke / fill color for arrow and text.
   * @param distM    Optional distance (m) to append below the arrow text.
   */
  private _drawBearingCell(
    x0: number, x1: number,
    bearing: number | null,
    heading: number | null,
    color: string,
    distM?: number | null,
  ): void {
    const { ctx, theme } = this;

    if (bearing === null || !Number.isFinite(bearing)) {
      this._drawValue('--', (x0 + x1) / 2, theme.textDim);
      return;
    }

    const hdg      = heading ?? 0;
    const relDeg   = ((bearing - hdg) + 720) % 360;  // relative bearing [0, 360)
    const relRad   = relDeg * DEG_TO_RAD;
    const ar       = this._arrowR;
    const cellW    = x1 - x0;

    // Arrow center: left 38% of the cell, vertically at value row
    const arrowCx = x0 + cellW * 0.30;
    const arrowCy = this._valueY - ar * 0.55;

    // Filled rotating arrow (chevron / arrowhead)
    ctx.save();
    ctx.translate(arrowCx, arrowCy);
    ctx.rotate(relRad);
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(0,          -ar);           // tip (pointing up = 0°)
    ctx.lineTo(ar * 0.40,  ar * 0.50);    // bottom-right
    ctx.lineTo(0,           ar * 0.10);   // inner notch
    ctx.lineTo(-ar * 0.40, ar * 0.50);   // bottom-left
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    // Absolute bearing degrees (right of arrow)
    const brgNorm  = Math.round(((bearing % 360) + 360) % 360);
    const brgStr   = `${brgNorm.toString().padStart(3, '0')}°`;
    const textX    = arrowCx + ar + 3;

    ctx.fillStyle   = color;
    ctx.font        = this._valueFont;
    ctx.textAlign   = 'left';
    ctx.fillText(brgStr, textX, this._valueY);

    // Optional distance (e.g. for HOME cell)
    if (distM !== null && distM !== undefined && Number.isFinite(distM)) {
      const dStr = distM >= 1000
        ? `${(distM / 1000).toFixed(1)}km`
        : `${Math.round(distM)}m`;
      // Show distance right-aligned in this column (overlay the rightmost area)
      ctx.fillStyle  = color + 'cc'; // slight transparency
      ctx.font       = this._labelFont;
      ctx.textAlign  = 'right';
      ctx.fillText(dStr, x1 - 3, this._valueY);
    }
  }

  /**
   * Draw the track-error cell.
   *
   * Track error = COG − WP_bearing (normalised to −180 … +180).
   *   > 0  → aircraft flying to the RIGHT of intended track (show "R Xdeg")
   *   < 0  → aircraft flying to the LEFT  of intended track (show "L Xdeg")
   *   ≈ 0  → on track (show "ON TRK" in green)
   *
   * Colors:
   *   |err| < 5°   → green  (on track)
   *   |err| < 15°  → amber  (moderate deviation)
   *   |err| ≥ 15°  → red    (significant deviation)
   */
  private _drawTrackError(cx: number, cog: number | null, wpBearing: number | null): void {
    const { ctx, theme } = this;

    if (cog === null || wpBearing === null) {
      this._drawValue('--', cx, theme.textDim);
      return;
    }

    // Normalise to −180 … +180
    const err    = ((cog - wpBearing) + 540) % 360 - 180;
    const absErr = Math.abs(err);

    if (absErr < 5) {
      // On track — green checkmark text
      ctx.fillStyle   = HOME_GREEN;
      ctx.font        = this._valueFont;
      ctx.textAlign   = 'center';
      ctx.fillText('ON TRK', cx, this._valueY);
      return;
    }

    const color = absErr >= 15 ? CRIT_RED : WARN_AMBER;
    // err > 0 → actual track rotated clockwise from WP bearing → drifting RIGHT
    // err < 0 → actual track rotated counter-clockwise        → drifting LEFT
    const side  = err > 0 ? 'R' : 'L';

    ctx.fillStyle   = color;
    ctx.font        = this._valueFont;
    ctx.textAlign   = 'center';
    ctx.fillText(`${side} ${Math.round(absErr)}°`, cx, this._valueY);
  }

  // ── Utilities ─────────────────────────────────────────────────────

  /**
   * Compute Course Over Ground from FlightTelemetry.
   * Uses stored courseOverGroundDeg if available, otherwise derives from
   * NED velocity components (more reliable at low update rates).
   * Returns null when ground speed is too low for reliable COG.
   */
  private _getCOG(data: Readonly<FlightTelemetry>): number | null {
    // Prefer the stored COG if the normaliser already computed it
    if (data.navigation.courseOverGroundDeg !== null &&
        Number.isFinite(data.navigation.courseOverGroundDeg)) {
      return data.navigation.courseOverGroundDeg;
    }
    // Fallback: compute from NED velocity (requires meaningful ground speed)
    const { groundSpeedMs, velNorthMs, velEastMs } = data.velocity;
    if (groundSpeedMs < 0.5) return null;
    const cogRad = Math.atan2(velEastMs, velNorthMs);
    return ((cogRad * 180 / Math.PI) + 360) % 360;
  }

  /** Return the avionics display color for a given flight mode label. */
  private _modeColor(label: string): string {
    return MODE_COLORS[label.toUpperCase()] ?? '#aaaaaa';
  }

  /** Return a short (≤ 6 char) abbreviation of the flight mode label. */
  private _modeAbbr(label: string): string {
    const up = label.toUpperCase();
    if (up in MODE_ABBR) return MODE_ABBR[up];
    return label.length > 6 ? label.slice(0, 6).toUpperCase() : label.toUpperCase();
  }

  private _drawLabel(text: string, cx: number): void {
    this.ctx.fillStyle   = this.theme.textSecondary;
    this.ctx.font        = this._labelFont;
    this.ctx.textAlign   = 'center';
    this.ctx.fillText(text, cx, this._labelY);
  }

  private _drawValue(text: string, cx: number, color: string): void {
    this.ctx.fillStyle   = color;
    this.ctx.font        = this._valueFont;
    this.ctx.textAlign   = 'center';
    this.ctx.fillText(text, cx, this._valueY);
  }
}
