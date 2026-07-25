/**
 * VerticalSpeedIndicator.ts — Vertical Speed Indicator (VSI)
 *
 * ════════════════════════════════════════════════════════════════════════
 * DESIGN: Compact vertical bar tape centred at 0 m/s
 * ════════════════════════════════════════════════════════════════════════
 *
 * Layout:
 *   ┌─────────────────┐
 *   │  +10            │
 *   │    5            │
 *   │  ▶ 3  ████████ │  ← bar grows up from 0 when climbing
 *   │    2            │
 *   │  ──0────────── │  ← thick zero reference line
 *   │   -1            │
 *   │  -10            │
 *   └─────────────────┘
 *
 * Scale: NON-LINEAR (square-root compression).
 *   Provides fine resolution in the ±3 m/s operational band while
 *   compressing ±5–10 m/s extremes — same concept as a classic
 *   VSI needle with a curved scale.
 *
 *   normalised(v) = sign(v) × √(|v| / MAX_VS)
 *   y(v)          = cy − normalised(v) × halfH × FILL_FRAC
 *
 * Colour coding:
 *   Green  → climbing  (VS > +0.3 m/s)
 *   Amber  → descending moderately  (VS < −0.3 m/s)
 *   Red    → descending fast  (VS < −3 m/s)
 *   Grey   → near-zero  (|VS| ≤ 0.3 m/s)
 *
 * Inputs:  FlightTelemetry (reads velocity.verticalSpeedMs)
 * Render:  Canvas 2D — called every frame by the global rAF loop
 * Base:    CanvasInstrument (DPI-aware resize, theme, clear)
 */

import { CanvasInstrument } from '../core/CanvasInstrument';
import type { FlightTelemetry } from '../../telemetry';
import type { HUDTheme } from '../core/HUDTheme';

// ── Configuration ──────────────────────────────────────────────────────────
/** Maximum vertical speed represented by the full extent of the scale (m/s). */
const MAX_VS_MS   = 10;
/** Scale values that get a tick mark. */
const SCALE_MARKS = [0, 1, 2, 3, 5, 10] as const;
/** VS threshold below which the bar uses the "near-zero" colour (m/s). */
const ZERO_BAND   = 0.3;
/** VS threshold below which descent is considered "fast" (m/s, abs). */
const FAST_DESC   = 3;
/** Fraction of half-height used for the active bar extent at MAX_VS_MS. */
const FILL_FRAC   = 0.82;

/**
 * Non-linear (square-root) mapping from vertical speed to normalised [−1, +1].
 *
 * The square-root compression gives more visual resolution in the ±3 m/s
 * operational band (where precision matters most) and compresses the 5-10 m/s
 * extremes (visible but not crowded) — matching a classic curved-scale VSI.
 */
function vsNorm(vs: number): number {
  const clamped = Math.max(-MAX_VS_MS, Math.min(MAX_VS_MS, vs));
  return Math.sign(clamped) * Math.sqrt(Math.abs(clamped) / MAX_VS_MS);
}

/** y-position on the tape for a given vs value. */
function vsToY(vs: number, cy: number, halfH: number): number {
  // Positive VS → above centre → negative canvas y offset
  return cy - vsNorm(vs) * halfH * FILL_FRAC;
}

export class VerticalSpeedIndicator extends CanvasInstrument {
  constructor(canvas: HTMLCanvasElement, theme?: HUDTheme) {
    super(canvas, theme);
  }

