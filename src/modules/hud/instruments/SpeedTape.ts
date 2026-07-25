/**
 * SpeedTape.ts — Vertical Speed Tape (left side of PFD)
 *
 * ════════════════════════════════════════════════════════════════════════
 * DESIGN REFERENCE: Garmin G1000 / Dynon SkyView airspeed indicator
 * ════════════════════════════════════════════════════════════════════════
 *
 * Layout (instrument is placed to the LEFT of the Artificial Horizon):
 *   ┌───────────────┐
 *   │  35 ─────────┤  ← tick on right edge, label on left
 *   │  30 ─────────┤
 *   │  │  ██████ │ │  ← center readout box (yellow bug)
 *   │  25 ─────────┤
 *   │  20 ─────────┤
 *   └───────────────┘
 *
 * Tape scroll math:
 *   pxPerUnit = height / (2 × VISIBLE_RANGE)
 *   y(value) = centerY − (value − currentSpeed) × pxPerUnit
 *   Higher speeds → smaller y → higher on screen ✓
 *
 * All dimensions are proportional to `height`.
 * No hard-coded pixel constants.
 *
 * Inputs:  FlightTelemetry (reads velocity.groundSpeedMs, velocity.airSpeedMs)
 * Render:  Canvas 2D — called every frame by the global rAF loop
 * Base:    CanvasInstrument (DPI-aware resize, theme, clear)
 *
 * Extensiones futuras:
 *   - Vne / Vno / Vstall coloured bands (comme Garmin)
 *   - Speed bug (target airspeed)
 *   - IAS vs TAS display
 */

import { CanvasInstrument } from '../core/CanvasInstrument';
import type { FlightTelemetry } from '../../telemetry';
import type { HUDTheme } from '../core/HUDTheme';

// ── Configuration ────────────────────────────────────────────────────
/** m/s visible above and below the current speed in the tape window. */
const VISIBLE_RANGE = 30;
/** Minor tick interval (m/s). */
const MINOR_STEP    = 5;
/** Major tick interval (m/s) — longer tick + numeric label. */
const MAJOR_STEP    = 10;
/** Maximum speed the tape can display (clamp for extreme values). */
const MAX_SPEED     = 120;
/** Unit conversion for display. */
const MPS_TO_KMH    = 3.6;
/** Display range in km/h (same physical range as VISIBLE_RANGE in m/s). */
const VISIBLE_RANGE_KMH = VISIBLE_RANGE * MPS_TO_KMH;
/** Minor tick interval in km/h. */
const MINOR_STEP_KMH = MINOR_STEP * MPS_TO_KMH;
/** Major tick interval in km/h. */
const MAJOR_STEP_KMH = MAJOR_STEP * MPS_TO_KMH;
/** Maximum displayed speed in km/h. */
const MAX_SPEED_KMH = MAX_SPEED * MPS_TO_KMH;

// ── Geometry helpers ─────────────────────────────────────────────────
/** Fraction of width used by the tick area (right side). */
const TICK_AREA_FRAC = 0.55;
/** Fraction of width used by the readout box. */
const BOX_FRAC       = 0.98;
/** Readout box half-height as fraction of height. */
const BOX_HALF_FRAC  = 0.065;
/** Trend vector look-ahead in seconds. */
const TREND_SECONDS  = 6;

export class SpeedTape extends CanvasInstrument {
  // ── Acceleration estimator (stateful, updated per frame) ─────────────
  private _prevSpeed = 0;
  private _prevTime  = 0;
  private _accelMs2  = 0;

  // ── Cached layout constants (computed once in resize, read per frame) ───
  //
  // RULE: If a value depends only on width/height (not on live telemetry),
  //       it belongs here, not in draw().
  //
  private _cy           = 0;   // vertical centre
  private _pxPerUnit    = 0;   // height / (2 × VISIBLE_RANGE)
  private _tickAreaX    = 0;   // left edge of tick column
  private _boxHalfH     = 0;   // readout box half-height
  private _boxW         = 0;   // readout box width
  private _boxX         = 0;   // readout box left edge (= width - boxW)
  private _notchW       = 0;   // readout box notch width
  private _tickMajorW   = 0;   // major tick length
  private _tickMinorW   = 0;   // minor tick length
  private _lineWMajor   = 0;   // major tick stroke width
  private _lineWMinor   = 0;   // minor tick stroke width
  private _lineWTrend   = 0;   // trend vector stroke width
  private _lineWIAS     = 0;   // IAS marker stroke width
  private _labelX       = 0;   // X position of tick labels (right-aligned)
  private _labelGapX    = 0;   // horizontal gap label → IAS text
  private _readoutCx    = 0;   // readout box text centre X
  // Font strings — pre-built so no template literal runs inside draw().
  private _fontStr      = '';  // tick label font
  private _smallFontStr = '';  // IAS / footer font
  private _footerFontStr = ''; // footer label font (extra legible)
  private _readoutFontStr = ''; // readout box value font

