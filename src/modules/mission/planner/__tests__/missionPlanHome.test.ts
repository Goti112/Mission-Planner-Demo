import { describe, expect, it } from 'vitest';
import {
  createMissionItem,
  createMissionPlan,
  type MissionItem,
  type MissionParams,
  type MissionPlan,
} from '../../domain';
import {
  normalizeMissionPlanHome,
  promoteMissionItemsToHome,
  replaceMissionPlanItemsWithHomePromotion,
  toMissionHome,
} from '../missionPlanHome';

const params = (
  param1: number | null,
  param2: number | null,
  param3: number | null,
  param4: number | null,
  param5: number | null,
  param6: number | null,
  param7: number | null,
): MissionParams => [param1, param2, param3, param4, param5, param6, param7];

const waypoint = (id: string, seq: number, lat: number, lng: number, alt: number): MissionItem =>
  createMissionItem({
    id,
    seq,
    command: 'MAV_CMD_NAV_WAYPOINT',
    frame: 'MAV_FRAME_GLOBAL_RELATIVE_ALT_INT',
    current: seq === 0,
    autocontinue: true,
    params: params(null, null, null, null, null, null, null),
    coordinate: { lat, lng, alt },
  });

const cameraTrigger = (id: string, seq: number): MissionItem =>
  createMissionItem({
    id,
    seq,
    command: 'MAV_CMD_DO_SET_CAM_TRIGG_DIST',
    frame: 'MAV_FRAME_MISSION',
    current: false,
    autocontinue: true,
    params: params(25, 0, 0, null, null, null, null),
    coordinate: null,
  });

const missionPlan = (home: MissionPlan['home'], items: readonly MissionItem[]): MissionPlan =>
  createMissionPlan({
    id: 'plan-1',
    vehicleType: 'copter',
    home,
    items,
    updatedAtIso: '2026-07-01T08:00:00.000Z',
  });

describe('missionPlanHome', () => {
  it('converts a coordinate into a mission home without retaining object identity', () => {
    const coordinate = { lat: 40.4168, lng: -3.7038, alt: 650 };
    const home = toMissionHome(coordinate);

    expect(home).toEqual(coordinate);
    expect(home).not.toBe(coordinate);
  });

  it('promotes the first spatial item into home when a plan has no home', () => {
    const plan = missionPlan(null, [
      waypoint('legacy-home', 0, 40.4168, -3.7038, 650),
      waypoint('wp-1', 1, 40.417, -3.704, 60),
      waypoint('wp-2', 2, 40.418, -3.705, 70),
    ]);

    const result = normalizeMissionPlanHome({
      plan,
      updatedAtIso: '2026-07-01T09:00:00.000Z',
    });

    expect(result.promotedItemId).toBe('legacy-home');
    expect(result.plan.home).toEqual({ lat: 40.4168, lng: -3.7038, alt: 650 });
    expect(result.plan.items.map((item) => item.id)).toEqual(['wp-1', 'wp-2']);
    expect(result.plan.items.map((item) => item.seq)).toEqual([0, 1]);
    expect(result.plan.updatedAtIso).toBe('2026-07-01T09:00:00.000Z');
  });

  it('does not promote when the plan already has home', () => {
    const home = { lat: 40.4, lng: -3.7, alt: 610 };
    const plan = missionPlan(home, [waypoint('wp-1', 0, 40.417, -3.704, 60)]);

    const result = normalizeMissionPlanHome({
      plan,
      updatedAtIso: '2026-07-01T09:00:00.000Z',
    });

    expect(result.promotedItemId).toBeNull();
    expect(result.plan.home).toEqual(home);
    expect(result.plan.items.map((item) => item.id)).toEqual(['wp-1']);
    expect(result.plan.updatedAtIso).toBe(plan.updatedAtIso);
  });

  it('promotes the first spatial item even when non-spatial commands precede it', () => {
    const plan = missionPlan(null, [
      cameraTrigger('trigger-1', 0),
      waypoint('legacy-home', 1, 40.4168, -3.7038, 650),
      waypoint('wp-1', 2, 40.417, -3.704, 60),
    ]);

    const result = normalizeMissionPlanHome({
      plan,
      updatedAtIso: '2026-07-01T09:00:00.000Z',
    });

    expect(result.promotedItemId).toBe('legacy-home');
    expect(result.plan.items.map((item) => item.id)).toEqual(['trigger-1', 'wp-1']);
    expect(result.plan.items.map((item) => item.seq)).toEqual([0, 1]);
  });

  it('promotes imported mission items independently from the current plan home', () => {
    const result = promoteMissionItemsToHome({
      items: [
        waypoint('imported-home', 0, 40.4168, -3.7038, 650),
        waypoint('wp-1', 1, 40.417, -3.704, 60),
        waypoint('wp-2', 2, 40.418, -3.705, 70),
      ],
    });

    expect(result.promotedItemId).toBe('imported-home');
    expect(result.home).toEqual({ lat: 40.4168, lng: -3.7038, alt: 650 });
    expect(result.items.map((item) => item.id)).toEqual(['wp-1', 'wp-2']);
    expect(result.items.map((item) => item.seq)).toEqual([0, 1]);
  });

  it('replaces plan items and promotes legacy home in one pure operation', () => {
    const plan = missionPlan(null, []);
    const result = replaceMissionPlanItemsWithHomePromotion({
      plan,
      items: [
        waypoint('legacy-home', 0, 40.4168, -3.7038, 650),
        waypoint('wp-1', 1, 40.417, -3.704, 60),
      ],
      updatedAtIso: '2026-07-01T09:00:00.000Z',
    });

    expect(result.promotedItemId).toBe('legacy-home');
    expect(result.plan.home).toEqual({ lat: 40.4168, lng: -3.7038, alt: 650 });
    expect(result.plan.items.map((item) => item.id)).toEqual(['wp-1']);
  });
});
