import { describe, expect, it } from 'vitest';
import {
  selectMissionMapPoints,
  selectMissionRoutePoints,
  selectMissionTableRows,
  selectUploadableMissionItems,
} from '../MissionSelectors';
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
  paramsValue: MissionParams,
  coordinate: MissionItem['coordinate'],
): MissionItem => ({
  id,
  seq,
  command,
  frame: coordinate === null ? 'MAV_FRAME_MISSION' : 'MAV_FRAME_GLOBAL_RELATIVE_ALT_INT',
  current: false,
  autocontinue: true,
  params: paramsValue,
  coordinate,
});

const missionPlan = (items: readonly MissionItem[]): MissionPlan => ({
  id: 'plan-1',
  vehicleType: 'copter',
  home: null,
  items,
  updatedAtIso: '2026-05-20T10:00:00.000Z',
});

describe('MissionSelectors', () => {
  it('maps mission items to table rows with params and coordinates', () => {
    const waypoint = missionItem(
      'waypoint-1',
      2,
      'MAV_CMD_NAV_WAYPOINT',
      params(10, 20, null, 40, 40.4168, -3.7038, 65),
      {
        lat: 40.4168,
        lng: -3.7038,
        alt: 65,
      },
    );
    const speedChange = missionItem(
      'speed-1',
      1,
      'MAV_CMD_DO_CHANGE_SPEED',
      params(1, 12, null, null, null, null, null),
      null,
    );

    const rows = selectMissionTableRows(missionPlan([waypoint, speedChange]));

    expect(rows).toEqual([
      {
        id: 'waypoint-1',
        seq: 2,
        command: 'MAV_CMD_NAV_WAYPOINT',
        frame: 'MAV_FRAME_GLOBAL_RELATIVE_ALT_INT',
        param1: 10,
        param2: 20,
        param3: null,
        param4: 40,
        lat: 40.4168,
        lng: -3.7038,
        alt: 65,
        autocontinue: true,
      },
      {
        id: 'speed-1',
        seq: 1,
        command: 'MAV_CMD_DO_CHANGE_SPEED',
        frame: 'MAV_FRAME_MISSION',
        param1: 1,
        param2: 12,
        param3: null,
        param4: null,
        lat: null,
        lng: null,
        alt: null,
        autocontinue: true,
      },
    ]);
  });

  it('selects only coordinate-bearing mission items for map overlays', () => {
    const takeoff = missionItem(
      'takeoff-1',
      0,
      'MAV_CMD_NAV_TAKEOFF',
      params(0, null, null, null, 40.4167, -3.7036, 50),
      {
        lat: 40.4167,
        lng: -3.7036,
        alt: 50,
      },
    );
    const delay = missionItem('delay-1', 1, 'MAV_CMD_NAV_DELAY', params(5, null, null, null, null, null, null), null);
    const waypoint = missionItem(
      'waypoint-1',
      2,
      'MAV_CMD_NAV_WAYPOINT',
      params(0, 0, null, null, 40.417, -3.704, 80),
      {
        lat: 40.417,
        lng: -3.704,
        alt: 80,
      },
    );

    const points = selectMissionMapPoints(missionPlan([takeoff, delay, waypoint]));

    expect(points).toEqual([
      {
        id: 'takeoff-1',
        seq: 0,
        command: 'MAV_CMD_NAV_TAKEOFF',
        lat: 40.4167,
        lng: -3.7036,
        alt: 50,
      },
      {
        id: 'waypoint-1',
        seq: 2,
        command: 'MAV_CMD_NAV_WAYPOINT',
        lat: 40.417,
        lng: -3.704,
        alt: 80,
      },
    ]);
  });

  it('keeps ROI overlay points out of flown route points', () => {
    const waypoint = missionItem(
      'waypoint-1',
      0,
      'MAV_CMD_NAV_WAYPOINT',
      params(0, 0, null, null, 40.417, -3.704, 80),
      {
        lat: 40.417,
        lng: -3.704,
        alt: 80,
      },
    );
    const roi = missionItem(
      'roi-1',
      1,
      'MAV_CMD_DO_SET_ROI',
      params(0, null, null, null, 40.9, -3.9, 20),
      {
        lat: 40.9,
        lng: -3.9,
        alt: 20,
      },
    );
    const delay = missionItem(
      'delay-1',
      2,
      'MAV_CMD_NAV_DELAY',
      params(5, null, null, null, null, null, null),
      {
        lat: 40.5,
        lng: -3.5,
        alt: 10,
      },
    );
    const land = missionItem(
      'land-1',
      3,
      'MAV_CMD_NAV_LAND',
      params(null, null, null, null, 40.418, -3.705, 0),
      {
        lat: 40.418,
        lng: -3.705,
        alt: 0,
      },
    );
    const plan = missionPlan([waypoint, roi, delay, land]);

    expect(selectMissionMapPoints(plan).map((point) => point.id)).toEqual([
      'waypoint-1',
      'roi-1',
      'delay-1',
      'land-1',
    ]);
    expect(selectMissionRoutePoints(plan).map((point) => point.id)).toEqual(['waypoint-1', 'land-1']);
  });

  it('returns a new uploadable item array sorted by seq without mutating plan items', () => {
    const first = missionItem('first', 0, 'MAV_CMD_NAV_TAKEOFF', params(0, null, null, null, 40, -3, 30), {
      lat: 40,
      lng: -3,
      alt: 30,
    });
    const second = missionItem('second', 1, 'MAV_CMD_DO_CHANGE_SPEED', params(1, 15, null, null, null, null, null), null);
    const third = missionItem('third', 2, 'MAV_CMD_NAV_WAYPOINT', params(0, 0, null, null, 41, -4, 60), {
      lat: 41,
      lng: -4,
      alt: 60,
    });
    const items = [third, first, second] as const;
    const plan = missionPlan(items);

    const uploadableItems = selectUploadableMissionItems(plan);

    expect(uploadableItems.map((item) => item.id)).toEqual(['first', 'second', 'third']);
    expect(uploadableItems).not.toBe(plan.items);
    expect(plan.items).toEqual(items);
  });
});
