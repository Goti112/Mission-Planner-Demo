import type { DroneRecording } from '../store/flightRecorderStore';

export type FlightLogFormat =
  | 'MAVLINK_TLOG'
  | 'DATAFLASH_BIN'
  | 'ROHU_TLOG'
  | 'ROHU_JSON';

export type FlightLogParser = 'browser' | 'bridge';

export type ReplayImportStage =
  | 'IDLE'
  | 'READING'
  | 'DECODING'
  | 'BUILDING_DATASET'
  | 'CONVERTING_REPLAY'
  | 'READY'
  | 'ERROR';

export interface ReplayLogSource {
  fileName: string;
  byteLength: number;
  format: FlightLogFormat;
  parser: FlightLogParser;
  importedAt: number;
  originalFileAvailable: boolean;
}

export interface ReplayImportDiagnostics {
  decodedFrames: number;
  corruptFrames: number;
  unknownMessages: number;
  supportedMessages: number;
  warnings: string[];
}

export interface DecodedFrameEnvelope {
  format: 'MAVLINK_V1' | 'MAVLINK_V2' | 'DATAFLASH';
  byteOffset: number;
  byteLength: number;
  messageId: number | string;
  sysId: number | null;
  compId: number | null;
  sequence: number | null;
  timestampMs: number | null;
  payload: Uint8Array;
  checksumStatus: 'VALID' | 'INVALID' | 'UNAVAILABLE';
}

export interface DecodedLogMessage<TPayload extends Record<string, unknown> = Record<string, unknown>> {
  source: 'MAVLINK' | 'DATAFLASH' | 'ROHU';
  type: string;
  messageId: number | string;
  sysId: number | null;
  compId: number | null;
  timestampMs: number | null;
  relativeTimeMs: number | null;
  payload: TPayload;
  rawPayload?: Record<string, unknown>;
  byteOffset: number;
  byteLength: number | null;
  warnings: string[];
}

export interface ReplayTrackSample {
  timestampMs: number;
  lat: number;
  lng: number;
  altitudeM: number;
  rollDeg: number;
  pitchDeg: number;
  yawDeg: number;
  airspeedMs: number;
  groundspeedMs: number;
  batteryPercent: number;
  vxMs: number;
  vyMs: number;
  vzMs: number;
}

export interface ReplayVehicleDataset {
  vehicleId: string;
  sysId: number | null;
  compIds: number[];
  messageCounts: Record<string, number>;
  track: ReplayTrackSample[];
  summary: ReplayVehicleSummary;
}

export interface ReplayVehicleSummary {
  durationSec: number;
  distanceM: number;
  minAltitudeM: number | null;
  maxAltitudeM: number | null;
  maxGroundspeedMs: number | null;
  averageGroundspeedMs: number | null;
  initialBatteryPercent: number | null;
  finalBatteryPercent: number | null;
  gpsFixCoveragePercent: number | null;
  flightModes: string[];
}

export interface ReplayEventMarker {
  id: string;
  timestampMs: number;
  vehicleId: string | null;
  severity: 'INFO' | 'WARNING' | 'ERROR';
  label: string;
  detail: string;
}

export interface ReplayPlotSeries {
  id: string;
  vehicleId: string | null;
  group: string;
  field: string;
  label: string;
  unit: string;
  points: Array<{ timestampMs: number; value: number }>;
}

export interface ReplayDataset {
  source: ReplayLogSource;
  diagnostics: ReplayImportDiagnostics;
  vehicles: Record<string, ReplayVehicleDataset>;
  events: ReplayEventMarker[];
  plotSeries: ReplayPlotSeries[];
}

export interface ReplayImportProgress {
  stage: ReplayImportStage;
  loadedBytes: number;
  totalBytes: number;
  message: string;
}

export type ReplayImportResult =
  | {
      ok: true;
      dataset: ReplayDataset;
      recordings: Record<string, DroneRecording>;
    }
  | {
      ok: false;
      error: string;
      diagnostics: ReplayImportDiagnostics;
    };
