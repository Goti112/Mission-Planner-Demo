/**
 * altitudeColors.ts — Shared MSL altitude-based colour mapping.
 *
 * Single source of truth used by both:
 *   • 2D Mapbox map   (DroneTrailRenderer)
 *   • 3D Cesium overlay (OverlayRenderer)
 *
 * Colour scale (0 → 5000 m MSL):
 *   black → deep red → orange-red → orange → amber → yellow → yellow-green →
 *   vibrant green → teal → cyan → light blue → sky → deep blue →
 *   indigo → purple → magenta → pink → white
 * Fully continuous — no discrete steps or range switches.
 * Change this file to update coloring in both views simultaneously.
 */

export interface RGBColor { r: number; g: number; b: number }

/** MSL altitude (m) at the start of the colour scale. */
export const ALT_COLOUR_MIN_M = 0
/** MSL altitude (m) at the end of the colour scale. */
export const ALT_COLOUR_MAX_M = 5000

/**
 * Perceptually-rich rainbow gradient over [0, 5000] m MSL.
 * The interpolation engine handles any number of stops automatically.
 */
export const ALTITUDE_COLOR_STOPS: ReadonlyArray<RGBColor> = [
  { r: 255, g: 120, b:   0 },   //  0/17 –   0 m  – orange         #ff7800
  { r: 255, g: 120, b:   0 },   //  4/17 – 235 m  – orange         #ff7800
  { r: 255, g: 190, b:   0 },   //  5/17 – 294 m  – amber          #ffbe00
  { r: 240, g: 255, b:   0 },   //  6/17 – 353 m  – yellow         #f0ff00
  { r: 120, g: 255, b:   0 },   //  7/17 – 412 m  – yellow-green   #78ff00
  { r:   0, g: 230, b: 118 },   //  8/17 – 471 m  – vibrant green  #00e676
  { r:   0, g: 200, b: 160 },   //  9/17 – 529 m  – teal           #00c8a0
  { r:   0, g: 229, b: 255 },   // 10/17 – 588 m  – cyan           #00e5ff
  { r:  64, g: 196, b: 255 },   // 11/17 – 647 m  – light blue     #40c4ff
  { r:  41, g: 121, b: 255 },   // 12/17 – 706 m  – sky blue       #2979ff
  { r:  21, g:  51, b: 192 },   // 13/17 – 765 m  – deep blue      #1533c0
  { r:  63, g:   0, b: 210 },   // 14/17 – 824 m  – indigo         #3f00d2
  { r: 156, g:  39, b: 176 },   // 15/17 – 882 m  – purple         #9c27b0
  { r: 255, g:  64, b: 210 },   // 16/17 – 941 m  – magenta-pink   #ff40d2
] as const

/**
 * Map an MSL altitude in metres to a continuously-interpolated RGB colour.
 * Input is clamped to [0, 5000] m MSL; invalid/NaN values fall back to 0 m.
 *
 * This is the single colour mapping used for all trajectory rendering
 * (2D Mapbox and 3D Cesium). Barometric altitude adjusted to local pressure
 * should be passed directly — no AGL conversion is applied here.
 */
export function getColorFromMSL(mslAlt: number): RGBColor {
  const alt    = isFinite(mslAlt) ? Math.max(0, Math.min(ALT_COLOUR_MAX_M, mslAlt)) : 0
  const t      = alt / ALT_COLOUR_MAX_M
  const stops  = ALTITUDE_COLOR_STOPS
  const scaled = t * (stops.length - 1)
  const lo     = Math.min(Math.floor(scaled), stops.length - 2)
  const frac   = scaled - lo
  const a = stops[lo], b = stops[lo + 1]
  return {
    r: a.r + (b.r - a.r) * frac,
    g: a.g + (b.g - a.g) * frac,
    b: a.b + (b.b - a.b) * frac,
  }
}

/** Backward-compatible alias — new code should call getColorFromMSL directly. */
export const getAltitudeColor = getColorFromMSL

/** Compose a CSS `rgba()` string from an RGBColor and an alpha value [0..1]. */
export function toRGBA(c: RGBColor, alpha = 1): string {
  return `rgba(${c.r | 0},${c.g | 0},${c.b | 0},${alpha})`
}

/** Compose a CSS hex colour string from an RGBColor (no alpha channel). */
export function toHex(c: RGBColor): string {
  const hex = (v: number) => Math.min(255, Math.max(0, v | 0)).toString(16).padStart(2, '0')
  return `#${hex(c.r)}${hex(c.g)}${hex(c.b)}`
}
