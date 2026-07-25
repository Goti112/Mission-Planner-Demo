import { describe, expect, it } from 'vitest';

import { MockTelemetrySource, TelemetryManager } from '../TelemetryManager';
import type { TelemetryRawData } from '../FlightTelemetryModel';

describe('TelemetryManager autopilot status text', () => {
  it('keeps recent STATUSTEXT messages in the latest telemetry snapshot', () => {
    const source = new MockTelemetrySource();
    const manager = new TelemetryManager(source, { emitAllFrames: true });

    source.inject({
      capturedAt: 1234,
      sysId: 1,
      compId: 1,
      statusText: {
        severity: 3,
        text: 'PreArm: GPS 1: not healthy',
        receivedAtMs: 1234,
        id: 42,
        chunkSeq: 0,
      },
    } as unknown as TelemetryRawData);

    const latestTelemetry = manager.latestTelemetry as unknown as {
      readonly statusTextMessages?: readonly {
        readonly severity: number;
        readonly text: string;
        readonly receivedAtMs: number;
      }[];
    };

    expect(latestTelemetry.statusTextMessages).toEqual([
      expect.objectContaining({
        severity: 3,
        text: 'PreArm: GPS 1: not healthy',
        receivedAtMs: 1234,
      }),
    ]);

    manager.destroy();
  });

  it('expires stale STATUSTEXT messages from later telemetry snapshots', () => {
    const source = new MockTelemetrySource();
    const manager = new TelemetryManager(source, { emitAllFrames: true });

    source.inject({
      capturedAt: 1000,
      sysId: 1,
      compId: 1,
      statusText: {
        severity: 3,
        text: 'PreArm: GPS 1: not healthy',
        receivedAtMs: 1000,
        id: null,
        chunkSeq: null,
      },
    } as TelemetryRawData);
    source.inject({
      capturedAt: 40_001,
      sysId: 1,
      compId: 1,
    } as TelemetryRawData);

    expect(manager.latestTelemetry.statusTextMessages).toEqual([]);

    manager.destroy();
  });
});
