import type { DecodedLogMessage, ReplayImportDiagnostics } from './logImportTypes';

function hasTime(message: DecodedLogMessage): boolean {
  return message.timestampMs !== null || message.relativeTimeMs !== null;
}

function hasPositionPayload(message: DecodedLogMessage): boolean {
  const payload = message.payload;
  return typeof payload.lat === 'number' &&
    typeof payload.lng === 'number' &&
    (
      typeof payload.altitudeM === 'number' ||
      typeof payload.altitudeRelativeM === 'number' ||
      typeof payload.altitudeMslM === 'number'
    );
}

export function describeReplayImportFailure(
  messages: readonly DecodedLogMessage[],
  diagnostics: ReplayImportDiagnostics,
): string {
  if (messages.length === 0 || diagnostics.decodedFrames === 0) {
    return 'No se encontraron mensajes decodificables en el log.';
  }

  if (messages.some(hasPositionPayload) && !messages.some((message) => hasPositionPayload(message) && hasTime(message))) {
    return 'El log contiene datos de posición, pero no contiene timestamps utilizables para reproducir la trayectoria.';
  }

  if (!messages.some(hasPositionPayload)) {
    return 'El log se decodificó, pero no contiene mensajes de posición suficientes para replay visual.';
  }

  return 'No se encontraron datos reproducibles de posición y actitud en el log.';
}
