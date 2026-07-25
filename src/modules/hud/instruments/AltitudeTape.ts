/**
 * AltitudeTape.ts — Vertical Altitude Tape (right side of PFD)
 *
 * ════════════════════════════════════════════════════════════════════════
 * DESIGN REFERENCE: Garmin G1000 / Collins Pro Line altimeter tape
 * ════════════════════════════════════════════════════════════════════════
 *
 * Layout (instrument is placed to the RIGHT of the Artificial Horizon):
 *   ┌───────────────┐
 *   ├───────  150   │  ← tick on left edge, label on right
 *   ├───  140       │
 *   │ ██████  │     │  ← center readout box (yellow bug)
 *   ├───  130       │
 *   ├───────  120   │
 *   └───────────────┘
 *
 * Tape scroll math (same as SpeedTape, mirrored horizontally):
 *   pxPerUnit = height / (2 × VISIBLE_RANGE)
 *   y(alt) = centerY − (alt − currentAlt) × pxPerUnit
 *   Higher altitude → smaller y → higher on screen ✓
 *
 * Extra features over SpeedTape:
 *   • Ground reference band — amber stripe when AGL < GROUND_WARN_AGL
 *   • Minimum altitude bug  — red chevron at a configurable floor altitude
 *   • MSL / AGL dual readout below the readout box
 *
 * Inputs:  FlightTelemetry (reads altitude.altitudeMSLm, altitude.altitudeAGLm)
 * Render:  Canvas 2D — called every frame by the global rAF loop
 * Base:    CanvasInstrument (DPI-aware resize, theme, clear)
 */

import { CanvasInstrument } from '../core/CanvasInstrument';
import type { FlightTelemetry } from '../../telemetry';
import type { HUDTheme } from '../core/HUDTheme';

// ── Configuration ────────────────────────────────────────────────────
/** Metres visible above and below current altitude. */
const VISIBLE_RANGE   = 50;
/** Minor tick interval (m). */
const MINOR_STEP      = 10;
/** Major tick interval (m). */
const MAJOR_STEP      = 50;
/** AGL threshold below which a ground-proximity band is shown (m). */
const GROUND_WARN_AGL = 30;

// ── Geometry fractions ───────────────────────────────────────────────
const TICK_AREA_FRAC  = 0.50;   // fraction of width for tick + label zone
const BOX_FRAC        = 0.98;   // fraction of width for readout box
const BOX_HALF_FRAC   = 0.065;  // readout box half-height / height

export class AltitudeTape extends CanvasInstrument {
  /** Optional external minimum safe altitude (m MSL). Set from outside. */
  public minAltitudeBugMSL: number | null = null;
  /** Optional preselected target altitude (m MSL). */
  public targetAltitudeMSL: number | null = null;

  // ── Cached layout constants — recalculated in resize(), read in draw() ──
  // ALL values depend only on width/height, not on live telemetry.
  // Zero arithmetic operations happen inside the rAF hot path.
  private _cy           = 0;   // vertical centre px
  private _pxPerUnit    = 0;   // px per metre of altitude
  private _tickAreaW    = 0;   // width of tick + label zone
  private _tickAreaX    = 0;   // left edge of tick zone
  private _boxHalfH     = 0;   // readout box half-height
  private _boxW         = 0;   // readout box width
  private _notchW       = 0;   // left-pointing notch width
  private _readoutCx    = 0;   // text centre x inside readout box
  private _tickMajorW   = 0;   // major tick length in px
  private _tickMinorW   = 0;   // minor tick length in px
  private _lineWMajor   = 0;   // major tick stroke width
  private _lineWMinor   = 0;   // minor tick stroke width
  private _labelX       = 0;   // x for tape numeric labels
  private _lineWTrend   = 0;   // altitude trend vector stroke width
  private _trendX       = 0;   // x position of altitude trend line
  private _fontStr      = '';  // pre-built font string for tape labels
  private _footerFontStr = ''; // pre-built font string for bottom data
  private _readoutFontStr = ''; // pre-built font string for readout box

