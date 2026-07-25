import { describe, expect, it } from 'vitest';

import { fmtHeartbeat } from './telemetryFormatters';

describe('fmtHeartbeat', () => {
  it('clamps negative elapsed time to zero', () => {
    expect(fmtHeartbeat(-250)).toBe('0.0s');
  });
});