  // ════════════════════════════════════════════════════════════════════════
  //  MAIN DRAW
  //
  //  Column layout (all x-fractions are relative to `width` so the VSI
  //  renders cleanly whether the column is 54 px or 64 px wide):
  //
  //  ┌──────────────────────────────────────────┐
  //  │ 10 ──│  ██████████ │                     │  ← tape area
  //  │  5 ─ │  ██████████ │                     │
  //  │  3   │  ██████████ │                     │
  //  │  2   │  ██████████ │                     │
  //  │  1   │  ██████████ │                     │
  //  │──0 ─────────────────── zero line ──────── │
  //  │  1                                       │
  //  │  3                                       │
  //  │  5 ─                                     │
  //  │ 10 ──                                    │
  //  ╠══════════════════════════════════════════╣
  //  │             +0.0                         │  ← readout panel
  //  │             m/s                          │
  //  └──────────────────────────────────────────┘
  //
  //  Horizontal zones:
  //    labels:  right-aligned at labelX  (0 → 38% w)
  //    gap:     38% → 44% w
  //    ticks:   44% → 58% w  (major), 44% → 51% w  (minor)
  //    bar:     60% → 96% w
  //
  //  Font sizes use `width` (not height) so a tall narrow column
  //  never produces oversized text that overflows horizontally.
  // ════════════════════════════════════════════════════════════════════════

  draw(data: FlightTelemetry): void {
    const vs = data.velocity.verticalSpeedMs;
    const { ctx, width, height, theme } = this;

    if (width === 0 || height === 0) return;
    this.clear();

    // ── Font sizes (width-based to fit the narrow column) ─────────────────
    const fontSize   = Math.max(7.7, Math.round(width * 0.198));  // scale labels
    const readoutSz  = Math.max(9.9, Math.round(width * 0.264));  // ±X.X value
    const unitSz     = Math.max(6.6, Math.round(width * 0.154));  // "m/s"

    // ── Readout panel — fixed height at the bottom ────────────────────────
    // Guaranteed separation from scale marks; never overlaps tick labels.
    const readoutH = Math.round(readoutSz * 1.3 + unitSz * 1.4 + 10);
    const divY     = height - readoutH;   // y of divider line

    // ── Tape area (everything above the divider) ──────────────────────────
    const tapeH = divY;
    const cy    = tapeH * 0.50;
    const halfH = tapeH * 0.50;

    // ── Horizontal zones ──────────────────────────────────────────────────
    const labelX     = width * 0.38;   // labels: right-align here
    const tickRightX = width * 0.58;   // tick right edge
    const tickMajW   = width * 0.16;   // major tick length
    const tickMinW   = width * 0.08;   // minor tick length
    const barX       = width * 0.62;   // bar left edge
    const barW       = Math.max(4, width * 0.34);  // bar width

    // ── 1. Background ─────────────────────────────────────────────────────
    ctx.fillStyle = 'rgba(8, 12, 20, 0.22)';
    ctx.fillRect(0, 0, width, height);

    // ── 2. Active bar ─────────────────────────────────────────────────────
    const zeroY  = cy;
    const valueY = vsToY(vs, cy, halfH);
    const barTop = Math.min(zeroY, valueY);
    const barBot = Math.max(zeroY, valueY);

    const barColor = this._barColour(vs, theme);

    // Glow halo behind bar
    ctx.fillStyle   = barColor;
    ctx.globalAlpha = 0.15;
    ctx.fillRect(barX - 2, barTop, barW + 4, Math.max(1, barBot - barTop));
    ctx.globalAlpha = 1;

    // Solid fill
    ctx.fillStyle   = barColor;
    ctx.globalAlpha = 0.55;
    ctx.fillRect(barX, barTop, barW, Math.max(1, barBot - barTop));
    ctx.globalAlpha = 1;

    // Crisp edge line at value y
    ctx.strokeStyle = barColor;
    ctx.lineWidth   = Math.max(2, width * 0.04);
    ctx.beginPath();
    ctx.moveTo(barX, valueY);
    ctx.lineTo(barX + barW, valueY);
    ctx.stroke();

    // ── 3. Scale marks (inside tapeH clip zone) ───────────────────────────
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, width, tapeH);
    ctx.clip();

