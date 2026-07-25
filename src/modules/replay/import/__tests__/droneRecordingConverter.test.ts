import { describe, expect, it } from 'vitest';

import { convertDatasetToRecordings } from '../droneRecordingConverter';
import type { ReplayDataset } from '../logImportTypes';
import { F, FRAME_FIELDS } from '../../store/flightRecorderStore';

function dataset(): ReplayDataset {
  return {
    source: { fileName: 'flight.bin', byteLength: 1, format: 'DATAFLASH_BIN', parser: 'browser', importedAt: 1, originalFileAvailable: true },
    diagnostics: { decodedFrames: 2, corruptFrames: 0, unknownMessages: 0, supportedMessages: 2, warnings: [] },
    events: [],
    plotSeries: [],
    vehicles: {
      'sys-1': {
        vehicleId: 'sys-1',
        sysId: 1,
        compIds: [1],
        messageCounts: {},
        summary: {
          durationSec: 1,
          distanceM: 0,
          minAltitudeM: 100,
          maxAltitudeM: 110,
          maxGroundspeedMs: 8,
          averageGroundspeedMs: 8,
          initialBatteryPercent: 99,
          finalBatteryPercent: 98,
          gpsFixCoveragePercent: null,
          flightModes: [],
        },
        track: [
          {
            timestampMs: 1000,
            lat: 40,
            lng: -3,
            altitudeM: 100,
            rollDeg: 1,
            pitchDeg: 2,
            yawDeg: 90,
            airspeedMs: 7,
            groundspeedMs: 8,
            batteryPercent: 99,
            vxMs: 1,
            vyMs: 0,
            vzMs: 0,
          },
          {
            timestampMs: 1050,
            lat: 40.1,
            lng: -3.1,
            altitudeM: 110,
            rollDeg: 2,
            pitchDeg: 3,
            yawDeg: 91,
            airspeedMs: 8,
            groundspeedMs: 9,
            batteryPercent: 98,
            vxMs: 1,
            vyMs: 1,
            vzMs: 0,
          },
        ],
      },
    },
  };
}

describe('convertDatasetToRecordings', () => {
  it('converts replay track samples into DroneRecording buffers', () => {
    const recordings = convertDatasetToRecordings(dataset());
    const rec = recordings['sys-1'];

    expect(rec.droneId).toBe('sys-1');
    expect(rec.total).toBe(2);
    expect(rec.frames[0 * FRAME_FIELDS + F.LAT]).toBeCloseTo(40);
    expect(rec.frames[1 * FRAME_FIELDS + F.LNG]).toBeCloseTo(-3.1);
    expect(rec.timestamps[0]).toBe(1000);
  });
});
