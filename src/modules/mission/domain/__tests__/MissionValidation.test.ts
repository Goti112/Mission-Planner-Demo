import { describe, expect, it } from 'vitest';
import { createMissionItem, createMissionPlan } from '../MissionItemFactory';
import { validateMissionPlan } from '../MissionValidation';
import type { MissionCoordinate, MissionItem, MissionParams, MissionPlan } from '../MissionTypes';

const params = (
  param1: number | null,
  param2: number | null,
  param3: number | null,
  param4: number | null,
  param5: number | null,
  param6: number | null,
  param7: number | null,
): MissionParams => [param1, param2, param3, param4, param5, param6, param7];

const coordinate = (lat: number, lng: number, alt: number): MissionCoordinate => ({
  lat,
  lng,
  alt,
});

const missionItem = (
  id: string,
  seq: number,
  command: MissionItem['command'],
  frame: MissionItem['frame'],
  itemCoordinate: MissionCoordinate | null,
): MissionItem =>
  missionItemWithParams(
    id,
    seq,
    command,
    frame,
    params(null, null, null, null, null, null, null),
    itemCoordinate,
  );

const missionItemWithParams = (
  id: string,
  seq: number,
  command: MissionItem['command'],
  frame: MissionItem['frame'],
  itemParams: MissionParams,
  itemCoordinate: MissionCoordinate | null,
): MissionItem =>
  createMissionItem({
    id,
    seq,
    command,
    frame,
    current: seq === 0,
    autocontinue: true,
    params: itemParams,
    coordinate: itemCoordinate,
  });

const validCopterPlan = (): MissionPlan =>
  createMissionPlan({
    id: 'plan-1',
    vehicleType: 'copter',
    home: coordinate(40.4168, -3.7038, 650),
    items: [
      missionItem('takeoff-1', 0, 'MAV_CMD_NAV_TAKEOFF', 'MAV_FRAME_GLOBAL_RELATIVE_ALT_INT', coordinate(40.4168, -3.7038, 30)),
      missionItem('waypoint-1', 1, 'MAV_CMD_NAV_WAYPOINT', 'MAV_FRAME_GLOBAL_RELATIVE_ALT_INT', coordinate(40.417, -3.704, 45)),
    ],
    updatedAtIso: '2026-05-20T10:00:00.000Z',
  });

