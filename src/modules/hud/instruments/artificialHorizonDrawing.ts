/**
 * artificialHorizonDrawing.ts — Pure geometry & formatting helpers
 *
 * Extracted from ArtificialHorizon.ts so drawing helpers can be tested
 * independently without a canvas context.
 *
 * Every function in this file:
 *   • Is pure (inputs → output, no side effects)
 *   • Never references CanvasRenderingContext2D
 *   • Never mutates instrument state
 */

import type { HUDTheme } from '../core/HUDTheme';

// ── Math constants ────────────────────────────────────────────────────
export const DEG_TO_RAD = Math.PI / 180;
export const TWO_PI     = Math.PI * 2;

// ── Perspective foreshortening ────────────────────────────────────────
/**
 * Reciprocal depth foreshortening for the pitch ladder.
 * At y=0 (horizon) scale=1.0 (no compression).
 * At y=cullY (bezel edge) scale≈0.36 (strong foreshortening).
 */
export function perspScale(absY: number, perspK: number): number {
  return 1 / (1 + absY * perspK);
}

// ── Pitch-line opacity fade ───────────────────────────────────────────
/**
 * Opacity for pitch ladder lines based on distance from the horizon.
 * Lines within 70% of cullY are fully opaque; beyond that they fade
 * linearly to 40% at the cull boundary.
 */
export function pitchLineAlpha(absY: number, cullY: number): number {
  const fadeFrac = absY / cullY;
  return fadeFrac > 0.70
    ? 1 - (fadeFrac - 0.70) / 0.30 * 0.60
    : 1.0;
}

// ── Roll tick length ──────────────────────────────────────────────────
/**
 * Returns the tick length category for a given absolute roll angle
 * based on standard ADI conventions:
 *   0°, 45°, 60°, 70°, 80°, 90° → long
 *   30°                          → medium
 *   10°, 20°                     → short
 */
export function rollTickLen(
  absDeg: number,
  tickS: number,
  tickM: number,
  tickL: number,
): number {
  if (absDeg === 0 || absDeg === 45 || absDeg === 60 || absDeg === 70 || absDeg === 80 || absDeg === 90) return tickL;
  if (absDeg === 30) return tickM;
  return tickS;
}

// ── Roll tick colour ──────────────────────────────────────────────────
/**
 * Returns the colour for a roll scale tick based on bank angle:
 *   0°–20°  : normal arc colour
 *   30°     : yellow  — caution onset
 *   45°     : amber   — extreme caution
 *   60°+    : red     — critical bank
 */
export function rollTickColor(absDeg: number, theme: HUDTheme): string {
  if (absDeg >= 60) return theme.critical;
  if (absDeg >= 45) return theme.warning;
  if (absDeg >= 30) return '#e8cc40';
  return theme.rollArc;
}

// ── Roll pointer triangle colour ─────────────────────────────────────
/**
 * Returns the colour for the fixed sky-pointer triangle based on
 * current roll angle — same escalation as rollTickColor.
 */
export function pointerColor(rollAbs: number, theme: HUDTheme): string {
  if (rollAbs >= 60) return theme.critical;
  if (rollAbs >= 45) return theme.warning;
  if (rollAbs >= 30) return '#e8cc40';
  return theme.tapeCenterBug;
}

// ── Synthetic Vision slice colour table builder ──────────────────────
export interface SliceColorTables {
  sliceColors:        string[];
  sliceWarningColors: string[];
  ridgeColors:        string[];
}

/**
 * Builds the three colour tables for synthetic vision terrain rendering.
 * Pure: given a slice count `n`, returns pre-computed hsl strings.
 *
 * Normal:  blue-grey haze (far) → dark olive green (near)
 * Warning: pale amber  (far) → dark red-brown (near)  [terrain ≥ alt]
 * Ridge:   slightly darker outlines for depth perception
 */
export function buildSliceColors(n: number): SliceColorTables {
  const sliceColors        = new Array<string>(n);
  const sliceWarningColors = new Array<string>(n);
  const ridgeColors        = new Array<string>(n);

  for (let s = 0; s < n; s++) {
    const t = s / Math.max(1, n - 1); // 0 = farthest, 1 = nearest

    // Normal terrain — earth/brown tones with atmospheric haze perspective
    const hN = 32 - t * 12;
    const sN = 14 + t * 42;
    const lN = 38 - t * 22;
    sliceColors[s] =
      `hsl(${Math.round(hN)},${Math.round(sN)}%,${Math.round(lN)}%)`;

    // Warning terrain (at/above aircraft altitude)
    const hW = 40 - t * 25;
    const sW = 30 + t * 40;
    const lW = 50 - t * 20;
    sliceWarningColors[s] =
      `hsl(${Math.round(hW)},${Math.round(sW)}%,${Math.round(lW)}%)`;

    // Ridge lines — slightly darker than normal fill
    const lR = Math.max(10, lN - 8);
    ridgeColors[s] =
      `hsl(${Math.round(hN)},${Math.round(Math.min(100, sN + 5))}%,${Math.round(lR)}%)`;
  }

  return { sliceColors, sliceWarningColors, ridgeColors };
}
