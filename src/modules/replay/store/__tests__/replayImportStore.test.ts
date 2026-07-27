import { beforeEach, describe, expect, it } from 'vitest';

import { useReplayImportStore } from '../replayImportStore';

describe('useReplayImportStore', () => {
  beforeEach(() => {
    useReplayImportStore.getState().resetImport();
  });

  it('stores visible import errors', () => {
    useReplayImportStore.getState().setImportError('Archivo inválido');

    expect(useReplayImportStore.getState().status).toBe('ERROR');
    expect(useReplayImportStore.getState().error).toBe('Archivo inválido');
  });

  it('stores selected plot series ids', () => {
    useReplayImportStore.getState().setSelectedPlotSeries(['sys-1:ATT:rollDeg']);

    expect(useReplayImportStore.getState().selectedPlotSeriesIds).toEqual(['sys-1:ATT:rollDeg']);
  });

  it('stores import source parser metadata when import is ready', () => {
    useReplayImportStore.getState().resetImport();

    useReplayImportStore.getState().setImportReady({
      source: {
        fileName: 'flight.tlog',
        byteLength: 100,
        format: 'MISSION_TLOG',
        parser: 'browser',
        importedAt: 1,
        originalFileAvailable: true,
      },
      diagnostics: { decodedFrames: 0, corruptFrames: 0, unknownMessages: 0, supportedMessages: 0, warnings: [] },
      vehicles: {},
      events: [],
      plotSeries: [],
    });

    expect(useReplayImportStore.getState().dataset?.source).toMatchObject({
      format: 'MISSION_TLOG',
      parser: 'browser',
      originalFileAvailable: true,
    });
  });
});
