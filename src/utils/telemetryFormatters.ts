/**
 * telemetryFormatters.ts
 *
 * Pure, stateless display formatters for flight telemetry values.
 * Extracted from TelemetryPanelAdvanced so they can be reused across panels
 * without carrying React component context.
 */

import { KM_THRESHOLD, TRACK_ERROR_DEADBAND_DEG } from '../shared/config/constants';
import { GPSFixType } from '../modules/telemetry';

// ── Distance ──────────────────────────────────────────────────────────────

/** Formats metres to a human-readable distance string (e.g. "1.24 km" / "340 m"). */
export function fmtDist(m: number | null | undefined): string {
  if (m == null || !Number.isFinite(m)) return '--';
  if (m >= KM_THRESHOLD) return `${(m / 1000).toFixed(2)} km`;
  return `${Math.round(m)} m`;
}

// ── Duration ─────────────────────────────────────────────────────────────

/** Formats seconds to a readable duration ("2h 05m" / "3m 45s"). */
export function fmtEta(s: number | undefined): string {
  if (s == null || !Number.isFinite(s) || s < 0) return '--';
  const h   = Math.floor(s / 3600);
  const m   = Math.floor((s % 3600) / 60);
  const sec = Math.floor(s % 60);
  if (h > 0) return `${h}h ${m.toString().padStart(2, '0')}m`;
  return `${m}m ${sec.toString().padStart(2, '0')}s`;
}

// ── Numeric ───────────────────────────────────────────────────────────────

/** Formats a nullable number to a fixed number of decimal places, or "--". */
export function fmt(v: number | null | undefined, dec: number): string {
  if (v == null || !Number.isFinite(v)) return '--';
  return v.toFixed(dec);
}

// ── Coordinate ────────────────────────────────────────────────────────────

/** Formats a lat/lon coordinate to 6 decimal places, or "--" when non-finite. */
export function fmtCoord(v: number): string {
  return Number.isFinite(v) ? v.toFixed(6) : '--';
}

// ── Track error ───────────────────────────────────────────────────────────

/**
 * Returns the signed cross-track error as a human label.
 * Positive = right of track, negative = left.
 * Values within the deadband are shown as "ON TRK".
 */
export function trkErr(cog: number | null, wpBrg: number | null): string {
  if (cog == null || wpBrg == null) return '--';
  const err = ((cog - wpBrg) + 540) % 360 - 180;
  const abs = Math.abs(err);
  if (abs < TRACK_ERROR_DEADBAND_DEG) return 'ON TRK';
  return `${err > 0 ? 'R' : 'L'} ${abs.toFixed(0)}°`;
}

// ── Electrical ────────────────────────────────────────────────────────────

/** "12.4V"  — null/NaN → "--" */
export function fmtVoltage(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return '--';
  return `${v.toFixed(1)}V`;
}

/** "8.3A"  — null/NaN → "--" */
export function fmtAmpere(a: number | null | undefined): string {
  if (a == null || !Number.isFinite(a)) return '--';
  return `${a.toFixed(1)}A`;
}

/** "1240 mAh"  — null/NaN → "--" */
export function fmtMah(mah: number | null | undefined): string {
  if (mah == null || !Number.isFinite(mah)) return '--';
  return `${Math.round(mah)} mAh`;
}

// ── Motion ────────────────────────────────────────────────────────────────

/** "8.4 m/s"  — null/NaN → "--" */
export function fmtSpeed(ms: number | null | undefined): string {
  if (ms == null || !Number.isFinite(ms)) return '--';
  return `${ms.toFixed(1)} m/s`;
}

/** "30.2 km/h"  — null/NaN → "--" */
export function fmtSpeedKmh(ms: number | null | undefined): string {
  if (ms == null || !Number.isFinite(ms)) return '--';
  return `${(ms * 3.6).toFixed(1)} km/h`;
}

/** "045°"  — null/NaN → "--"  (pads to 3 digits) */
export function fmtAngle(deg: number | null | undefined): string {
  if (deg == null || !Number.isFinite(deg)) return '--';
  return `${Math.round(((deg % 360) + 360) % 360).toString().padStart(3, '0')}°`;
}

/** "87%"  — null/NaN → "--" */
export function fmtPercent(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return '--';
  return `${Math.round(v)}%`;
}

// ── GPS ───────────────────────────────────────────────────────────────────

const GPS_FIX_LABELS: Record<number, string> = {
  [GPSFixType.NO_GPS]:    'NO GPS',
  [GPSFixType.NO_FIX]:    'NO FIX',
  [GPSFixType.FIX_2D]:    '2D FIX',
  [GPSFixType.FIX_3D]:    '3D FIX',
  [GPSFixType.DGPS]:      'DGPS',
  [GPSFixType.RTK_FLOAT]: 'RTK FLT',
  [GPSFixType.RTK_FIXED]: 'RTK FIX',
  [GPSFixType.STATIC]:    'STATIC',
  [GPSFixType.PPP]:       'PPP',
};

/** Human GPS fix type label — e.g. "3D FIX" / "RTK FIX" / "NO GPS" */
export function fmtGPSFix(fixType: number): string {
  return GPS_FIX_LABELS[fixType] ?? 'UNKNOWN';
}

/** "14"  — 255 (UINT8_MAX sentinel) → "--" */
export function fmtSats(n: number | null | undefined): string {
  if (n == null || n === 255) return '--';
  return `${n}`;
}

/** DOP value: 0.8 → "0.80",  null or sentinel (>99) → "--" */
export function fmtDOP(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v) || v > 99) return '--';
  return v.toFixed(2);
}

// ── Link ──────────────────────────────────────────────────────────────────

/** Formats duration since last heartbeat: "0.8s" / "12s" / "2m 05s" */
export function fmtHeartbeat(elapsedMs: number): string {
  if (!isFinite(elapsedMs)) return '--';
  const s = Math.max(0, elapsedMs) / 1000;
  if (s < 10) return `${s.toFixed(1)}s`;
  if (s < 60) return `${Math.round(s)}s`;
  return `${Math.floor(s / 60)}m ${Math.round(s % 60).toString().padStart(2,'0')}s`;
}