  constructor(canvas: HTMLCanvasElement, theme?: HUDTheme) {
    super(canvas, theme);
  }

  /**
   * Recalculate every layout constant from the new canvas size.
   * Called by CanvasInstrument.resize() after the DPI scale is applied.
   * Nothing in draw() may recompute a value that depends only on size.
   */
  override resize(width: number, height: number): void {
    super.resize(width, height);
    const w = this.width;   // physical pixels (DPI-scaled)
    const h = this.height;

    this._cy           = h / 2;
    this._pxPerUnit    = h / (2 * VISIBLE_RANGE);
    this._tickAreaW    = w * TICK_AREA_FRAC;
    this._tickAreaX    = w - this._tickAreaW;
    this._boxHalfH     = h * BOX_HALF_FRAC;
    this._boxW         = w * BOX_FRAC;
    this._notchW       = w * 0.06;
    this._readoutCx    = this._notchW + (this._boxW - this._notchW) / 2;
    this._tickMajorW   = this._tickAreaW * 0.52;
    this._tickMinorW   = this._tickAreaW * 0.26;
    this._lineWMajor   = Math.max(1.5, h * 0.003);
    this._lineWMinor   = Math.max(0.8, h * 0.002);
    this._labelX       = this._tickMajorW + h * 0.012;
    const fSize        = Math.max(9.9,  Math.round(h * 0.0385));
    const footerSize   = Math.max(13.2, Math.round(h * 0.0462));
    const rSize        = Math.round(fSize * 1.4);
    this._fontStr      = `${fSize}px ${this.theme.fontMono}`;
    this._footerFontStr = `bold ${footerSize}px ${this.theme.fontMono}`;
    this._readoutFontStr = `bold ${rSize}px ${this.theme.fontMono}`;
    this._lineWTrend   = Math.max(2, h * 0.004);
    this._trendX       = this._tickMajorW * 0.5;   // midpoint of tick area
  }

  // ══════════════════════════════════════════════════════════════════
  //  MAIN DRAW
  // ══════════════════════════════════════════════════════════════════

  override draw(data: Readonly<FlightTelemetry>): void {
    const { altitudeMSLm, altitudeAGLm } = data.altitude;
    const { ctx, theme } = this;

    if (this.width === 0 || this.height === 0) return;
    this.clear();

    // All layout values read from cached fields (computed in resize()).
    // Zero arithmetic, zero allocations inside the rAF hot path.
    const cy        = this._cy;
    const pxPerUnit = this._pxPerUnit;
    const boxHalfH  = this._boxHalfH;
    const w         = this.width;
    const h         = this.height;

    // ── 1. Background — frosted glass ──────────────────────────────
    // Mirrored gradient: darker on the readout (left) side, lighter on right.
    const bg = ctx.createLinearGradient(0, 0, w, 0);
    bg.addColorStop(0,    'rgba(4,  8, 18, 0.16)');
    bg.addColorStop(0.45, 'rgba(6, 12, 24, 0.28)');
    bg.addColorStop(1,    'rgba(6, 12, 24, 0.45)');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);
    // Left edge — 1 px cyan glow beacon
    ctx.save();
    ctx.strokeStyle = 'rgba(40, 140, 255, 0.50)';
    ctx.lineWidth   = 1;
    ctx.shadowColor = 'rgba(30, 120, 255, 0.70)';
    ctx.shadowBlur  = 10;
    ctx.beginPath();
    ctx.moveTo(0.5, 0);
    ctx.lineTo(0.5, h);
    ctx.stroke();
    ctx.restore();

    // ── 2. Ground proximity band ──────────────────────────────────
    const groundRef = altitudeMSLm - (altitudeAGLm ?? 0);
    if (altitudeAGLm !== null && altitudeAGLm < GROUND_WARN_AGL) {
      this.drawGroundBand(cy, pxPerUnit, altitudeMSLm, groundRef, theme);
    }

