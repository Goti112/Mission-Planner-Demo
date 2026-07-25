import { describe, expect, it } from 'vitest';
import { calculateDomainMissionMetrics } from '../MissionMetrics';
import { MissionDomainError } from '../MissionTypes';
import type { MissionItem, MissionParams, MissionPlan } from '../MissionTypes';

const params = (
  param1: number | null,
  param2: number | null,
  param3: number | null,
  param4: number | null,
  param5: number | null,
  param6: number | null,
  param7: number | null,
): MissionParams => [param1, param2, param3, param4, param5, param6, param7];

const missionItem = (
  id: string,
  seq: number,
  command: MissionItem['command'],
  coordinate: MissionItem['coordinate'],
): MissionItem => ({
  id,
  seq,
  command,
  frame: coordinate === null ? 'MAV_FRAME_MISSION' : 'MAV_FRAME_GLOBAL_RELATIVE_ALT_INT',
  current: false,
  autocontinue: true,
  params: params(null, null, null, null, null, null, null),
  coordinate,
});

const missionPlan = (items: readonly MissionItem[]): MissionPlan => ({
  id: 'plan-1',
  vehicleType: 'copter',
  home: null,
  items,
  updatedAtIso: '2026-05-20T10:00:00.000Z',
});

describe('MissionMetrics', () => {
  it('calculates metrics from spatial mission items while counting every command', () => {
    const expectedDistanceM = 47.53424369542403;
    const takeoff = missionItem('takeoff-1', 0, 'MAV_CMD_NAV_TAKEOFF', {
      lat: 40.4167,
      lng: -3.7036,
      alt: 50,
    });
    const speedChange = missionItem('speed-1', 1, 'MAV_CMD_DO_CHANGE_SPEED', null);
    const roi = missionItem('roi-1', 2, 'MAV_CMD_DO_SET_ROI', {
      lat: 41,
      lng: -4,
      alt: 10,
    });
    const waypoint = missionItem('waypoint-1', 3, 'MAV_CMD_NAV_WAYPOINT', {
      lat: 40.417,
      lng: -3.704,
      alt: 80,
    });
    const servo = missionItem('servo-1', 4, 'MAV_CMD_DO_SET_SERVO', null);
    const plan = missionPlan([takeoff, speedChange, roi, waypoint, servo]);

    const metrics = calculateDomainMissionMetrics(plan, 10);

    expect(metrics.commandCount).toBe(5);
    expect(metrics.spatialItemCount).toBe(2);
    expect(metrics.totalDistanceM).toBeCloseTo(expectedDistanceM, 6);
    expect(metrics.durationSeconds).toBeCloseTo(4.753424369542403, 6);
    expect(metrics.maxAltitudeM).toBe(80);
    expect(metrics.minAltitudeM).toBe(50);
    expect(metrics.segmentDistances).toHaveLength(1);
    expect(metrics.segmentDistances[0]?.fromSeq).toBe(0);
    expect(metrics.segmentDistances[0]?.toSeq).toBe(3);
    expect(metrics.segmentDistances[0]?.distanceM).toBeCloseTo(expectedDistanceM, 6);
    expect(metrics.altitudeProfile[0]).toEqual({
      seq: 0,
      label: 'WP1',
      distanceM: 0,
      altitudeM: 50,
    });
    expect(metrics.altitudeProfile[1]?.seq).toBe(3);
    expect(metrics.altitudeProfile[1]?.label).toBe('WP2');
    expect(metrics.altitudeProfile[1]?.distanceM).toBeCloseTo(expectedDistanceM, 6);
    expect(metrics.altitudeProfile[1]?.altitudeM).toBe(80);
  });

  it('returns zero duration and null altitude extrema when no spatial items are present', () => {
    const plan = missionPlan([
      missionItem('speed-1', 0, 'MAV_CMD_DO_CHANGE_SPEED', null),
      missionItem('servo-1', 1, 'MAV_CMD_DO_SET_SERVO', null),
    ]);

    const metrics = calculateDomainMissionMetrics(plan, 0);

    expect(metrics.commandCount).toBe(2);
    expect(metrics.spatialItemCount).toBe(0);
    expect(metrics.totalDistanceM).toBe(0);
    expect(metrics.durationSeconds).toBe(0);
    expect(metrics.segmentDistances).toEqual([]);
    expect(metrics.altitudeProfile).toEqual([]);
    expect(metrics.maxAltitudeM).toBeNull();
    expect(metrics.minAltitudeM).toBeNull();
  });

  it('throws a domain error for invalid cruise speed when distance is non-zero', () => {
    const takeoff = missionItem('takeoff-1', 0, 'MAV_CMD_NAV_TAKEOFF', {
      lat: 40.4167,
      lng: -3.7036,
      alt: 50,
    });
    const waypoint = missionItem('waypoint-1', 1, 'MAV_CMD_NAV_WAYPOINT', {
      lat: 40.417,
      lng: -3.704,
      alt: 80,
    });
    const plan = missionPlan([takeoff, waypoint]);

    expect(() => calculateDomainMissionMetrics(plan, 0)).toThrow(MissionDomainError);
    expect(() => calculateDomainMissionMetrics(plan, 0)).toThrow(
      'Cannot calculate mission duration with invalid cruiseSpeedMps: 0.',
    );
  });
});