  constructor(canvas: HTMLCanvasElement, theme?: HUDTheme) {
    super(canvas, theme);
  }

  // ╔══════════════════════════════════════════════════════════
  //  RESIZE — compute every proportion from new canvas dimensions.
  //  Called by ResizeObserver; never by draw().
  // ╔══════════════════════════════════════════════════════════

  override resize(width: number, height: number): void {
    super.resize(width, height);
    const w = this.width;
    const h = this.height;

    this._cy         = h / 2;
    this._pxPerUnit  = h / (2 * VISIBLE_RANGE_KMH);
    this._tickAreaX  = w * (1 - TICK_AREA_FRAC);
    this._boxHalfH   = h * BOX_HALF_FRAC;
    this._boxW       = w * BOX_FRAC;
    this._boxX       = w - this._boxW;
    this._notchW     = w * 0.06;
    this._tickMajorW = w * TICK_AREA_FRAC * 0.55;
    this._tickMinorW = w * TICK_AREA_FRAC * 0.28;
    this._lineWMajor = Math.max(1.5, h * 0.003);
    this._lineWMinor = Math.max(0.8, h * 0.002);
    this._lineWTrend = Math.max(2,   h * 0.004);
    this._lineWIAS   = Math.max(1.5, h * 0.003);
    this._labelX     = w - this._tickMajorW - h * 0.012;
    this._labelGapX  = this._tickAreaX - h * 0.008;
    this._readoutCx  = this._boxX + (w - this._notchW - this._boxX) / 2;

    // Build font strings once (no template literals in draw())
    const fontSize   = Math.max(9.9,  Math.round(h * 0.0385));
    const sSize      = Math.max(8.8,  Math.round(h * 0.0297));
    const footerSize = Math.max(13.2, Math.round(h * 0.0462));
    const readoutSz  = Math.round(fontSize * 1.4);
    this._fontStr      = `${fontSize}px ${this.theme.fontMono}`;
    this._smallFontStr = `${sSize}px ${this.theme.fontMono}`;
    this._footerFontStr = `bold ${footerSize}px ${this.theme.fontMono}`;
    this._readoutFontStr = `bold ${readoutSz}px ${this.theme.fontMono}`;
  }

  draw(data: Readonly<FlightTelemetry>): void {
    const { groundSpeedMs, airSpeedMs } = data.velocity;
    const groundSpeedKmh = groundSpeedMs * MPS_TO_KMH;
    const airSpeedKmh = airSpeedMs !== null ? airSpeedMs * MPS_TO_KMH : null;
    const { ctx, theme } = this;

    if (this.width === 0 || this.height === 0) return;
    this.clear();

    // All layout values read from cached fields (computed in resize()).
    // Zero arithmetic operations, zero allocations here.
    const cy         = this._cy;
    const pxPerUnit  = this._pxPerUnit;
    const boxHalfH   = this._boxHalfH;
    const tickMajorW = this._tickMajorW;
    const tickMinorW = this._tickMinorW;
    const w          = this.width;
    const h          = this.height;

    this._updateAccel(groundSpeedKmh);

    // ── 1. Background — frosted glass ──────────────────────────────
    // Translucent so the panel reads as a floating data overlay, not a wall.
    const bg = ctx.createLinearGradient(0, 0, w, 0);
    bg.addColorStop(0,    'rgba(6, 12, 24, 0.45)');
    bg.addColorStop(0.55, 'rgba(6, 12, 24, 0.28)');
    bg.addColorStop(1,    'rgba(4,  8, 18, 0.16)');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);
    // Right edge — 1 px cyan glow beacon
    ctx.save();
    ctx.strokeStyle = 'rgba(40, 140, 255, 0.50)';
    ctx.lineWidth   = 1;
    ctx.shadowColor = 'rgba(30, 120, 255, 0.70)';
    ctx.shadowBlur  = 10;
    ctx.beginPath();
    ctx.moveTo(w - 0.5, 0);
    ctx.lineTo(w - 0.5, h);
    ctx.stroke();
    ctx.restore();