    for (const absVal of SCALE_MARKS) {
      const signs = absVal === 0 ? [0] : [absVal, -absVal];
      for (const val of signs) {
        const y       = vsToY(val, cy, halfH);
        const isMajor = absVal % 5 === 0 || absVal === 0;
        const tw      = isMajor ? tickMajW : tickMinW;

        ctx.strokeStyle = isMajor ? theme.tapeMajorTick : theme.tapeMinorTick;
        ctx.lineWidth   = isMajor
          ? Math.max(1.5, width * 0.030)
          : Math.max(0.8, width * 0.015);

        // Ticks grow leftward from tickRightX
        ctx.beginPath();
        ctx.moveTo(tickRightX - tw, y);
        ctx.lineTo(tickRightX,       y);
        ctx.stroke();

        // Labels: show for major (0, ±5, ±10) only — keeps scale uncluttered
        if (isMajor) {
          ctx.fillStyle    = val === 0 ? 'rgba(200,220,255,0.70)' : theme.tapeText;
          ctx.font         = `${fontSize}px ${theme.fontMono}`;
          ctx.textAlign    = 'right';
          ctx.textBaseline = 'middle';
          ctx.shadowColor  = 'rgba(0,0,0,0.65)';
          ctx.shadowBlur   = 3;
          ctx.fillText(String(absVal), labelX, y);
          ctx.shadowColor  = 'transparent';
          ctx.shadowBlur   = 0;
        }
      }
    }

    ctx.restore();  // release tape clip

    // ── 4. Zero reference line ────────────────────────────────────────────
    ctx.strokeStyle = 'rgba(210, 230, 255, 0.50)';
    ctx.lineWidth   = Math.max(1.5, width * 0.030);
    ctx.beginPath();
    ctx.moveTo(0,     cy);
    ctx.lineTo(width, cy);
    ctx.stroke();

    // ── 5. Small triangle pointer at bar left edge ────────────────────────
    const arrowH = Math.max(3, width * 0.09);
    const arrowW = Math.max(3, width * 0.09);
    ctx.fillStyle = barColor;
    ctx.beginPath();
    ctx.moveTo(barX,           valueY);           // tip (leftmost point)
    ctx.lineTo(barX + arrowW,  valueY - arrowH);
    ctx.lineTo(barX + arrowW,  valueY + arrowH);
    ctx.closePath();
    ctx.fill();

    // ── 6. Divider line between tape & readout panel ──────────────────────
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
    ctx.lineWidth   = 1;
    ctx.beginPath();
    ctx.moveTo(4,     divY);
    ctx.lineTo(width - 4, divY);
    ctx.stroke();

    // ── 7. Readout panel — always at the bottom, never overlaps scale ─────
    const panelY  = divY + 2;
    const panelH  = readoutH - 4;
    const centerX = width / 2;

    // Subtle dark background pill
    ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
    ctx.fillRect(2, panelY, width - 4, panelH);

    // VS numeric value (+X.X)
    const sign  = vs > 0 ? '+' : '';
    const vsStr = sign + vs.toFixed(1);

    ctx.fillStyle    = barColor;
    ctx.font         = `bold ${readoutSz}px ${theme.fontMono}`;
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'top';
    ctx.shadowColor  = 'rgba(0,0,0,0.85)';
    ctx.shadowBlur   = 4;
    ctx.fillText(vsStr, centerX, panelY + 3);
    ctx.shadowColor  = 'transparent';
    ctx.shadowBlur   = 0;

    // Unit label — placed directly below the value, no overlap
    const unitY = panelY + 3 + readoutSz * 1.1;
    ctx.fillStyle    = theme.textDim;
    ctx.font         = `${unitSz}px ${theme.fontHUD}`;
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText('m/s', centerX, unitY);
  }

  // ════════════════════════════════════════════════════════════════════════
  //  COLOUR LOGIC
  // ════════════════════════════════════════════════════════════════════════

  private _barColour(vs: number, theme: HUDTheme): string {
    if (Math.abs(vs) <= ZERO_BAND) return theme.textDim;    // near-zero
    if (vs > 0)                    return theme.safe;        // climbing  → green
    if (vs < -FAST_DESC)           return theme.critical;    // fast desc → red
    return theme.warning;                                    // slow desc → amber
  }
}
