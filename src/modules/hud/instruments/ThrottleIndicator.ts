/**
 * ThrottleIndicator.ts — Vertical Throttle Gauge
 *
 * ════════════════════════════════════════════════════════════════════════
 * DESIGN: Vertical bar showing throttle percentage (0-100%)
 * ════════════════════════════════════════════════════════════════════════
 *
 * Layout:
 *   ┌─────────────────┐
 *   │ 100             │
 *   │  █              │
 *   │  █              │
 *   │  █  54%         │  ← bar grows up from bottom (0%)
 *   │  █              │
 *   │  0              │
 *   └─────────────────┘
 *
 * Colour coding:
 *   Safe (Green)     → 0-60%
 *   Warning (Amber)  → 60-85%
 *   Critical (Red)   → 85-100%
 *
 * Inputs:  FlightTelemetry (prefers real control-surface throttle, falls back to VFR_HUD throttle)
 * Render:  Canvas 2D — called every frame by the global rAF loop
 */

import { CanvasInstrument } from '../core/CanvasInstrument';
import type { ControlSurfacesSource, FlightTelemetry } from '../../telemetry';
import type { HUDTheme } from '../core/HUDTheme';

/** Margin from top/bottom of canvas for the bar (px). */
const MARGIN_Y = 25;
const MARGIN_X = 6;

const REAL_THROTTLE_SOURCES: ReadonlySet<ControlSurfacesSource> = new Set<ControlSurfacesSource>([
  'SERVO_OUTPUT_RAW',
  'ACTUATOR_OUTPUT_STATUS',
  'RC_CHANNELS',
]);

function clampPercent(value: number): number {
  return Math.max(0, Math.min(100, value));
}

export function selectDisplayedThrottlePercent(data: Readonly<FlightTelemetry>): number {
  const source = data.controlSurfacesSource;
  const controlThrottle = data.controlSurfaces.throttlePct;
  if (
    source !== undefined
    && REAL_THROTTLE_SOURCES.has(source)
    && Number.isFinite(controlThrottle)
  ) {
    return clampPercent(controlThrottle);
  }

  return clampPercent(data.velocity.throttlePercent);
}

export class ThrottleIndicator extends CanvasInstrument {
  constructor(canvas: HTMLCanvasElement, theme?: HUDTheme) {
    super(canvas, theme);
  }

  draw(data: Readonly<FlightTelemetry>): void {
    const throttle = selectDisplayedThrottlePercent(data);
    const { ctx, width, height, theme } = this;

    if (width === 0 || height === 0) return;
    this.clear();

    // ── Metrics ──────────────────────────────────────────────────────────
    const fontSize = Math.max(8.8, Math.round(width * 0.275));
    const readoutSz = Math.max(11, Math.round(width * 0.33));

    const barW = Math.max(6, width * 0.2);
    const barX = MARGIN_X;

    const gaugeH = height - MARGIN_Y * 2;
    const zeroY = height - MARGIN_Y;
    const fullY = MARGIN_Y;

    // ── 1. Background Track (Glassy) ───────────────────────────────────────
    const trackGradient = ctx.createLinearGradient(barX, fullY, barX + barW, fullY);
    trackGradient.addColorStop(0, 'rgba(255, 255, 255, 0.05)');
    trackGradient.addColorStop(0.5, 'rgba(255, 255, 255, 0.02)');
    trackGradient.addColorStop(1, 'rgba(255, 255, 255, 0.05)');

    ctx.fillStyle = trackGradient;
    ctx.fillRect(barX, fullY, barW, gaugeH);

    // Subtle inner shadow / border
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
    ctx.lineWidth = 1;
    ctx.strokeRect(barX, fullY, barW, gaugeH);

    // ── 2. Scale Marks (Ticks) ─────────────────────────────────────────────
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
    ctx.lineWidth = 1;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.font = `${fontSize}px ${theme.fontMono}`;

    for (let i = 0; i <= 100; i += 10) {
      const ty = zeroY - (i / 100) * gaugeH;
      const isMajor = i % 50 === 0;
      const tickL = isMajor ? 6 : 3;

      ctx.beginPath();
      ctx.moveTo(barX + barW, ty);
      ctx.lineTo(barX + barW + tickL, ty);
      ctx.stroke();

      if (isMajor) {
        ctx.fillStyle = theme.tapeText;
        ctx.fillText(i.toString(), barX + barW + 8, ty);
      }
    }

    // ── 3. Active Bar (Gradient + Glow) ────────────────────────────────────
    const fillHeight = (throttle / 100) * gaugeH;
    const barY = zeroY - fillHeight;
    const barColor = this._getThrottleColor(throttle, theme);

    if (fillHeight > 0) {
      // Glow halo
      ctx.shadowBlur = 10;
      ctx.shadowColor = barColor;

      const barGrad = ctx.createLinearGradient(barX, zeroY, barX, barY);
      barGrad.addColorStop(0, barColor);
      barGrad.addColorStop(1, this._adjustAlpha(barColor, 0.7));

      ctx.fillStyle = barGrad;
      ctx.fillRect(barX, barY, barW, fillHeight);

      // Reset shadow
      ctx.shadowBlur = 0;

      // Shine highlight
      ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
      ctx.fillRect(barX, barY, 2, fillHeight);
    }

    // ── 4. Value Readout (Glass Box) ───────────────────────────────────────
    const readoutW = width - 4;
    const readoutH = readoutSz * 1.6;
    const readoutY = height - readoutH - 4;
    const readoutX = (width - readoutW) / 2;

    // Box background
    ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
    ctx.beginPath();
    this._roundRect(ctx, readoutX, readoutY, readoutW, readoutH, 4);
    ctx.fill();

    // Border matches state color
    ctx.strokeStyle = this._adjustAlpha(barColor, 0.4);
    ctx.lineWidth = 1;
    ctx.stroke();

    // Text
    ctx.fillStyle = barColor;
    ctx.font = `bold ${readoutSz}px ${theme.fontMono}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(`${Math.round(throttle)}%`, width / 2, readoutY + readoutH / 2);

    // ── 5. Label "THR" ─────────────────────────────────────────────────────
    ctx.fillStyle = '#ffffff';
    ctx.font = `bold ${fontSize + 0.55}px ${theme.fontHUD}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText('THR', width / 2, 7);
  }

  private _getThrottleColor(val: number, theme: HUDTheme): string {
    if (val < 60) return theme.safe;     // Green: 0-60
    if (val < 85) return theme.warning;  // Yellow: 60-85
    return theme.critical;               // Red: 85-100
  }

  private _adjustAlpha(color: string, alpha: number): string {
    if (color.startsWith('rgba')) {
      return color.replace(/[\d.]+\)$/g, `${alpha})`);
    }
    return color;
  }

  private _roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
    if (w < 2 * r) r = w / 2;
    if (h < 2 * r) r = h / 2;
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }
}
