import type { FlightLogFormat } from './logImportTypes';

const TLOG_MAGIC = [0xa7, 0x19, 0xd4, 0x6c] as const;
const DATAFLASH_HEAD_1 = 0xa3;
const DATAFLASH_HEAD_2 = 0x95;
const MAVLINK_V1_MAGIC = 0xfe;
const MAVLINK_V2_MAGIC = 0xfd;

function startsWith(bytes: Uint8Array, signature: readonly number[]): boolean {
  return signature.every((value, index) => bytes[index] === value);
}

export function detectFlightLogFormat(fileName: string, buffer: ArrayBuffer): FlightLogFormat {
  const bytes = new Uint8Array(buffer);
  const lowerName = fileName.toLowerCase();

  if (startsWith(bytes, TLOG_MAGIC)) {
    return 'MISSION_TLOG';
  }

  if (bytes[0] === DATAFLASH_HEAD_1 && bytes[1] === DATAFLASH_HEAD_2) {
    return 'DATAFLASH_BIN';
  }

  if (bytes[0] === MAVLINK_V1_MAGIC || bytes[0] === MAVLINK_V2_MAGIC) {
    return 'MAVLINK_TLOG';
  }

  if (lowerName.endsWith('.mission.json') || lowerName.endsWith('.json')) {
    return 'MISSION_JSON';
  }

  if (lowerName.endsWith('.bin')) {
    return 'DATAFLASH_BIN';
  }

  if (lowerName.endsWith('.tlog')) {
    return 'MAVLINK_TLOG';
  }

  return 'MAVLINK_TLOG';
}
