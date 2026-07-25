import { describe, expect, it } from 'vitest';

import { FeedforwardEngine, DEFAULT_FF_CONFIG } from '../FeedforwardEngine';
import type { FlightTelemetry } from '../FlightTelemetryModel';
import { DEFAULT_FLIGHT_TELEMETRY } from '../FlightTelemetryModel';

function makeTelemetry(timestamp: number): FlightTelemetry {
  return {
    ...DEFAULT_FLIGHT_TELEMETRY,
    timestamp,
    controlSurfacesSource: 'SERVO_OUTPUT_RAW',
    statusTextMessages: [{
      severity: 3,
      text: 'PreArm: GPS 1: not healthy',
      receivedAtMs: timestamp,
      id: null,
      chunkSeq: null,
    }],
  };
}

describe('FeedforwardEngine passthrough fields', () => {
  it('preserves autopilot status text messages while extrapolating', () => {
    const engine = new FeedforwardEngine(DEFAULT_FF_CONFIG);
    const first = makeTelemetry(1000);
    const second = makeTelemetry(1100);
    const out = makeTelemetry(0);

    engine.recordSnapshot(first, 0);
    engine.recordSnapshot(second, 100);
    engine.extrapolate(second, out, 116);

    expect(out.statusTextMessages).toBe(second.statusTextMessages);
    expect(out.controlSurfacesSource).toBe('SERVO_OUTPUT_RAW');
  });
});
