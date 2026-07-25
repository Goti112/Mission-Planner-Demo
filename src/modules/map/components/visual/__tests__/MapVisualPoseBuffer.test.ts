import { describe, expect, it } from 'vitest';
import {
  MapVisualPoseBuffer,
  type MapVisualPoseSample,
} from '../MapVisualPoseBuffer';

const makeSample = (
  lat: number,
  lng: number,
  headingDeg: number,
  timestampMs: number,
): MapVisualPoseSample => ({
  lat,
  lng,
  headingDeg,
  altitudeM: 100,
  timestampMs,
});

describe('MapVisualPoseBuffer', () => {
  it('interpolates heading through the shortest arc', () => {
    const buffer = new MapVisualPoseBuffer({
      renderDelayMs: 100,
      maxBufferSize: 8,
      maxGapMs: 400,
      maxExtrapolationMs: 0,
      snapDistanceDeg: 0.0015,
    });

    buffer.pushSample('drone-1', makeSample(40, -3, 350, 1_000));
    buffer.pushSample('drone-1', makeSample(40, -3, 10, 1_100));

    const pose = buffer.samplePose('drone-1', 1_150);

    expect(pose).not.toBeNull();
    expect(pose!.headingDeg).toBeGreaterThan(355);
  });

  it('samples a delayed pose between two real positions', () => {
    const buffer = new MapVisualPoseBuffer({
      renderDelayMs: 100,
      maxBufferSize: 8,
      maxGapMs: 400,
      maxExtrapolationMs: 0,
      snapDistanceDeg: 0.0015,
    });

    buffer.pushSample('drone-1', makeSample(40.0000, -3.0000, 90, 1_000));
    buffer.pushSample('drone-1', makeSample(40.0010, -3.0000, 90, 1_100));
    buffer.pushSample('drone-1', makeSample(40.0020, -3.0000, 90, 1_200));

    const pose = buffer.samplePose('drone-1', 1_250);

    expect(pose).not.toBeNull();
    expect(pose!.lat).toBeCloseTo(40.0005, 6);
    expect(pose!.lng).toBeCloseTo(-3.0000, 6);
  });

  it('resets the time history when a gap exceeds maxGapMs', () => {
    const buffer = new MapVisualPoseBuffer({
      renderDelayMs: 100,
      maxBufferSize: 8,
      maxGapMs: 400,
      maxExtrapolationMs: 0,
      snapDistanceDeg: 0.0015,
    });

    buffer.pushSample('drone-1', makeSample(40.0000, -3.0000, 90, 1_000));
    buffer.pushSample('drone-1', makeSample(40.0010, -3.0000, 90, 1_100));
    buffer.pushSample('drone-1', makeSample(41.0000, -4.0000, 180, 2_000));

    const pose = buffer.samplePose('drone-1', 2_100);

    expect(pose).not.toBeNull();
    expect(pose!.lat).toBeCloseTo(41.0000, 6);
    expect(pose!.lng).toBeCloseTo(-4.0000, 6);
  });

  it('snaps instead of blending when movement exceeds snapDistanceDeg', () => {
    const buffer = new MapVisualPoseBuffer({
      renderDelayMs: 100,
      maxBufferSize: 8,
      maxGapMs: 400,
      maxExtrapolationMs: 0,
      snapDistanceDeg: 0.0015,
    });

    buffer.pushSample('drone-1', makeSample(40.0000, -3.0000, 90, 1_000));
    buffer.pushSample('drone-1', makeSample(40.0500, -3.0500, 120, 1_100));

    const pose = buffer.samplePose('drone-1', 1_200);

    expect(pose).not.toBeNull();
    expect(pose!.lat).toBeCloseTo(40.0500, 6);
    expect(pose!.lng).toBeCloseTo(-3.0500, 6);
  });
});
