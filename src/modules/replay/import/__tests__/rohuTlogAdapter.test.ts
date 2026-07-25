import { describe, expect, it } from 'vitest';

import { encodeTlog } from '../../../mission/services/tlogCodec';
import { F, FRAME_FIELDS, MAX_FRAMES_PER_DRONE, type DroneRecording } from '../../store/flightRecorderStore';
import { decodeRohuTlogMessages } from '../rohuTlogAdapter';

function recording(): DroneRecording {
  const frames = new Float32Array(MAX_FRAMES_PER_DRONE * FRAME_FIELDS);
  const timestamps = new Uint32Array(MAX_FRAMES_PER_DRONE);

  frames[0 * FRAME_FIELDS + F.LAT] = 40;
  frames[0 * FRAME_FIELDS + F.LNG] = -3;
  frames[0 * FRAME_FIELDS + F.ALT] = 100;
  frames[0 * FRAME_FIELDS + F.ROLL] = 1;
  frames[0 * FRAME_FIELDS + F.PITCH] = 2;
  frames[0 * FRAME_FIELDS + F.YAW] = 90;
  frames[0 * FRAME_FIELDS + F.GROUNDSPEED] = 8;
  frames[0 * FRAME_FIELDS + F.BATTERY] = 99;
  timestamps[0] = 1000;

  frames[1 * FRAME_FIELDS + F.LAT] = 40.0001;
  frames[1 * FRAME_FIELDS + F.LNG] = -3.0001;
  frames[1 * FRAME_FIELDS + F.ALT] = 105;
  frames[1 * FRAME_FIELDS + F.ROLL] = 2;
  frames[1 * FRAME_FIELDS + F.PITCH] = 3;
  frames[1 * FRAME_FIELDS + F.YAW] = 91;
  frames[1 * FRAME_FIELDS + F.GROUNDSPEED] = 9;
  frames[1 * FRAME_FIELDS + F.BATTERY] = 98;
  timestamps[1] = 2000;

  return {
    droneId: 'drone-1',
    missionName: 'Rohu sample',
    startedAt: 500,
    frames,
    timestamps,
    cursor: 2,
    total: 2,
  };
}

describe('decodeRohuTlogMessages', () => {
  it('converts Rohu tlog recordings into normalized sample messages', () => {
    const buffer = encodeTlog({ 'drone-1': recording() });
    const result = decodeRohuTlogMessages(buffer);

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error);

    expect(result.messages).toHaveLength(2);
    expect(result.messages[0]).toMatchObject({
      source: 'ROHU',
      type: 'ROHU_SAMPLE',
      sysId: 1,
      timestampMs: 1500,
      relativeTimeMs: 1000,
      payload: {
        lat: 40,
        lng: -3,
        altitudeM: 100,
        rollDeg: 1,
        pitchDeg: 2,
        yawDeg: 90,
      },
    });
  });
});
