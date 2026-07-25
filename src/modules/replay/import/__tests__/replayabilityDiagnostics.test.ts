import { describe, expect, it } from 'vitest';

import { describeReplayImportFailure } from '../replayabilityDiagnostics';
import type { DecodedLogMessage, ReplayImportDiagnostics } from '../logImportTypes';

const diagnostics: ReplayImportDiagnostics = {
  decodedFrames: 1,
  corruptFrames: 0,
  unknownMessages: 0,
  supportedMessages: 1,
  warnings: [],
};

function message(type: string, payload: Record<string, unknown>, relativeTimeMs: number | null): DecodedLogMessage {
  return {
    source: 'MAVLINK',
    type,
    messageId: type,
    sysId: 1,
    compId: 1,
    timestampMs: null,
    relativeTimeMs,
    payload,
    byteOffset: 0,
    byteLength: null,
    warnings: [],
  };
}

describe('describeReplayImportFailure', () => {
  it('reports missing timestamps when position exists without time', () => {
    const error = describeReplayImportFailure([
      message('GLOBAL_POSITION_INT', { lat: 40, lng: -3, altitudeRelativeM: 100 }, null),
    ], diagnostics);

    expect(error).toContain('timestamps');
  });

  it('reports missing position when messages decode without track data', () => {
    const error = describeReplayImportFailure([
      message('ATTITUDE', { rollDeg: 1, pitchDeg: 2, yawDeg: 3 }, 1000),
    ], diagnostics);

    expect(error).toContain('posición');
  });

  it('reports empty decoded data when no messages exist', () => {
    const error = describeReplayImportFailure([], { ...diagnostics, decodedFrames: 0 });

    expect(error).toContain('No se encontraron mensajes');
  });
});
