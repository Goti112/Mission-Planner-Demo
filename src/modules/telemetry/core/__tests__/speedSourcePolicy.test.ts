import { describe, expect, it } from 'vitest';
import { chooseGroundSpeed, SpeedSource } from '../speedSourcePolicy';

describe('speedSourcePolicy', () => {
  it('prefers GPS when GLOBAL_POSITION_INT is fresh', () => {
    const out = chooseGroundSpeed({
      nowMs: 10_000,
      gpsSpeedMs: 12.3,
      vfrSpeedMs: 11.1,
      lastGpsMs: 9_950,
      lastVfrMs: 9_980,
      prevSpeedMs: 10,
      gpsFreshMs: 250,
      vfrFreshMs: 400,
      holdMs: 300,
    });

    expect(out.source).toBe(SpeedSource.GPS);
    expect(out.speedMs).toBeCloseTo(12.3, 5);
    expect(out.valid).toBe(true);
  });

  it('falls back to VFR when GPS is stale and VFR is fresh', () => {
    const out = chooseGroundSpeed({
      nowMs: 10_000,
      gpsSpeedMs: 15,
      vfrSpeedMs: 9.7,
      lastGpsMs: 9_400,
      lastVfrMs: 9_900,
      prevSpeedMs: 8.9,
      gpsFreshMs: 250,
      vfrFreshMs: 400,
      holdMs: 300,
    });

    expect(out.source).toBe(SpeedSource.VFR_FALLBACK);
    expect(out.speedMs).toBeCloseTo(9.7, 5);
    expect(out.valid).toBe(true);
  });

  it('holds previous speed briefly before marking invalid', () => {
    const out = chooseGroundSpeed({
      nowMs: 10_000,
      gpsSpeedMs: null,
      vfrSpeedMs: null,
      lastGpsMs: 9_500,
      lastVfrMs: 9_500,
      prevSpeedMs: 7.2,
      gpsFreshMs: 250,
      vfrFreshMs: 400,
      holdMs: 700,
    });

    expect(out.source).toBe(SpeedSource.STALE_HOLD);
    expect(out.speedMs).toBeCloseTo(7.2, 5);
    expect(out.valid).toBe(false);
  });

  it('marks INVALID after hold window expires', () => {
    const out = chooseGroundSpeed({
      nowMs: 10_000,
      gpsSpeedMs: null,
      vfrSpeedMs: null,
      lastGpsMs: 8_000,
      lastVfrMs: 8_000,
      prevSpeedMs: 7.2,
      gpsFreshMs: 250,
      vfrFreshMs: 400,
      holdMs: 700,
    });

    expect(out.source).toBe(SpeedSource.INVALID);
    expect(out.speedMs).toBe(0);
    expect(out.valid).toBe(false);
  });
});

