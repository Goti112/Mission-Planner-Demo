import { describe, expect, it } from 'vitest';
import {
  createMissionItem,
  createMissionPlan,
  duplicateMissionItem,
  resequenceMissionItems,
} from '../MissionItemFactory';
import type { MissionHome, MissionItem, MissionParams } from '../MissionTypes';

const params = (
  param1: number | null,
  param2: number | null,
  param3: number | null,
  param4: number | null,
  param5: number | null,
  param6: number | null,
  param7: number | null,
): MissionParams => [param1, param2, param3, param4, param5, param6, param7];

const waypoint = (id: string, seq: number): MissionItem =>
  createMissionItem({
    id,
    seq,
    command: 'MAV_CMD_NAV_WAYPOINT',
    frame: 'MAV_FRAME_GLOBAL_RELATIVE_ALT_INT',
    current: false,
    autocontinue: true,
    params: params(1, 2, Number.NaN, 4, 0, 0, 0),
    coordinate: {
      lat: 40.4168,
      lng: -3.7038,
      alt: 65,
    },
  });

describe('MissionItemFactory', () => {
  it('mirrors coordinate lat/lng/alt into params 5/6/7 for spatial commands', () => {
    const item = createMissionItem({
      id: 'item-1',
      seq: 3,
      command: 'MAV_CMD_NAV_WAYPOINT',
      frame: 'MAV_FRAME_GLOBAL_RELATIVE_ALT_INT',
      current: false,
      autocontinue: true,
      params: params(10, Number.POSITIVE_INFINITY, 30, null, 0, 0, 0),
      coordinate: {
        lat: 40.4168,
        lng: -3.7038,
        alt: 70,
      },
    });

    expect(item.params).toEqual([10, null, 30, null, 40.4168, -3.7038, 70]);
    expect(item.coordinate).toEqual({
      lat: 40.4168,
      lng: -3.7038,
      alt: 70,
    });
  });

  it('normalizes non-finite mirrored coordinate params for spatial commands', () => {
    const item = createMissionItem({
      id: 'item-non-finite-coordinate',
      seq: 5,
      command: 'MAV_CMD_NAV_WAYPOINT',
      frame: 'MAV_FRAME_GLOBAL_RELATIVE_ALT_INT',
      current: false,
      autocontinue: true,
      params: params(10, 20, 30, 40, 50, 60, 70),
      coordinate: {
        lat: Number.NaN,
        lng: Infinity,
        alt: -Infinity,
      },
    });

    expect(item.params).toEqual([10, 20, 30, 40, null, null, null]);
    expect(item.coordinate).toEqual({
      lat: Number.NaN,
      lng: Infinity,
      alt: -Infinity,
    });
  });

  it('preserves unexpected coordinates on non-spatial commands for validation', () => {
    const item = createMissionItem({
      id: 'item-2',
      seq: 4,
      command: 'MAV_CMD_DO_CHANGE_SPEED',
      frame: 'MAV_FRAME_MISSION',
      current: false,
      autocontinue: true,
      params: params(1, 12, null, null, 40.4168, -3.7038, 70),
      coordinate: {
        lat: 40.4168,
        lng: -3.7038,
        alt: 70,
      },
    });

    expect(item.params).toEqual([1, 12, null, null, null, null, null]);
    expect(item.coordinate).toEqual({
      lat: 40.4168,
      lng: -3.7038,
      alt: 70,
    });
  });

  it('preserves meaningful params 5/6 while clearing unused param 7 for digicam control', () => {
    const item = createMissionItem({
      id: 'item-digicam',
      seq: 5,
      command: 'MAV_CMD_DO_DIGICAM_CONTROL',
      frame: 'MAV_FRAME_MISSION',
      current: false,
      autocontinue: true,
      params: params(0, null, Number.NaN, 1, 1, 42, 70),
      coordinate: {
        lat: 40.4168,
        lng: -3.7038,
        alt: 70,
      },
    });

    expect(item.params).toEqual([0, null, null, 1, 1, 42, null]);
    expect(item.coordinate).toEqual({
      lat: 40.4168,
      lng: -3.7038,
      alt: 70,
    });
  });

  it('resequenceMissionItems returns new items with seq 0..n and does not mutate inputs', () => {
    const first = waypoint('item-1', 9);
    const second = waypoint('item-2', 2);
    const items = [first, second] as const;

    const resequenced = resequenceMissionItems(items);

    expect(resequenced.map((item) => item.seq)).toEqual([0, 1]);
    expect(resequenced[0]).not.toBe(first);
    expect(resequenced[1]).not.toBe(second);
    expect(first.seq).toBe(9);
    expect(second.seq).toBe(2);
  });

  it('duplicateMissionItem clones params/coordinate and applies explicit id/seq', () => {
    const original = waypoint('item-1', 0);

    const duplicate = duplicateMissionItem({
      item: original,
      id: 'item-copy',
      seq: 7,
    });

    expect(duplicate).toEqual({
      ...original,
      id: 'item-copy',
      seq: 7,
    });
    expect(duplicate.params).not.toBe(original.params);
    expect(duplicate.coordinate).not.toBe(original.coordinate);
  });

  it('createMissionPlan resequences items and clones home', () => {
    const home: MissionHome = {
      lat: 40.4168,
      lng: -3.7038,
      alt: 650,
    };
    const first = waypoint('item-1', 9);
    const second = waypoint('item-2', 3);

    const plan = createMissionPlan({
      id: 'plan-1',
      vehicleType: 'copter',
      home,
      items: [first, second],
      updatedAtIso: '2026-05-20T10:00:00.000Z',
    });

    expect(plan.items.map((item) => item.seq)).toEqual([0, 1]);
    expect(plan.home).toEqual(home);
    expect(plan.home).not.toBe(home);
    expect(plan.items[0]).not.toBe(first);
    expect(plan.items[1]).not.toBe(second);
  });
});
