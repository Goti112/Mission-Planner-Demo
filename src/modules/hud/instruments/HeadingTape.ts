/**
 * HeadingTape.ts
 *
 * Cinta de heading horizontal — glass cockpit style.
 *
 * Layout (canvas height ≈ 44 px):
 *   [  ▼ center pointer at top  ]
 *   [  ticks growing downward   ]  0..TICK_END_Y
 *   [  cardinal / numeric labels ]  LABEL_Y
 *   [  heading box (center only) ]  at bottom
 *
 * Scale automatically computed from canvas width:
 *   pxPerDeg = width / (2 * HALF_VISIBLE_DEG)
 *   → always shows ±HALF_VISIBLE_DEG on each side of current heading.
 *
 * Inputs:  NavigationTelemetry (headingDeg, courseOverGroundDeg)
 * Render:  Canvas 2D · rAF
 */

import { CanvasInstrument } from '../core/CanvasInstrument';
import type { FlightTelemetry } from '../../telemetry';
import type { HUDTheme } from '../core/HUDTheme';

/** Total visible arc = 2 × this. Keeps scale readable at all sizes. */
const HALF_VISIBLE_DEG = 30;

const MAJOR_STEP = 10;  // degrees between labelled ticks
const MINOR_STEP = 5;  // degrees between every tick

const CARDINAL: Record<number, string> = { 0: 'N', 90: 'E', 180: 'S', 270: 'W' };

export class HeadingTape extends CanvasInstrument {

  // ── cached layout — computed once per resize ──────────────────────
  private _pxPerDeg = 0;
  private _cx = 0;
  private _majorTickH = 0;
  private _minorTickH = 0;
  private _fontSize = 0;
  private _bugW = 0;
  private _bugH = 0;
  private _boxH = 0;
  private _boxW = 0;
  private _boxY = 0;

  constructor(canvas: HTMLCanvasElement, theme?: HUDTheme) {
    super(canvas, theme);
  }

  override resize(width: number, height: number): void {
    super.resize(width, height);
    this._pxPerDeg = width / (2 * HALF_VISIBLE_DEG);
    this._cx = (width / 2) + 2; // Subtle 2px right-shift as requested for visual alignment
    this._majorTickH = Math.round(height * 0.40);
    this._minorTickH = Math.round(height * 0.24);
    this._fontSize = Math.max(13.2, Math.round(height * 0.385));
    this._bugW = Math.max(12, Math.round(width * 0.040));
    this._bugH = Math.max(4, Math.round(height * 0.08));
    // Box fills from triangle tip to bottom edge (rectangular layout)
    this._boxH = height - this._bugH - 2;
    this._boxW = this._boxH * 1.8;    // wider than tall for better text fit
    this._boxY = this._bugH;           // starts right at triangle tip
  }

  override draw(data: Readonly<FlightTelemetry>): void {
    const { headingDeg, courseOverGroundDeg } = data.navigation;
    const { ctx, width, height, theme } = this;

    this.clear();

    // ── Background — semi-translucent, avionics clarity over glass effect ───
    // Slight horizontal vignette at edges keeps floating look without hard black.
    const bgGrad = ctx.createLinearGradient(0, 0, width, 0);
    bgGrad.addColorStop(0, 'rgba(15, 20, 30, 0.70)');
    bgGrad.addColorStop(0.12, 'rgba(15, 20, 30, 0.50)');
    bgGrad.addColorStop(0.50, 'rgba(15, 20, 30, 0.45)');
    bgGrad.addColorStop(0.88, 'rgba(15, 20, 30, 0.50)');
    bgGrad.addColorStop(1, 'rgba(15, 20, 30, 0.70)');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, width, height);

    const cx = this._cx;
    const pxPerDeg = this._pxPerDeg;

    // ── Tick marks and labels ─────────────────────────────────────────
    const startDeg = headingDeg - HALF_VISIBLE_DEG;
    const endDeg = headingDeg + HALF_VISIBLE_DEG;
    const firstMark = Math.floor(startDeg / MINOR_STEP) * MINOR_STEP;

    for (let deg = firstMark; deg <= endDeg; deg += MINOR_STEP) {
      const x = cx + (deg - headingDeg) * pxPerDeg;
      if (x < 0 || x > width) continue;

      const normDeg = ((deg % 360) + 360) % 360;
      const isMajor = deg % MAJOR_STEP === 0;

      const tickH = isMajor ? this._majorTickH : this._minorTickH;
      ctx.strokeStyle = isMajor ? theme.tapeMajorTick : theme.tapeMinorTick;
      ctx.lineWidth = isMajor ? 1.5 : 0.8;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, tickH);
      ctx.stroke();