describe('MissionValidation', () => {
  it('accepts a valid copter mission with takeoff and waypoint', () => {
    const result = validateMissionPlan(validCopterPlan());

    expect(result).toEqual({
      isValid: true,
      errors: [],
      warnings: [],
    });
  });

  it('reports an empty mission plan as invalid', () => {
    const plan = createMissionPlan({
      id: 'empty-plan',
      vehicleType: 'copter',
      home: coordinate(40.4168, -3.7038, 650),
      items: [],
      updatedAtIso: '2026-05-20T10:00:00.000Z',
    });

    const result = validateMissionPlan(plan);

    expect(result).toEqual({
      isValid: false,
      errors: [
        {
          severity: 'error',
          code: 'MISSION_EMPTY',
          message: 'Mission plan must contain at least one mission item.',
          itemId: null,
          seq: null,
        },
      ],
      warnings: [],
    });
  });

  it('reports missing required params for speed change commands', () => {
    const speedChange = missionItem(
      'speed-1',
      1,
      'MAV_CMD_DO_CHANGE_SPEED',
      'MAV_FRAME_MISSION',
      null,
    );
    const plan: MissionPlan = {
      ...validCopterPlan(),
      items: [validCopterPlan().items[0], speedChange],
    };

    const result = validateMissionPlan(plan);

    expect(result.isValid).toBe(false);
    expect(result.errors).toEqual(
      expect.arrayContaining([
        {
          severity: 'error',
          code: 'MISSION_PARAM_REQUIRED',
          message: 'Change Speed (MAV_CMD_DO_CHANGE_SPEED) requires Speed Type at param 1.',
          itemId: 'speed-1',
          seq: 1,
        },
        {
          severity: 'error',
          code: 'MISSION_PARAM_REQUIRED',
          message: 'Change Speed (MAV_CMD_DO_CHANGE_SPEED) requires Speed at param 2.',
          itemId: 'speed-1',
          seq: 1,
        },
      ]),
    );
  });

  it('reports missing coordinate for spatial commands', () => {
    const waypoint = missionItem(
      'waypoint-missing-coordinate',
      1,
      'MAV_CMD_NAV_WAYPOINT',
      'MAV_FRAME_GLOBAL_RELATIVE_ALT_INT',
      null,
    );
    const plan: MissionPlan = {
      ...validCopterPlan(),
      items: [validCopterPlan().items[0], waypoint],
    };

    const result = validateMissionPlan(plan);

    expect(result.isValid).toBe(false);
    expect(result.errors).toContainEqual({
      severity: 'error',
      code: 'MISSING_COORDINATE',
      message: 'Command MAV_CMD_NAV_WAYPOINT requires a coordinate.',
      itemId: 'waypoint-missing-coordinate',
      seq: 1,
    });
  });

  it('reports unexpected coordinate for non-spatial commands', () => {
    const speedChange = missionItemWithParams(
      'speed-1',
      1,
      'MAV_CMD_DO_CHANGE_SPEED',
      'MAV_FRAME_MISSION',
      params(1, 12, null, null, null, null, null),
      coordinate(40.417, -3.704, 45),
    );
    const plan: MissionPlan = {
      ...validCopterPlan(),
      items: [validCopterPlan().items[0], speedChange],
    };

    const result = validateMissionPlan(plan);

    expect(result.isValid).toBe(false);
    expect(result.errors).toContainEqual({
      severity: 'error',
      code: 'UNEXPECTED_COORDINATE',
      message: 'Command MAV_CMD_DO_CHANGE_SPEED does not allow a coordinate.',
      itemId: 'speed-1',
      seq: 1,
    });
  });

  it('accepts land commands at zero relative altitude', () => {
    const land = missionItem(
      'land-1',
      1,
      'MAV_CMD_NAV_LAND',
      'MAV_FRAME_GLOBAL_RELATIVE_ALT_INT',
      coordinate(40.417, -3.704, 0),
    );
    const plan: MissionPlan = {
      ...validCopterPlan(),
      items: [validCopterPlan().items[0], land],
    };

    const result = validateMissionPlan(plan);

    expect(result).toEqual({
      isValid: true,
      errors: [],
      warnings: [],
    });
  });

  it('accepts VTOL land commands at zero relative altitude for plane missions', () => {
    const takeoff = missionItem(
      'takeoff-1',
      0,
      'MAV_CMD_NAV_VTOL_TAKEOFF',
      'MAV_FRAME_GLOBAL_RELATIVE_ALT_INT',
      coordinate(40.4168, -3.7038, 30),
    );
    const vtolLand = missionItem(
      'vtol-land-1',
      1,
      'MAV_CMD_NAV_VTOL_LAND',
      'MAV_FRAME_GLOBAL_RELATIVE_ALT_INT',
      coordinate(40.417, -3.704, 0),
    );
    const plan = createMissionPlan({
      id: 'plane-vtol-land-plan',
      vehicleType: 'plane',
      home: coordinate(40.4168, -3.7038, 650),
      items: [takeoff, vtolLand],
      updatedAtIso: '2026-05-20T10:00:00.000Z',
    });

    const result = validateMissionPlan(plan);

    expect(result).toEqual({
      isValid: true,
      errors: [],
      warnings: [],
    });
  });

  it('reports altitude outside the vehicle profile range', () => {
    const waypoint = missionItem(
      'waypoint-high-altitude',
      1,
      'MAV_CMD_NAV_WAYPOINT',
      'MAV_FRAME_GLOBAL_RELATIVE_ALT_INT',
      coordinate(40.417, -3.704, 1001),
    );
    const plan: MissionPlan = {
      ...validCopterPlan(),
      items: [validCopterPlan().items[0], waypoint],
    };

    const result = validateMissionPlan(plan);

    expect(result.isValid).toBe(false);
    expect(result.errors).toContainEqual({
      severity: 'error',
      code: 'INVALID_ALTITUDE',
      message: 'Altitude must be finite and between 2 and 1000 meters for MAV_CMD_NAV_WAYPOINT.',
      itemId: 'waypoint-high-altitude',
      seq: 1,
    });
  });

  it('reports commands that are unsupported by the vehicle profile', () => {
    const plan: MissionPlan = {
      ...validCopterPlan(),
      vehicleType: 'rover',
    };

    const result = validateMissionPlan(plan);

    expect(result.isValid).toBe(false);
    expect(result.errors).toContainEqual({
      severity: 'error',
      code: 'UNSUPPORTED_VEHICLE_COMMAND',
      message: 'Command MAV_CMD_NAV_TAKEOFF is not supported for rover missions.',
      itemId: 'takeoff-1',
      seq: 0,
    });
  });

  it('reports invalid coordinates', () => {
    const invalidWaypoint = missionItem(
      'waypoint-invalid-coordinate',
      1,
      'MAV_CMD_NAV_WAYPOINT',
      'MAV_FRAME_GLOBAL_RELATIVE_ALT_INT',
      coordinate(91, Number.NaN, 45),
    );
    const plan: MissionPlan = {
      ...validCopterPlan(),
      items: [validCopterPlan().items[0], invalidWaypoint],
    };

    const result = validateMissionPlan(plan);

    expect(result.isValid).toBe(false);
    expect(result.errors).toEqual(
      expect.arrayContaining([
        {
          severity: 'error',
          code: 'INVALID_COORDINATE',
          message: 'Latitude must be finite and between -90 and 90 degrees.',
          itemId: 'waypoint-invalid-coordinate',
          seq: 1,
        },
        {
          severity: 'error',
          code: 'INVALID_COORDINATE',
          message: 'Longitude must be finite and between -180 and 180 degrees.',
          itemId: 'waypoint-invalid-coordinate',
          seq: 1,
        },
      ]),
    );
  });

  it('reports frames that are unsupported by the command definition', () => {
    const plan: MissionPlan = {
      ...validCopterPlan(),
      items: [
        validCopterPlan().items[0],
        missionItem('delay-1', 1, 'MAV_CMD_NAV_DELAY', 'MAV_FRAME_GLOBAL_RELATIVE_ALT_INT', null),
      ],
    };

    const result = validateMissionPlan(plan);

    expect(result.isValid).toBe(false);
    expect(result.errors).toContainEqual({
      severity: 'error',
      code: 'INVALID_FRAME',
      message: 'Frame MAV_FRAME_GLOBAL_RELATIVE_ALT_INT is not supported for command MAV_CMD_NAV_DELAY.',
      itemId: 'delay-1',
      seq: 1,
    });
  });

  it('reports non-contiguous sequence numbers by current item order', () => {
    const plan: MissionPlan = {
      ...validCopterPlan(),
      items: [
        validCopterPlan().items[0],
        {
          ...validCopterPlan().items[1],
          seq: 3,
        },
      ],
    };

    const result = validateMissionPlan(plan);

    expect(result.isValid).toBe(false);
    expect(result.errors).toContainEqual({
      severity: 'error',
      code: 'NON_CONTIGUOUS_SEQUENCE',
      message: 'Mission item sequence must match current item order. Expected seq 1 but received 3.',
      itemId: 'waypoint-1',
      seq: 3,
    });
  });
});