    // ── 2. Graduated tape ──────────────────────────────────────────
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, w, cy - boxHalfH);
    ctx.rect(0, cy + boxHalfH, w, h - cy - boxHalfH);
    ctx.clip();

    const minVisible = Math.max(0, groundSpeedKmh - VISIBLE_RANGE_KMH - MAJOR_STEP_KMH);
    const maxVisible = groundSpeedKmh + VISIBLE_RANGE_KMH + MAJOR_STEP_KMH;
    const firstTick  = Math.floor(minVisible / MINOR_STEP_KMH) * MINOR_STEP_KMH;
    const lastTick   = Math.ceil(maxVisible  / MINOR_STEP_KMH) * MINOR_STEP_KMH;

    for (let spd = firstTick; spd <= lastTick; spd += MINOR_STEP_KMH) {
      if (spd < 0) continue;
      const y = cy - (spd - groundSpeedKmh) * pxPerUnit;
      if (y < -2 || y > h + 2) continue;

      const majorRatio = spd / MAJOR_STEP_KMH;
      const isMajor = Math.abs(majorRatio - Math.round(majorRatio)) < 1e-6;
      ctx.strokeStyle = isMajor ? theme.tapeMajorTick : theme.tapeMinorTick;
      ctx.lineWidth   = isMajor ? this._lineWMajor : this._lineWMinor;
      ctx.beginPath();
      ctx.moveTo(w, y);
      ctx.lineTo(w - (isMajor ? tickMajorW : tickMinorW), y);
      ctx.stroke();

      if (isMajor) {
        ctx.fillStyle    = theme.tapeText;
        ctx.font         = this._fontStr;      // pre-built in resize() — no GC
        ctx.textAlign    = 'right';
        ctx.textBaseline = 'middle';
        ctx.shadowColor  = 'rgba(0,0,0,0.60)';
        ctx.shadowBlur   = 4;
        ctx.fillText(String(Math.round(spd)), this._labelX, y);
        ctx.shadowColor  = 'transparent';
        ctx.shadowBlur   = 0;
      }
    }

    ctx.restore();

    // ── 3. IAS marker ──────────────────────────────────────────────
    if (airSpeedKmh !== null) {
      const iasY = cy - (airSpeedKmh - groundSpeedKmh) * pxPerUnit;
      if ((iasY > cy + boxHalfH || iasY < cy - boxHalfH) && iasY >= 0 && iasY <= h) {
        ctx.strokeStyle = theme.accent;
        ctx.lineWidth   = this._lineWIAS;
        ctx.beginPath();
        ctx.moveTo(this._tickAreaX, iasY);
        ctx.lineTo(w, iasY);
        ctx.stroke();
        ctx.fillStyle    = theme.accent;
        ctx.font         = this._smallFontStr;
        ctx.textAlign    = 'right';
        ctx.textBaseline = 'middle';
        ctx.fillText('IAS', this._labelGapX, iasY);
      }
    }

    // ── 4. Trend vector ────────────────────────────────────────────
    const trendDelta = this._accelMs2 * TREND_SECONDS;
    if (Math.abs(trendDelta) > 0.3) {
      const trendPx = trendDelta * pxPerUnit;
      const trendX  = w - tickMajorW * 0.5;
      const trendY1 = Math.max(boxHalfH, Math.min(h - boxHalfH, cy - trendPx));
      ctx.lineCap     = 'round';
      // Glow pass first
      ctx.strokeStyle = 'rgba(255, 200, 32, 0.22)';
      ctx.lineWidth   = this._lineWTrend * 3;
      ctx.beginPath();
      ctx.moveTo(trendX, cy);
      ctx.lineTo(trendX, trendY1);
      ctx.stroke();
      // Solid line on top
      ctx.strokeStyle = theme.tapeCenterBug;
      ctx.lineWidth   = this._lineWTrend;
      ctx.beginPath();
      ctx.moveTo(trendX, cy);
      ctx.lineTo(trendX, trendY1);
      ctx.stroke();
      ctx.lineCap = 'butt';
    }

    // ── 5. Center readout box ──────────────────────────────────────
    const primarySpeed = (airSpeedKmh !== null && airSpeedKmh > 0) ? airSpeedKmh : groundSpeedKmh;
    this.drawReadout(cy, this._boxW, boxHalfH, primarySpeed, theme);

    // ── 6. Secondary Data (Ground Speed) ───────────────────────────
    const footerSpacing = h * 0.05;
    const footerY3 = h - h * 0.04;
    const footerY2 = footerY3 - footerSpacing;
    const footerY1 = footerY2 - footerSpacing;

    ctx.fillStyle    = 'rgba(234, 245, 255, 0.95)';
    ctx.font         = this._footerFontStr;
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor  = 'rgba(64, 200, 255, 0.45)';
    ctx.shadowBlur   = 6;

    // Line 1: Label
    ctx.fillText('GS', this._readoutCx, footerY1);

    // Line 2: Value
    ctx.fillText(`${Math.round(groundSpeedKmh)}`, this._readoutCx, footerY2);

    // Line 3: Unit
    ctx.fillText('km/h', this._readoutCx, footerY3);

    ctx.shadowColor  = 'transparent';
    ctx.shadowBlur   = 0;
  }

  // ══════════════════════════════════════════════════════════════════
  //  READOUT BOX — fixed at centre, overlays the tape
  // ══════════════════════════════════════════════════════════════════

  private drawReadout(
    cy: number,
    _boxW: number, boxHalfH: number,
    speed: number,
    _theme: HUDTheme,
  ): void {
    const { ctx } = this;
    const w      = this.width;
    const bH     = boxHalfH * 2;
    const boxX   = this._boxX;
    const boxY   = cy - boxHalfH;
    const notchW = this._notchW;

    // ── Outer amber halo behind the box ───────────────────────────
    ctx.save();
    ctx.fillStyle   = 'rgba(255, 200, 32, 0.07)';
    ctx.shadowColor = 'rgba(255, 190, 0, 0.45)';
    ctx.shadowBlur  = 16;
    ctx.beginPath();
    ctx.moveTo(boxX - 4,       boxY - 4);
    ctx.lineTo(w - notchW + 4, boxY - 4);
    ctx.lineTo(w + 4,          cy);
    ctx.lineTo(w - notchW + 4, boxY + bH + 4);
    ctx.lineTo(boxX - 4,       boxY + bH + 4);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    // ── Dark glass frosted fill ────────────────────────────────────
    ctx.fillStyle = 'rgba(4, 10, 24, 0.80)';
    ctx.beginPath();
    ctx.moveTo(boxX,          boxY);
    ctx.lineTo(w - notchW,    boxY);
    ctx.lineTo(w,             cy);
    ctx.lineTo(w - notchW,    boxY + bH);
    ctx.lineTo(boxX,          boxY + bH);
    ctx.closePath();
    ctx.fill();

    // ── Glowing amber border ───────────────────────────────────────
    ctx.save();
    ctx.strokeStyle = 'rgba(255, 200, 32, 0.90)';
    ctx.lineWidth   = 1.5;
    ctx.shadowColor = 'rgba(255, 190, 0, 0.70)';
    ctx.shadowBlur  = 8;
    ctx.beginPath();
    ctx.moveTo(boxX,          boxY);
    ctx.lineTo(w - notchW,    boxY);
    ctx.lineTo(w,             cy);
    ctx.lineTo(w - notchW,    boxY + bH);
    ctx.lineTo(boxX,          boxY + bH);
    ctx.closePath();
    ctx.stroke();
    ctx.restore();

    // ── Value — white with amber glow ─────────────────────────────
    const clamped = Math.max(0, Math.min(MAX_SPEED_KMH, speed));
    const val10   = Math.round(clamped * 10);
    const whole   = Math.floor(val10 / 10);
    const frac    = val10 % 10;
    ctx.fillStyle    = '#ffffff';
    ctx.font         = this._readoutFontStr;
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor  = 'rgba(255, 200, 32, 0.80)';
    ctx.shadowBlur   = 10;
    // Value slightly higher
    ctx.fillText(String(whole) + '.' + String(frac), this._readoutCx, cy - boxHalfH * 0.15);

    // Unit slightly lower
    ctx.font         = this._fontStr;
    ctx.fillStyle    = 'rgba(255, 255, 255, 0.85)';
    ctx.fillText('km/h', this._readoutCx, cy + boxHalfH * 0.5);

    ctx.shadowColor  = 'transparent';
    ctx.shadowBlur   = 0;
  }

  // ══════════════════════════════════════════════════════════════════
  //  ACCELERATION ESTIMATOR — IIR low-pass on finite differences
  // ══════════════════════════════════════════════════════════════════

  private _updateAccel(speed: number): void {
    const now = performance.now();
    if (this._prevTime > 0) {
      const dt = (now - this._prevTime) / 1000;   // seconds
      if (dt > 0.01 && dt < 2) {
        const rawAccel = (speed - this._prevSpeed) / dt;
        // IIR low-pass α = 0.1 — smooth but responsive
        this._accelMs2 = 0.1 * rawAccel + 0.9 * this._accelMs2;
      }
    }
    this._prevSpeed = speed;
    this._prevTime  = now;
  }
}
