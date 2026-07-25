import type { ReplayImportDiagnostics } from './logImportTypes';

export interface DataflashFormatDefinition {
  typeId: number;
  length: number;
  name: string;
  format: string;
  columns: string[];
}

export interface DataflashRecord {
  messageId: number;
  type: string;
  byteOffset: number;
  fields: Record<string, number | string>;
}

export interface DataflashDecodeResult {
  records: DataflashRecord[];
  formats: Record<number, DataflashFormatDefinition>;
  diagnostics: ReplayImportDiagnostics;
}

const HEAD_BYTE_1 = 0xa3;
const HEAD_BYTE_2 = 0x95;
const FMT_TYPE_ID = 0x80;
const DATAFLASH_HEADER_LENGTH = 3;
const FMT_PAYLOAD_LENGTH = 86;

interface FieldReader {
  code: string;
  size: number;
  read: (view: DataView, offset: number) => number | string;
}

const FIELD_READERS: Record<string, FieldReader> = {
  b: { code: 'b', size: 1, read: (view, offset) => view.getInt8(offset) },
  B: { code: 'B', size: 1, read: (view, offset) => view.getUint8(offset) },
  h: { code: 'h', size: 2, read: (view, offset) => view.getInt16(offset, true) },
  H: { code: 'H', size: 2, read: (view, offset) => view.getUint16(offset, true) },
  i: { code: 'i', size: 4, read: (view, offset) => view.getInt32(offset, true) },
  I: { code: 'I', size: 4, read: (view, offset) => view.getUint32(offset, true) },
  f: { code: 'f', size: 4, read: (view, offset) => view.getFloat32(offset, true) },
  d: { code: 'd', size: 8, read: (view, offset) => view.getFloat64(offset, true) },
};

function decodeFixedString(bytes: Uint8Array): string {
  const end = bytes.findIndex((byte) => byte === 0);
  const sliceEnd = end >= 0 ? end : bytes.length;
  return new TextDecoder().decode(bytes.subarray(0, sliceEnd)).trim();
}

function normalizeFormat(format: string): string[] {
  return format.replace(/\s/g, '').split('').filter((code) => code.length > 0);
}

function parseFmtRecord(bytes: Uint8Array, payloadOffset: number): DataflashFormatDefinition {
  const view = new DataView(bytes.buffer, bytes.byteOffset + payloadOffset, FMT_PAYLOAD_LENGTH);
  const typeId = view.getUint8(0);
  const length = view.getUint8(1);
  const name = decodeFixedString(bytes.subarray(payloadOffset + 2, payloadOffset + 6));
  const format = decodeFixedString(bytes.subarray(payloadOffset + 6, payloadOffset + 22));
  const columnsRaw = decodeFixedString(bytes.subarray(payloadOffset + 22, payloadOffset + 86));
  const columns = columnsRaw.split(',').map((column) => column.trim()).filter((column) => column.length > 0);
  return { typeId, length, name, format, columns };
}

function parseTypedRecord(bytes: Uint8Array, offset: number, definition: DataflashFormatDefinition): DataflashRecord | null {
  const payloadOffset = offset + DATAFLASH_HEADER_LENGTH;
  const payloadLength = definition.length - DATAFLASH_HEADER_LENGTH;
  if (payloadOffset + payloadLength > bytes.length) return null;

  const view = new DataView(bytes.buffer, bytes.byteOffset + payloadOffset, payloadLength);
  const formatCodes = normalizeFormat(definition.format);
  const fields: Record<string, number | string> = {};
  let cursor = 0;

  for (let index = 0; index < formatCodes.length; index++) {
    const reader = FIELD_READERS[formatCodes[index]];
    const column = definition.columns[index] ?? `field${index + 1}`;
    if (!reader || cursor + reader.size > payloadLength) {
      return null;
    }
    fields[column] = reader.read(view, cursor);
    cursor += reader.size;
  }

  return {
    messageId: definition.typeId,
    type: definition.name,
    byteOffset: payloadOffset,
    fields,
  };
}

function makeDiagnostics(records: DataflashRecord[], corruptFrames: number, unknownMessages: number): ReplayImportDiagnostics {
  return {
    decodedFrames: records.length,
    corruptFrames,
    unknownMessages,
    supportedMessages: records.length,
    warnings: [],
  };
}

export function decodeDataflashLog(buffer: ArrayBuffer): DataflashDecodeResult {
  const bytes = new Uint8Array(buffer);
  const records: DataflashRecord[] = [];
  const formats: Record<number, DataflashFormatDefinition> = {};
  let corruptFrames = 0;
  let unknownMessages = 0;
  let offset = 0;

  while (offset < bytes.length) {
    if (bytes[offset] !== HEAD_BYTE_1 || bytes[offset + 1] !== HEAD_BYTE_2) {
      corruptFrames += 1;
      offset += 1;
      continue;
    }

    const typeId = bytes[offset + 2];
    if (typeId === FMT_TYPE_ID) {
      const totalLength = DATAFLASH_HEADER_LENGTH + FMT_PAYLOAD_LENGTH;
      if (offset + totalLength > bytes.length) {
        corruptFrames += bytes.length - offset;
        break;
      }
      const definition = parseFmtRecord(bytes, offset + DATAFLASH_HEADER_LENGTH);
      formats[definition.typeId] = definition;
      offset += totalLength;
      continue;
    }

    const definition = formats[typeId];
    if (!definition) {
      unknownMessages += 1;
      offset += DATAFLASH_HEADER_LENGTH;
      continue;
    }

    const record = parseTypedRecord(bytes, offset, definition);
    if (!record) {
      corruptFrames += 1;
      offset += 1;
      continue;
    }

    records.push(record);
    offset += definition.length;
  }

  return {
    records,
    formats,
    diagnostics: makeDiagnostics(records, corruptFrames, unknownMessages),
  };
}
