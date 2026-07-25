import { describe, expect, it } from 'vitest';

import type {
  FlightLogFormat,
  ReplayDataset,
  ReplayImportResult,
} from '../logImportTypes';

describe('logImportTypes', () => {
  it('allows a successful replay import result with dataset and recordings', () => {
    const format: FlightLogFormat = 'DATAFLASH_BIN';
    const dataset: ReplayDataset = {
      source: {
        fileName: 'flight.bin',
        byteLength: 128,
        format,
        parser: 'browser',
        importedAt: 1234,
        originalFileAvailable: true,
      },
      diagnostics: {
        decodedFrames: 2,
        corruptFrames: 0,
        unknownMessages: 0,
        supportedMessages: 2,
        warnings: [],
      },
      vehicles: {},
      events: [],
      plotSeries: [],
    };
    const result: ReplayImportResult = {
      ok: true,
      dataset,
      recordings: {},
    };

    expect(result.ok).toBe(true);
    expect(result.dataset.source.format).toBe('DATAFLASH_BIN');
  });
});
