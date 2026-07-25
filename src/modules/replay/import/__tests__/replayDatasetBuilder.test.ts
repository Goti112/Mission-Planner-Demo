import { describe, expect, it } from 'vitest';

import { buildReplayDataset } from '../replayDatasetBuilder';
import type { DecodedLogMessage, ReplayLogSource } from '../logImportTypes';

const source: ReplayLogSource = {
  fileName: 'flight.bin',
  byteLength: 1000,
  format: 'DATAFLASH_BIN',
  parser: 'browser',
  importedAt: 123,
  originalFileAvailable: true,
};

function message(type: string, timestampMs: number | null, payload: Record<string, unknown>): DecodedLogMessage {
  return {
    source: 'DATAFLASH',
    type,
    messageId: type,
    sysId: 1,
    compId: null,
    timestampMs,
    relativeTimeMs: timestampMs,
    payload,
    byteOffset: timestampMs ?? 0,
    byteLength: null,
    warnings: [],
  };
}

describe('buildReplayDataset', () => {
  it('builds a replayable vehicle track from GPS and ATT messages', () => {
    const dataset = buildReplayDataset(source, [
      message('GPS', 1000, { lat: 40, lng: -3, altitudeM: 100, groundspeedMs: 8, headingDeg: 90, status: 3 }),
      message('ATT', 1000, { rollDeg: 1, pitchDeg: 2, yawDeg: 90 }),
      message('GPS', 2000, { lat: 40.0001, lng: -3.0001, altitudeM: 105, groundspeedMs: 9, headingDeg: 91, status: 3 }),
      message('ATT', 2000, { rollDeg: 2, pitchDeg: 3, yawDeg: 91 }),
    ], {
      decodedFrames: 4,
      corruptFrames: 0,
      unknownMessages: 0,
      supportedMessages: 4,
      warnings: [],
    });

    const vehicle = dataset.vehicles['sys-1'];

    expect(vehicle.track).toHaveLength(2);
    expect(vehicle.summary.durationSec).toBe(1);
    expect(vehicle.summary.maxGroundspeedMs).toBe(9);
    expect(dataset.plotSeries.some((series) => series.id === 'sys-1:GPS:altitudeM')).toBe(true);
  });

  it('creates event markers from MSG records', () => {
    const dataset = buildReplayDataset(source, [
      message('MSG', 1500, { message: 'ArduPilot Ready' }),
    ], {
      decodedFrames: 1,
      corruptFrames: 0,
      unknownMessages: 0,
      supportedMessages: 1,
      warnings: [],
    });

    expect(dataset.events[0]).toMatchObject({
      timestampMs: 1500,
      label: 'MSG',
      detail: 'ArduPilot Ready',
    });
  });

  it('builds tracks and plots from relative-only MAVLink timestamps', () => {
    const dataset = buildReplayDataset(
      { fileName: 'flight.tlog', byteLength: 100, format: 'MAVLINK_TLOG', parser: 'browser', importedAt: 123, originalFileAvailable: true },
      [
        {
          source: 'MAVLINK',
          type: 'GLOBAL_POSITION_INT',
          messageId: 33,
          sysId: 1,
          compId: 1,
          timestampMs: null,
          relativeTimeMs: 1000,
          payload: { lat: 40, lng: -3, altitudeRelativeM: 100, headingDeg: 90 },
          byteOffset: 0,
          byteLength: 28,
          warnings: [],
        },
        {
          source: 'MAVLINK',
          type: 'GLOBAL_POSITION_INT',
          messageId: 33,
          sysId: 1,
          compId: 1,
          timestampMs: null,
          relativeTimeMs: 2000,
          payload: { lat: 40.0001, lng: -3.0001, altitudeRelativeM: 105, headingDeg: 91 },
          byteOffset: 28,
          byteLength: 28,
          warnings: [],
        },
      ],
      { decodedFrames: 2, corruptFrames: 0, unknownMessages: 0, supportedMessages: 2, warnings: [] },
    );

    expect(dataset.vehicles['sys-1'].track).toHaveLength(2);
    expect(dataset.vehicles['sys-1'].track[0].timestampMs).toBe(1000);
    expect(dataset.plotSeries.some((series) => series.id === 'sys-1:GLOBAL_POSITION_INT:altitudeRelativeM')).toBe(true);
  });

  it('builds a replayable vehicle track from Rohu sample messages', () => {
    const dataset = buildReplayDataset(
      { fileName: 'sample.tlog', byteLength: 100, format: 'ROHU_TLOG', parser: 'browser', importedAt: 123, originalFileAvailable: true },
      [
        {
          source: 'ROHU',
          type: 'ROHU_SAMPLE',
          messageId: 'ROHU_SAMPLE',
          sysId: 1,
          compId: null,
          timestampMs: 1500,
          relativeTimeMs: 1000,
          payload: { lat: 40, lng: -3, altitudeM: 100, rollDeg: 1, pitchDeg: 2, yawDeg: 90 },
          byteOffset: 0,
          byteLength: null,
          warnings: [],
        },
        {
          source: 'ROHU',
          type: 'ROHU_SAMPLE',
          messageId: 'ROHU_SAMPLE',
          sysId: 1,
          compId: null,
          timestampMs: 2500,
          relativeTimeMs: 2000,
          payload: { lat: 40.0001, lng: -3.0001, altitudeM: 105, rollDeg: 2, pitchDeg: 3, yawDeg: 91 },
          byteOffset: 0,
          byteLength: null,
          warnings: [],
        },
      ],
      { decodedFrames: 2, corruptFrames: 0, unknownMessages: 0, supportedMessages: 2, warnings: [] },
    );

    expect(dataset.vehicles['sys-1'].track).toHaveLength(2);
    expect(dataset.vehicles['sys-1'].summary.maxAltitudeM).toBe(105);
  });
});