    // ── 3. Graduated tape ─────────────────────────────────────────
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, w, cy - boxHalfH);
    ctx.rect(0, cy + boxHalfH, w, h - cy - boxHalfH);
    ctx.clip();

    const minVisible = altitudeMSLm - VISIBLE_RANGE - MAJOR_STEP;
    const maxVisible = altitudeMSLm + VISIBLE_RANGE + MAJOR_STEP;
    const firstTick  = Math.floor(minVisible / MINOR_STEP) * MINOR_STEP;
    const lastTick   = Math.ceil(maxVisible  / MINOR_STEP) * MINOR_STEP;

    for (let alt = firstTick; alt <= lastTick; alt += MINOR_STEP) {
      const y = cy - (alt - altitudeMSLm) * pxPerUnit;
      if (y < -2 || y > h + 2) continue;

      const isMajor = (alt % MAJOR_STEP) === 0;
      ctx.strokeStyle = isMajor ? theme.tapeMajorTick : theme.tapeMinorTick;
      ctx.lineWidth   = isMajor ? this._lineWMajor : this._lineWMinor;
      ctx.beginPath();
      ctx.moveTo(0,     y);
      ctx.lineTo(isMajor ? this._tickMajorW : this._tickMinorW, y);
      ctx.stroke();

      if (isMajor) {
        ctx.fillStyle    = theme.tapeText;
        ctx.font         = this._fontStr;         // pre-built in resize()
        ctx.textAlign    = 'left';
        ctx.textBaseline = 'middle';
        ctx.shadowColor  = 'rgba(0,0,0,0.60)';
        ctx.shadowBlur   = 4;
        ctx.fillText(String(alt), this._labelX, y); // V8 interns small ints
        ctx.shadowColor  = 'transparent';
        ctx.shadowBlur   = 0;
      }
    }

    ctx.restore();
    // ── 3b. Altitude trend vector ──────────────────────────────────
    //  Vertical amber line showing predicted altitude in ~6 seconds,
    //  based on current vertical speed.  Drawn in the tick area so it
    //  does not clutter the readout box.
    const { verticalSpeedMs } = data.velocity;
    const TREND_SECS = 6;
    const altTrend = verticalSpeedMs * TREND_SECS;
    if (Math.abs(altTrend) > 1.0) {
      const trendPx = altTrend * pxPerUnit;
      const trendY1 = Math.max(boxHalfH, Math.min(h - boxHalfH, cy - trendPx));
      ctx.lineCap = 'round';
      // Glow pass first
      ctx.strokeStyle = 'rgba(255, 200, 32, 0.22)';
      ctx.lineWidth   = this._lineWTrend * 3;
      ctx.beginPath();
      ctx.moveTo(this._trendX, cy);
      ctx.lineTo(this._trendX, trendY1);
      ctx.stroke();
      // Solid line on top
      ctx.strokeStyle = theme.tapeCenterBug;
      ctx.lineWidth   = this._lineWTrend;
      ctx.beginPath();
      ctx.moveTo(this._trendX, cy);
      ctx.lineTo(this._trendX, trendY1);
      ctx.stroke();
      ctx.lineCap = 'butt';
    }
    // ── 4. Optional bugs ──────────────────────────────────────────
    if (this.minAltitudeBugMSL !== null) {
      this.drawMinAltBug(cy, pxPerUnit, altitudeMSLm, this.minAltitudeBugMSL,
        boxHalfH, this._tickAreaX, theme);
    }
    if (this.targetAltitudeMSL !== null) {
      this.drawTargetAltBug(cy, pxPerUnit, altitudeMSLm, this.targetAltitudeMSL,
        boxHalfH, this._tickAreaX, theme);
    }

    // ── 5. Center readout box ─────────────────────────────────────
    const primaryAlt = altitudeAGLm ?? altitudeMSLm;
    this.drawReadout(cy, primaryAlt, theme);

    // ── 6. Secondary Data (ASL) ──────────────────────────────────
    const footerSpacing = h * 0.05;
    const footerY3 = h - h * 0.04;
    const footerY2 = (footerY3 - footerSpacing) + h * 0.008;
    const footerY1 = footerY2 - footerSpacing * 1.1;

    ctx.fillStyle    = 'rgba(234, 245, 255, 0.95)';
    ctx.font         = this._footerFontStr;
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor  = 'rgba(64, 200, 255, 0.45)';
    ctx.shadowBlur   = 6;

    // Line 1: Label
    ctx.fillText('ASL', this._readoutCx, footerY1);

    // Line 2: Value
    ctx.fillText(`${Math.round(altitudeMSLm)}`, this._readoutCx, footerY2);

    // Line 3: Unit
    ctx.fillText('m', this._readoutCx, footerY3);

    ctx.shadowColor  = 'transparent';
    ctx.shadowBlur   = 0;
  }

  // ══════════════════════════════════════════════════════════════════
  //  READOUT BOX
  //  Mirror of SpeedTape: pointer notch on LEFT edge, text right-aligned
  // ══════════════════════════════════════════════════════════════════

  /**
   * ZERO-ALLOCATION readout box.
   * All geometry (notchW, boxW, boxHalfH, readoutCx, font) is pre-cached
   * in resize() — no arithmetic or string construction happens here.
   * String(Math.round(n)) — V8 interns small integer strings: zero alloc.
   */
  private drawReadout(cy: number, altMSL: number, _theme: HUDTheme): void {
    const { ctx }  = this;
    const boxHalfH = this._boxHalfH;
    const boxW     = this._boxW;
    const notchW   = this._notchW;
    const bH       = boxHalfH * 2;
    const boxY     = cy - boxHalfH;

    // ── Outer amber halo ───────────────────────────────────────────────
    ctx.save();
    ctx.fillStyle   = 'rgba(255, 200, 32, 0.07)';
    ctx.shadowColor = 'rgba(255, 190, 0, 0.45)';
    ctx.shadowBlur  = 16;
    ctx.beginPath();
    ctx.moveTo(notchW - 4,    boxY - 4);
    ctx.lineTo(boxW + 4,      boxY - 4);
    ctx.lineTo(boxW + 4,      boxY + bH + 4);
    ctx.lineTo(notchW - 4,    boxY + bH + 4);
    ctx.lineTo(-4,            cy);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    // ── Dark glass frosted fill ───────────────────────────────────────
    ctx.fillStyle = 'rgba(4, 10, 24, 0.80)';
    ctx.beginPath();
    ctx.moveTo(notchW, boxY);
    ctx.lineTo(boxW,   boxY);
    ctx.lineTo(boxW,   boxY + bH);
    ctx.lineTo(notchW, boxY + bH);
    ctx.lineTo(0,      cy);
    ctx.closePath();
    ctx.fill();

    // ── Glowing amber border ───────────────────────────────────────
    ctx.save();
    ctx.strokeStyle = 'rgba(255, 200, 32, 0.90)';
    ctx.lineWidth   = 1.5;
    ctx.shadowColor = 'rgba(255, 190, 0, 0.70)';
    ctx.shadowBlur  = 8;
    ctx.beginPath();
    ctx.moveTo(notchW, boxY);
    ctx.lineTo(boxW,   boxY);
    ctx.lineTo(boxW,   boxY + bH);
    ctx.lineTo(notchW, boxY + bH);
    ctx.lineTo(0,      cy);
    ctx.closePath();
    ctx.stroke();
    ctx.restore();

    // ── Value — white with amber glow ─────────────────────────────
    ctx.fillStyle    = '#ffffff';
    ctx.font         = this._readoutFontStr;
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor  = 'rgba(255, 200, 32, 0.80)';
    ctx.shadowBlur   = 10;
    // Value + 'm' on top line
    ctx.fillText(String(Math.round(altMSL)) + '\u2009m', this._readoutCx, cy - boxHalfH * 0.15);

    // Reference on bottom line
    ctx.font         = this._fontStr;
    ctx.fillStyle    = 'rgba(255, 255, 255, 0.85)';
    ctx.fillText('AGL', this._readoutCx, cy + boxHalfH * 0.5);

    ctx.shadowColor  = 'transparent';
    ctx.shadowBlur   = 0;
  }

  // ══════════════════════════════════════════════════════════════════
  //  GROUND PROXIMITY BAND
  //  Amber diagonal-stripe fill from groundRef altitude upward
  // ══════════════════════════════════════════════════════════════════

  private drawGroundBand(
    cy: number, pxPerUnit: number,
    currentAlt: number, groundRef: number,
    theme: HUDTheme,
  ): void {
    const { ctx, width, height } = this;

    // y-coordinate of the ground MSL level on the tape
    const groundY = cy - (groundRef - currentAlt) * pxPerUnit;
    if (groundY > height) return;   // ground is below the visible tape

    const bandTop = Math.max(0, groundY);
    const bandH   = height - bandTop;
    if (bandH <= 0) return;

    // Diagonal amber stripes
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, bandTop, width, bandH);
    ctx.clip();

    ctx.fillStyle = 'rgba(255, 140, 0, 0.18)';
    ctx.fillRect(0, bandTop, width, bandH);

    const stripeW = width * 0.18;
    ctx.strokeStyle = 'rgba(255, 140, 0, 0.35)';
    ctx.lineWidth   = stripeW * 0.5;
    for (let x = -bandH; x < width + bandH; x += stripeW) {
      ctx.beginPath();
      ctx.moveTo(x,          bandTop);
      ctx.lineTo(x + bandH,  bandTop + bandH);
      ctx.stroke();
    }

    // "GND" label
    ctx.fillStyle    = theme.warning;
    ctx.font         = `bold ${Math.max(8.8, Math.round(height * 0.0308))}px ${theme.fontHUD}`;
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText('GND', width / 2, bandTop + 2);

    ctx.restore();
  }

  // ══════════════════════════════════════════════════════════════════
  //  MINIMUM ALTITUDE BUG — red inward chevron
  // ══════════════════════════════════════════════════════════════════

  private drawMinAltBug(
    cy: number, pxPerUnit: number,
    currentAlt: number, bugAlt: number,
    boxHalfH: number, _tickAreaX: number,
    theme: HUDTheme,
  ): void {
    const { ctx, width } = this;
    const y = cy - (bugAlt - currentAlt) * pxPerUnit;
    if (y < -10 || y > this.height + 10) return;
    if (Math.abs(y - cy) < boxHalfH + 2) return;  // Skip if behind readout

    const bw = width * 0.12;
    const bh = this.height * 0.025;

    ctx.fillStyle = theme.critical;
    ctx.beginPath();
    // Left-pointing chevron on left edge
    ctx.moveTo(bw,  y - bh);
    ctx.lineTo(0,   y);
    ctx.lineTo(bw,  y + bh);
    ctx.lineTo(bw,  y + bh * 0.4);
    ctx.lineTo(bw * 0.4, y);
    ctx.lineTo(bw,  y - bh * 0.4);
    ctx.closePath();
    ctx.fill();
  }

  // ══════════════════════════════════════════════════════════════════
  //  TARGET ALTITUDE BUG — cyan marker
  // ══════════════════════════════════════════════════════════════════

  private drawTargetAltBug(
    cy: number, pxPerUnit: number,
    currentAlt: number, bugAlt: number,
    boxHalfH: number, _tickAreaX: number,
    theme: HUDTheme,
  ): void {
    const { ctx, width } = this;
    const y = cy - (bugAlt - currentAlt) * pxPerUnit;
    if (y < -10 || y > this.height + 10) return;
    if (Math.abs(y - cy) < boxHalfH + 2) return;

    const bw = width * 0.10;
    const bh = this.height * 0.02;

    ctx.strokeStyle = theme.accent;
    ctx.lineWidth   = Math.max(1.5, this.height * 0.004);
    // Horizontal notch on left edge
    ctx.beginPath();
    ctx.moveTo(0,    y);
    ctx.lineTo(bw,   y);
    ctx.moveTo(bw,   y - bh);
    ctx.lineTo(bw,   y + bh);
    ctx.stroke();
  }
}
