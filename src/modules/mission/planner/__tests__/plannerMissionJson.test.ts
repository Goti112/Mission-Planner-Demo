import { describe, expect, it } from 'vitest';
import {
  createMissionItem,
  createMissionPlan,
  type MissionItem,
  type MissionParams,
  type MissionPlan,
} from '../../domain';
import { emptyAdvancedMissionPlan } from '../advancedMissionTypes';
import type { PlannerMissionRecord } from '../types';
import {
  PlannerMissionJsonError,
  exportPlannerMissionToJson,
  readPlannerMissionJson,
} from '../plannerMissionJson';

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
    params: params(null, null, null, null, null, null, null),
    coordinate: {
      lat: 40.4168,
      lng: -3.7038,
      alt: 60,
    },
  });

const missionPlan = (): MissionPlan =>
  createMissionPlan({
    id: 'plan-1',
    vehicleType: 'copter',
    home: {
      lat: 40.4168,
      lng: -3.7038,
      alt: 650,
    },
    items: [waypoint('item-1', 0)],
    updatedAtIso: '2026-06-30T09:00:00.000Z',
  });

const plannerMissionRecord = (): PlannerMissionRecord => ({
  id: 'mission-1',
  name: 'Madrid survey',
  droneId: 'drone-1',
  plan: missionPlan(),
  advanced: emptyAdvancedMissionPlan(),
  status: 'idle',
  currentItemIndex: 0,
  progress: 0,
  legacyMissionId: null,
});

describe('plannerMissionJson', () => {
  it('round-trips exported planner mission JSON through the strict decoder', () => {
    const mission = plannerMissionRecord();
    const imported = readPlannerMissionJson(exportPlannerMissionToJson(mission));

    expect(imported.name).toBe('Madrid survey');
    expect(imported.plan).toEqual(mission.plan);
    expect(imported.plan).not.toBe(mission.plan);
    expect(imported.advanced).toEqual(mission.advanced);
  });

  it('rejects malformed mission items at the import boundary', () => {
    const parsed = JSON.parse(exportPlannerMissionToJson(plannerMissionRecord())) as {
      mission: {
        plan: {
          items: Array<Record<string, unknown>>;
        };
      };
    };
    delete parsed.mission.plan.items[0].params;

    expect(() => readPlannerMissionJson(JSON.stringify(parsed))).toThrowError(PlannerMissionJsonError);
    expect(() => readPlannerMissionJson(JSON.stringify(parsed))).toThrowError(
      'mission.plan.items[0].params must be an array',
    );
  });

  it('promotes first legacy spatial item to home when imported JSON has null home', () => {
    const exported = JSON.parse(exportPlannerMissionToJson(plannerMissionRecord())) as {
      mission: {
        plan: {
          home: unknown;
          items: Array<Record<string, unknown>>;
        };
      };
    };
    exported.mission.plan.home = null;
    exported.mission.plan.items = [
      {
        ...exported.mission.plan.items[0],
        id: 'legacy-home',
        coordinate: { lat: 40.4168, lng: -3.7038, alt: 650 },
      },
      {
        ...exported.mission.plan.items[0],
        id: 'wp-1',
        coordinate: { lat: 40.417, lng: -3.704, alt: 60 },
      },
    ];

    const imported = readPlannerMissionJson(JSON.stringify(exported));

    expect(imported.plan.home).toEqual({ lat: 40.4168, lng: -3.7038, alt: 650 });
    expect(imported.plan.items.map((item) => item.id)).toEqual(['wp-1']);
    expect(imported.plan.items.map((item) => item.seq)).toEqual([0]);
  });

  it('rejects malformed advanced layers before they reach the planner store', () => {
    const parsed = JSON.parse(exportPlannerMissionToJson(plannerMissionRecord())) as {
      mission: {
        advanced: {
          fences: unknown[];
        };
      };
    };
    parsed.mission.advanced.fences = [
      {
        id: 'fence-1',
        name: 'Bad fence',
        boundary: 'inclusion',
        shape: 'circle',
        center: { lat: 40, lng: -3 },
        radiusM: -10,
        minAltitudeM: null,
        maxAltitudeM: null,
      },
    ];

    expect(() => readPlannerMissionJson(JSON.stringify(parsed))).toThrowError(PlannerMissionJsonError);
    expect(() => readPlannerMissionJson(JSON.stringify(parsed))).toThrowError(
      'mission.advanced.fences[0].radiusM must be greater than 0',
    );
  });
});
