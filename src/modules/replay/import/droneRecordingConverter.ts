import {
  F,
  FRAME_FIELDS,
  MAX_FRAMES_PER_DRONE,
  type DroneRecording,
} from '../store/flightRecorderStore';
import type { ReplayDataset, ReplayTrackSample } from './logImportTypes';

function makeRecording(vehicleId: string, startedAt: number, missionName: string): DroneRecording {
  return {
    droneId: vehicleId,
    missionName,
    startedAt,
    frames: new Float32Array(MAX_FRAMES_PER_DRONE * FRAME_FIELDS),
    timestamps: new Uint32Array(MAX_FRAMES_PER_DRONE),
    cursor: 0,
    total: 0,
  };
}

function writeSample(rec: DroneRecording, sample: ReplayTrackSample): void {
  const slot = rec.cursor;
  const base = slot * FRAME_FIELDS;
  rec.frames[base + F.LAT] = sample.lat;
  rec.frames[base + F.LNG] = sample.lng;
  rec.frames[base + F.ALT] = sample.altitudeM;
  rec.frames[base + F.ROLL] = sample.rollDeg;
  rec.frames[base + F.PITCH] = sample.pitchDeg;
  rec.frames[base + F.YAW] = sample.yawDeg;
  rec.frames[base + F.AIRSPEED] = sample.airspeedMs;
  rec.frames[base + F.GROUNDSPEED] = sample.groundspeedMs;
  rec.frames[base + F.BATTERY] = sample.batteryPercent;
  rec.frames[base + F.VX] = sample.vxMs;
  rec.frames[base + F.VY] = sample.vyMs;
  rec.frames[base + F.VZ] = sample.vzMs;
  rec.timestamps[slot] = Math.max(0, Math.floor(sample.timestampMs)) >>> 0;
  rec.cursor = (rec.cursor + 1) % MAX_FRAMES_PER_DRONE;
  rec.total += 1;
}

export function convertDatasetToRecordings(dataset: ReplayDataset): Record<string, DroneRecording> {
  const recordings: Record<string, DroneRecording> = {};

  for (const vehicle of Object.values(dataset.vehicles)) {
    if (vehicle.track.length < 2) continue;
    const startedAt = vehicle.track[0].timestampMs;
    const rec = makeRecording(vehicle.vehicleId, startedAt, dataset.source.fileName);
    for (const sample of vehicle.track.slice(0, MAX_FRAMES_PER_DRONE)) {
      writeSample(rec, sample);
    }
    recordings[vehicle.vehicleId] = rec;
  }

  return recordings;
}
