import { describe, expect, it } from 'vitest';

import { detectFlightLogFormat } from '../logFormatDetection';

describe('detectFlightLogFormat', () => {
  it('detects Rohu tlog by magic bytes before extension rules', () => {
    const bytes = Uint8Array.from([0x52, 0x4f, 0x48, 0x55, 1, 0, 0, 0]);

    expect(detectFlightLogFormat('flight.tlog', bytes.buffer)).toBe('ROHU_TLOG');
  });

  it('detects DataFlash bin by magic bytes and extension', () => {
    expect(detectFlightLogFormat('flight.unknown', Uint8Array.from([0xa3, 0x95, 0x80]).buffer)).toBe('DATAFLASH_BIN');
    expect(detectFlightLogFormat('flight.bin', new ArrayBuffer(0))).toBe('DATAFLASH_BIN');
  });

  it('detects MAVLink tlog by MAVLink frame magic and extension', () => {
    expect(detectFlightLogFormat('flight.dat', Uint8Array.from([0xfd, 0, 0]).buffer)).toBe('MAVLINK_TLOG');
    expect(detectFlightLogFormat('flight.tlog', new ArrayBuffer(0))).toBe('MAVLINK_TLOG');
  });

  it('detects JSON replay formats by extension', () => {
    expect(detectFlightLogFormat('flight.rohu.json', new ArrayBuffer(0))).toBe('ROHU_JSON');
    expect(detectFlightLogFormat('flight.json', new ArrayBuffer(0))).toBe('ROHU_JSON');
  });
});
