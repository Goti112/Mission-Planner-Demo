import {
  DEFAULT_MAP_VISUAL_POSE_CONFIG,
  type MapVisualPoseConfig,
} from './mapVisualPoseConfig';

export interface MapVisualPoseSample {
  lat: number;
  lng: number;
  headingDeg: number;
  altitudeM: number;
  timestampMs: number;
}

export interface MapVisualPose {
  lat: number;
  lng: number;
  headingDeg: number;
  altitudeM: number;
  timestampMs: number;
}

interface DroneHistory {
  samples: MapVisualPoseSample[];
}

const clamp01 = (value: number): number => (value < 0 ? 0 : value > 1 ? 1 : value);

const normalizeHeadingDeg = (value: number): number => {
  const wrapped = value % 360;
  return wrapped < 0 ? wrapped + 360 : wrapped;
};

const shortestArcDeg = (from: number, to: number): number => ((to - from + 540) % 360) - 180;

const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

const lerpHeadingDeg = (a: number, b: number, t: number): number =>
  a + shortestArcDeg(a, b) * t;

const distanceDeg = (a: MapVisualPoseSample, b: MapVisualPoseSample): number =>
  Math.hypot(a.lat - b.lat, a.lng - b.lng);

export class MapVisualPoseBuffer {
  private readonly config: MapVisualPoseConfig;
  private readonly historyByDrone: Map<string, DroneHistory> = new Map();

  constructor(config: MapVisualPoseConfig = DEFAULT_MAP_VISUAL_POSE_CONFIG) {
    this.config = config;
  }

  pushSample(droneId: string, sample: MapVisualPoseSample): void {
    const history = this.historyByDrone.get(droneId) ?? { samples: [] };
    const last = history.samples[history.samples.length - 1];

    if (!Number.isFinite(sample.lat) || !Number.isFinite(sample.lng)) {
      throw new Error(`Invalid map pose sample for ${droneId}`);
    }

    if (Math.abs(sample.lat) > 90 || Math.abs(sample.lng) > 180) {
      throw new Error(`Out-of-range map pose sample for ${droneId}`);
    }

    if (
      last
      && (sample.timestampMs - last.timestampMs > this.config.maxGapMs
        || distanceDeg(last, sample) > this.config.snapDistanceDeg)
    ) {
      history.samples.length = 0;
    }

    history.samples.push({
      ...sample,
      headingDeg: normalizeHeadingDeg(sample.headingDeg),
    });

    if (history.samples.length > this.config.maxBufferSize) {
      history.samples.splice(0, history.samples.length - this.config.maxBufferSize);
    }

    this.historyByDrone.set(droneId, history);
  }

  samplePose(droneId: string, nowMs: number): MapVisualPose | null {
    const history = this.historyByDrone.get(droneId);
    if (!history || history.samples.length === 0) {
      return null;
    }

    const samples = history.samples;
    const renderDelayMultiplier = samples.length > 2 ? 2 : 1;
    const renderTime = nowMs - this.config.renderDelayMs * renderDelayMultiplier;

    if (samples.length === 1 || renderTime <= samples[0].timestampMs) {
      return { ...samples[0] };
    }

    const newest = samples[samples.length - 1];
    if (renderTime >= newest.timestampMs) {
      if (renderTime - newest.timestampMs > this.config.maxExtrapolationMs) {
        return { ...newest };
      }
      return { ...newest };
    }

    for (let index = 1; index < samples.length; index += 1) {
      const previous = samples[index - 1];
      const current = samples[index];
      if (renderTime > current.timestampMs) {
        continue;
      }

      const spanMs = current.timestampMs - previous.timestampMs;
      const t = spanMs <= 0 ? 1 : clamp01((renderTime - previous.timestampMs) / spanMs);

      return {
        lat: lerp(previous.lat, current.lat, t),
        lng: lerp(previous.lng, current.lng, t),
        headingDeg: lerpHeadingDeg(previous.headingDeg, current.headingDeg, t),
        altitudeM: lerp(previous.altitudeM, current.altitudeM, t),
        timestampMs: lerp(previous.timestampMs, current.timestampMs, t),
      };
    }

    return { ...newest };
  }

  clearDrone(droneId: string): void {
    this.historyByDrone.delete(droneId);
  }

  clearMissingDrones(activeDroneIds: string[]): void {
    const activeIds = new Set(activeDroneIds);
    for (const droneId of this.historyByDrone.keys()) {
      if (!activeIds.has(droneId)) {
        this.historyByDrone.delete(droneId);
      }
    }
  }
}
