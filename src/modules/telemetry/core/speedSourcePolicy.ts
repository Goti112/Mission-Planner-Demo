export const SpeedSource = {
  GPS: 'GPS',
  VFR_FALLBACK: 'VFR_FALLBACK',
  STALE_HOLD: 'STALE_HOLD',
  INVALID: 'INVALID',
} as const;

export type SpeedSource = typeof SpeedSource[keyof typeof SpeedSource];

export interface SpeedPolicyInput {
  nowMs: number;
  gpsSpeedMs: number | null;
  vfrSpeedMs: number | null;
  lastGpsMs: number;
  lastVfrMs: number;
  prevSpeedMs: number;
  gpsFreshMs: number;
  vfrFreshMs: number;
  holdMs: number;
}

export interface SpeedPolicyOutput {
  speedMs: number;
  source: SpeedSource;
  valid: boolean;
}

const finiteOrNull = (v: number | null): number | null =>
  v == null || !Number.isFinite(v) ? null : v;

export function chooseGroundSpeed(input: SpeedPolicyInput): SpeedPolicyOutput {
  const gps = finiteOrNull(input.gpsSpeedMs);
  const vfr = finiteOrNull(input.vfrSpeedMs);

  const gpsFresh = input.lastGpsMs > 0 && input.nowMs - input.lastGpsMs <= input.gpsFreshMs;
  const vfrFresh = input.lastVfrMs > 0 && input.nowMs - input.lastVfrMs <= input.vfrFreshMs;

  if (gpsFresh && gps != null) {
    return { speedMs: Math.max(0, gps), source: SpeedSource.GPS, valid: true };
  }

  if (vfrFresh && vfr != null) {
    return { speedMs: Math.max(0, vfr), source: SpeedSource.VFR_FALLBACK, valid: true };
  }

  const lastFreshMs = Math.max(input.lastGpsMs, input.lastVfrMs);
  if (lastFreshMs > 0 && input.nowMs - lastFreshMs <= input.holdMs) {
    return {
      speedMs: Math.max(0, input.prevSpeedMs),
      source: SpeedSource.STALE_HOLD,
      valid: false,
    };
  }

  return { speedMs: 0, source: SpeedSource.INVALID, valid: false };
}