      if (isMajor) {
        // Cardinals in accent/red, numerics in tapeText
        const isCardinal = normDeg in CARDINAL;
        const label = CARDINAL[normDeg] ?? `${normDeg}`;
        ctx.fillStyle = (normDeg === 0 || normDeg === 180)
          ? theme.critical      // N/S cardinal — high-vis red
          : isCardinal
            ? theme.accent      // E/W — cyan accent
            : theme.tapeText;
        ctx.font = `bold ${this._fontSize}px ${theme.fontHUD}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        // Text shadow + stroke for ultra-visibility (matching AH roll style)
        ctx.save();
        ctx.shadowColor = 'rgba(0,0,0,0.95)';
        ctx.shadowBlur = 6;
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = 2;
        ctx.strokeText(label, x, this._majorTickH + 1);
        ctx.fillText(label, x, this._majorTickH + 1);
        ctx.restore();
        ctx.shadowColor = 'transparent';
        ctx.shadowBlur = 0;
        ctx.textBaseline = 'alphabetic';
      }
    }

    // ── COG marker (Course Over Ground — green track line) ───────────
    if (courseOverGroundDeg != null) {
      const cogX = cx + (courseOverGroundDeg - headingDeg) * pxPerDeg;
      if (cogX >= 0 && cogX <= width) {
        const cogBottom = this._majorTickH + this._fontSize + 2;
        // Glow halo
        ctx.strokeStyle = 'rgba(0, 210, 100, 0.22)';
        ctx.lineWidth = 5;
        ctx.beginPath();
        ctx.moveTo(cogX, 2);
        ctx.lineTo(cogX, cogBottom);
        ctx.stroke();
        // Main COG line
        ctx.strokeStyle = theme.safe;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(cogX, 2);
        ctx.lineTo(cogX, cogBottom);
        ctx.stroke();
      }
    }

    // ── Center pointer (▼ gold chevron with glow halo) ─────────────
    const bw = this._bugW;
    const bh = this._bugH;
    // Glow halo (wider, translucent)
    ctx.fillStyle = 'rgba(255, 200, 0, 0.20)';
    ctx.beginPath();
    ctx.moveTo(cx - bw - 3, 0);
    ctx.lineTo(cx + bw + 3, 0);
    ctx.lineTo(cx, bh + 4);
    ctx.closePath();
    ctx.fill();
    // Main pointer
    ctx.fillStyle = theme.tapeCenterBug;
    ctx.beginPath();
    ctx.moveTo(cx - bw, 0);
    ctx.lineTo(cx + bw, 0);
    ctx.lineTo(cx, bh);
    ctx.closePath();
    ctx.fill();

    // ── Heading readout box (center-bottom) ───────────────────────────
    const boxX = cx - this._boxW / 2;
    const boxY = this._boxY;
    const boxW = this._boxW;
    const boxH = this._boxH;

    // Dark glass fill — translucent to match the frosted panel aesthetic
    ctx.fillStyle = 'rgba(4, 10, 24, 0.80)';
    ctx.fillRect(boxX, boxY, boxW, boxH);
    // Glowing amber border
    ctx.save();
    ctx.strokeStyle = 'rgba(255, 200, 32, 0.90)';
    ctx.lineWidth = 1.5;
    ctx.shadowColor = 'rgba(255, 190, 0, 0.70)';
    ctx.shadowBlur = 8;
    ctx.strokeRect(boxX + 0.75, boxY + 0.75, boxW - 1.5, boxH - 1.5);
    ctx.restore();

    const hdgText = `${Math.round(((headingDeg % 360) + 360) % 360).toString().padStart(3, '0')}°`;
    ctx.fillStyle = '#ffffff';
    // Decrease size by 2px as requested
    const readoutSize = Math.max(11, Math.round(boxH * 0.715)) - 2.2;
    ctx.font = `bold ${readoutSize}px ${theme.fontMono}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = 'rgba(255, 200, 32, 0.95)';
    ctx.shadowBlur = 15;
    // Added a +1px offset to Y for better visual "optical" centering with the degree symbol
    ctx.fillText(hdgText, cx, boxY + (boxH / 2) + 1);
    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;
    ctx.textBaseline = 'alphabetic';

    // ── Bottom separator line (border handled by CSS cell) ───────────
    ctx.strokeStyle = 'rgba(28, 53, 80, 0.70)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, height - 0.5);
    ctx.lineTo(width, height - 0.5);
    ctx.stroke();
  }
}
