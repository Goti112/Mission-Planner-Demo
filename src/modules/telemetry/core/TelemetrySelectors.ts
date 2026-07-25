/**
 * TelemetrySelectors.ts
 *
 * Pure, side-effect-free selector and formatting functions for drone telemetry.
 * No React, no store subscriptions — safe to call from any context.
 *
 * Import these instead of repeating threshold calculations across components.
 */

// ── Battery ───────────────────────────────────────────────────────────────────

/**
 * Returns the CSS variable for a battery percentage level.
 * Thresholds: >50% → success (green), >20% → warning (amber), ≤20% → danger (red).
 */
export function getBatteryColor(pct: number): string {
  if (pct > 50) return 'var(--rohu-success)';
  if (pct > 20) return 'var(--rohu-warning)';
  return 'var(--rohu-danger)';
}

/** Discrete battery level used to select an icon variant. */
export type BatteryLevel = 'high' | 'medium' | 'low';

/**
 * Maps a battery percentage to a discrete level.
 * Thresholds: >50% → 'high', >20% → 'medium', ≤20% → 'low'.
 */
export function getBatteryLevel(pct: number): BatteryLevel {
  if (pct > 50) return 'high';
  if (pct > 20) return 'medium';
  return 'low';
}

// ── Formatting ────────────────────────────────────────────────────────────────

/**
 * Formats altitude (metres) to a display string.
 * @param altMetres  Altitude in metres AGL or MSL.
 * @param decimals   Decimal places — default 1.
 */
export function formatAltitude(altMetres: number, decimals = 1): string {
  return `${altMetres.toFixed(decimals)} m`;
}

/** Formats speed (m/s) to a display string in km/h. */
export function formatSpeed(speedMs: number, decimals = 1): string {
  return `${(speedMs * 3.6).toFixed(decimals)} km/h`;
}

/**
 * Formats distance (metres) to a human-readable string.
 * Values ≥ 1 000 m are rendered in km with two decimal places.
 */
export function formatDistance(distMetres: number): string {
  if (distMetres >= 1_000) return `${(distMetres / 1_000).toFixed(2)} km`;
  return `${distMetres.toFixed(0)} m`;
}

/**
 * Formats an ETA in seconds to mm:ss (or hh:mm:ss when ≥ 1 hour).
 */
export function formatEta(etaSeconds: number): string {
  const h = Math.floor(etaSeconds / 3_600);
  const m = Math.floor((etaSeconds % 3_600) / 60);
  const s = Math.floor(etaSeconds % 60);
  const pad = (v: number) => String(v).padStart(2, '0');
  if (h > 0) return `${pad(h)}:${pad(m)}:${pad(s)}`;
  return `${pad(m)}:${pad(s)}`;
}
