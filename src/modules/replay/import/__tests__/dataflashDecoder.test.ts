import { describe, expect, it } from 'vitest';

import { decodeDataflashLog } from '../dataflashDecoder';

function fixedAscii(text: string, size: number): number[] {
  const bytes = new TextEncoder().encode(text);
  const out = new Array<number>(size).fill(0);
  for (let index = 0; index < Math.min(bytes.length, size); index++) out[index] = bytes[index];
  return out;
}

function fmtRecord(typeId: number, length: number, name: string, format: string, columns: string): number[] {
  return [
    0xa3,
    0x95,
    0x80,
    typeId,
    length,
    ...fixedAscii(name, 4),
    ...fixedAscii(format, 16),
    ...fixedAscii(columns, 64),
  ];
}

function gpsRecord(): number[] {
  const payload = new ArrayBuffer(4 + 4 + 4 + 4);
  const view = new DataView(payload);
  view.setUint32(0, 1000, true);
  view.setInt32(4, 404168000, true);
  view.setInt32(8, -37038000, true);
  view.setFloat32(12, 120, true);
  return [0xa3, 0x95, 150, ...new Uint8Array(payload)];
}

describe('decodeDataflashLog', () => {
  it('decodes FMT records and subsequent typed records', () => {
    const bytes = Uint8Array.from([
      ...fmtRecord(150, 19, 'GPS', 'Iii f', 'TimeMS,Lat,Lng,Alt'),
      ...gpsRecord(),
    ]);

    const result = decodeDataflashLog(bytes.buffer);

    expect(result.records).toHaveLength(1);
    expect(result.records[0]).toMatchObject({
      type: 'GPS',
      messageId: 150,
      byteOffset: 92,
      fields: {
        TimeMS: 1000,
        Lat: 404168000,
        Lng: -37038000,
        Alt: 120,
      },
    });
    expect(result.diagnostics.decodedFrames).toBe(1);
  });

  it('counts bytes that cannot start a DataFlash record', () => {
    const result = decodeDataflashLog(Uint8Array.from([1, 2, 3]).buffer);

    expect(result.records).toHaveLength(0);
    expect(result.diagnostics.corruptFrames).toBe(3);
  });
});
