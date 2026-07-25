import { describe, expect, it } from 'vitest';

import { decodeDataflashRecord } from '../dataflashMessageCatalog';
import type { DataflashRecord } from '../dataflashDecoder';

function record(type: string, fields: Record<string, number | string>): DataflashRecord {
  return {
    messageId: type === 'GPS' ? 150 : 151,
    type,
    byteOffset: 20,
    fields,
  };
}

describe('decodeDataflashRecord', () => {
  it('normalizes GPS records for replay and plots', () => {
    const decoded = decodeDataflashRecord(record('GPS', {
      TimeMS: 1000,
      Lat: 404168000,
      Lng: -37038000,
      Alt: 120,
      Spd: 8.5,
      GCrs: 90,
      Status: 3,
    }));

    expect(decoded.type).toBe('GPS');
    expect(decoded.timestampMs).toBe(1000);
    expect(decoded.relativeTimeMs).toBe(1000);
    expect(decoded.payload).toMatchObject({
      lat: 40.4168,
      lng: -3.7038,
      altitudeM: 120,
      groundspeedMs: 8.5,
      headingDeg: 90,
      status: 3,
    });
  });

  it('normalizes ATT records for replay and plots', () => {
    const decoded = decodeDataflashRecord(record('ATT', {
      TimeMS: 1200,
      Roll: 5,
      Pitch: -2,
      Yaw: 181,
    }));

    expect(decoded.type).toBe('ATT');
    expect(decoded.timestampMs).toBe(1200);
    expect(decoded.relativeTimeMs).toBe(1200);
    expect(decoded.payload).toMatchObject({
      rollDeg: 5,
      pitchDeg: -2,
      yawDeg: 181,
    });
  });
});
