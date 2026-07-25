import type { DecodedLogMessage } from './logImportTypes';
import type { DataflashRecord } from './dataflashDecoder';

function numberField(fields: Record<string, number | string>, name: string): number | null {
  const value = fields[name];
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function timestampFrom(fields: Record<string, number | string>): number | null {
  return numberField(fields, 'TimeUS') !== null
    ? (numberField(fields, 'TimeUS') as number) / 1000
    : numberField(fields, 'TimeMS');
}

function baseMessage(record: DataflashRecord, type: string, payload: Record<string, unknown>): DecodedLogMessage {
  const timestampMs = timestampFrom(record.fields);

  return {
    source: 'DATAFLASH',
    type,
    messageId: record.messageId,
    sysId: 1,
    compId: null,
    timestampMs,
    relativeTimeMs: timestampMs,
    payload,
    rawPayload: { ...record.fields },
    byteOffset: record.byteOffset,
    byteLength: null,
    warnings: [],
  };
}

function decodeGps(record: DataflashRecord): DecodedLogMessage {
  const lat = numberField(record.fields, 'Lat');
  const lng = numberField(record.fields, 'Lng');
  return baseMessage(record, 'GPS', {
    lat: lat === null ? null : lat / 1e7,
    lng: lng === null ? null : lng / 1e7,
    altitudeM: numberField(record.fields, 'Alt'),
    groundspeedMs: numberField(record.fields, 'Spd'),
    headingDeg: numberField(record.fields, 'GCrs'),
    status: numberField(record.fields, 'Status'),
  });
}

function decodeAtt(record: DataflashRecord): DecodedLogMessage {
  return baseMessage(record, 'ATT', {
    rollDeg: numberField(record.fields, 'Roll'),
    pitchDeg: numberField(record.fields, 'Pitch'),
    yawDeg: numberField(record.fields, 'Yaw'),
  });
}

function decodeBat(record: DataflashRecord): DecodedLogMessage {
  return baseMessage(record, 'BAT', {
    voltageV: numberField(record.fields, 'Volt'),
    currentA: numberField(record.fields, 'Curr'),
    consumedMah: numberField(record.fields, 'CurrTot'),
  });
}

function decodeMode(record: DataflashRecord): DecodedLogMessage {
  return baseMessage(record, 'MODE', {
    mode: record.fields['Mode'] ?? record.fields['ModeNum'] ?? 'UNKNOWN',
    modeNum: numberField(record.fields, 'ModeNum'),
  });
}

function decodeMessage(record: DataflashRecord): DecodedLogMessage {
  return baseMessage(record, 'MSG', {
    message: String(record.fields['Message'] ?? ''),
  });
}

export function decodeDataflashRecord(record: DataflashRecord): DecodedLogMessage {
  if (record.type === 'GPS' || record.type === 'GPS2') return decodeGps(record);
  if (record.type === 'ATT') return decodeAtt(record);
  if (record.type === 'BAT' || record.type === 'BAT2') return decodeBat(record);
  if (record.type === 'MODE') return decodeMode(record);
  if (record.type === 'MSG') return decodeMessage(record);
  return baseMessage(record, record.type, { ...record.fields });
}

export function decodeDataflashRecords(records: DataflashRecord[]): DecodedLogMessage[] {
  return records.map((record) => decodeDataflashRecord(record));
}
