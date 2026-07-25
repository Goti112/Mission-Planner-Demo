import { describe, expect, it } from 'vitest';

import { MockTelemetrySource, TelemetryManager } from '../TelemetryManager';
import type { TelemetryRawData } from '../FlightTelemetryModel';

const makeRawTelemetry = (capturedAt: number): TelemetryRawData => ({
  capturedAt,
  sysId: 1,
  compId: 1,
  attitude: {
    timeBootMs: capturedAt,
    roll: 0,
    pitch: 0,
    yaw: 0,
    rollSpeed: 0,
    pitchSpeed: 0,
    yawSpeed: 0,
  },
});

describe('TelemetryManager source errors', () => {
  it('forwards recoverable source errors to manager subscribers', () => {
    const source = new MockTelemetrySource();
    const manager = new TelemetryManager(source);
    const errors: Error[] = [];

    try {
      manager.onError((error) => errors.push(error));

      source.fail(new Error('malformed bridge frame'));

      expect(errors).toHaveLength(1);
      expect(errors[0].message).toBe('malformed bridge frame');
    } finally {
      manager.destroy();
    }
  });

  it('keeps notifying manager telemetry listeners when one listener fails', () => {
    const source = new MockTelemetrySource();
    const manager = new TelemetryManager(source, { emitAllFrames: true });
    const errors: Error[] = [];
    const received: number[] = [];

    try {
      manager.onError((error) => errors.push(error));
      manager.onTelemetry(() => {
        throw new Error('telemetry listener failed');
      });
      manager.onTelemetry((telemetry) => received.push(telemetry.timestamp));

      expect(() => {
        source.inject(makeRawTelemetry(1234));
      }).not.toThrow();

      expect(received).toEqual([1234]);
      expect(errors).toHaveLength(1);
      expect(errors[0].message).toContain('telemetry listener failed');
    } finally {
      manager.destroy();
    }
  });

  it('keeps notifying source data listeners when one listener fails', () => {
    const source = new MockTelemetrySource();
    const errors: Error[] = [];
    const received: number[] = [];

    source.onError((error) => errors.push(error));
    source.onData(() => {
      throw new Error('source listener failed');
    });
    source.onData((raw) => received.push(raw.capturedAt));

    expect(() => {
      source.inject(makeRawTelemetry(5678));
    }).not.toThrow();

    expect(received).toEqual([5678]);
    expect(errors).toHaveLength(1);
    expect(errors[0].message).toContain('source listener failed');
  });
});
