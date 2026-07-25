import { decodeTlog } from '../../mission/services/tlogCodec';
import { F, FRAME_FIELDS, MAX_FRAMES_PER_DRONE } from '../store/flightRecorderStore';
import type { DecodedLogMessage, ReplayImportDiagnostics } from './logImportTypes';

export type RohuTlogDecodeMessagesResult =
  | {
      readonly ok: true;
      readonly messages: readonly DecodedLogMessage[];
      readonly diagnostics: ReplayImportDiagnostics;
    }
  | {
      readonly ok: false;
      readonly error: string;
      readonly diagnostics: ReplayImportDiagnostics;
    };

function emptyDiagnostics(warnings: string[]): ReplayImportDiagnostics {
  return {
    decodedFrames: 0,
    corruptFrames: 0,
    unknownMessages: 0,
    supportedMessages: 0,
    warnings,
  };
}

function sysIdFromIndex(index: number): number {
  return index + 1;
}

export function decodeRohuTlogMessages(buffer: ArrayBuffer): RohuTlogDecodeMessagesResult {
  const decoded = decodeTlog(buffer);

  if (!decoded.ok) {
    return {
      ok: false,
      error: decoded.error,
      diagnostics: emptyDiagnostics([decoded.error]),
    };
  }

  const messages: DecodedLogMessage[] = [];
  Object.values(decoded.recordings).forEach((recording, recordingIndex) => {
    const frameCount = Math.min(recording.total, MAX_FRAMES_PER_DRONE);
    const sysId = sysIdFromIndex(recordingIndex);

    for (let frameIndex = 0; frameIndex < frameCount; frameIndex++) {
      const base = frameIndex * FRAME_FIELDS;
      const relativeTimeMs = recording.timestamps[frameIndex];
      const timestampMs = recording.startedAt + relativeTimeMs;

      messages.push({
        source: 'ROHU',
        type: 'ROHU_SAMPLE',
        messageId: 'ROHU_SAMPLE',
        sysId,
        compId: null,
        timestampMs,
        relativeTimeMs,
        payload: {
          vehicleId: recording.droneId,
          missionName: recording.missionName,
          lat: recording.frames[base + F.LAT],
          lng: recording.frames[base + F.LNG],
          altitudeM: recording.frames[base + F.ALT],
          rollDeg: recording.frames[base + F.ROLL],
          pitchDeg: recording.frames[base + F.PITCH],
          yawDeg: recording.frames[base + F.YAW],
          airspeedMs: recording.frames[base + F.AIRSPEED],
          groundspeedMs: recording.frames[base + F.GROUNDSPEED],
          batteryPercent: recording.frames[base + F.BATTERY],
          vxMs: recording.frames[base + F.VX],
          vyMs: recording.frames[base + F.VY],
          vzMs: recording.frames[base + F.VZ],
        },
        byteOffset: 0,
        byteLength: null,
        warnings: [],
      });
    }
  });

  return {
    ok: true,
    messages,
    diagnostics: {
      decodedFrames: messages.length,
      corruptFrames: 0,
      unknownMessages: 0,
      supportedMessages: messages.length,
      warnings: [],
    },
  };
}
