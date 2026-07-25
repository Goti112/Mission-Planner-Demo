import { describe, expect, it, vi } from 'vitest';

vi.mock('../../../telemetry', async () => import('../../../telemetry/core/FlightTelemetryModel'));

import {
  createMissionItem,
  createMissionPlan,
  type MissionCoordinate,
  type MissionItem,
  type MissionParams,
  type MissionPlan,
} from '../../domain';
import {
  buildLegacyWaypointsFromMissionPlan,
  evaluateMissionPlanExecution,
} from '../missionPlanAdapter';

const coordinate = (lat: number, lng: number, alt: number): MissionCoordinate => ({ lat, lng, alt });

const params = (): MissionParams => [null, null, null, null, null, null, null];

const missionItem = (
  id: string,
  seq: number,
  command: MissionItem['command'],
  itemCoordinate: MissionCoordinate | null,
): MissionItem =>
  createMissionItem({
    id,
    seq,
    command,
    frame: itemCoordinate === null ? 'MAV_FRAME_MISSION' : 'MAV_FRAME_GLOBAL_RELATIVE_ALT_INT',
    current: seq === 0,
    autocontinue: true,
    params: command === 'MAV_CMD_DO_CHANGE_SPEED' ? [1, 12, null, null, null, null, null] : params(),
    coordinate: itemCoordinate,
  });

const missionPlan = (items: readonly MissionItem[]): MissionPlan =>
  createMissionPlan({
    id: 'plan-1',
    vehicleType: 'copter',
    home: coordinate(40.4168, -3.7038, 650),
    items,
    updatedAtIso: '2026-06-02T10:00:00.000Z',
  });

describe('missionPlanAdapter', () => {
  it('projects simulation route waypoints and warns for non-navigation commands', () => {
    const plan = missionPlan([
      missionItem('takeoff-1', 0, 'MAV_CMD_NAV_TAKEOFF', coordinate(40.4168, -3.7038, 30)),
      missionItem('waypoint-1', 1, 'MAV_CMD_NAV_WAYPOINT', coordinate(40.417, -3.704, 45)),
      missionItem('speed-1', 2, 'MAV_CMD_DO_CHANGE_SPEED', null),
    ]);

    const projection = buildLegacyWaypointsFromMissionPlan(plan);

    expect(projection.waypoints).toEqual([
      { id: 'takeoff-1', lat: 40.4168, lng: -3.7038, altitude: 30 },
      { id: 'waypoint-1', lat: 40.417, lng: -3.704, altitude: 45 },
    ]);
    expect(projection.warnings).toContainEqual({
      itemId: 'speed-1',
      seq: 2,
      command: 'MAV_CMD_DO_CHANGE_SPEED',
      message: 'Simulation does not execute non-navigation command MAV_CMD_DO_CHANGE_SPEED.',
    });
  });

  it('evaluates execution exclusively as a simulation without accepting a mode', () => {
    const plan = missionPlan([
      missionItem('takeoff-1', 0, 'MAV_CMD_NAV_TAKEOFF', coordinate(40.4168, -3.7038, 30)),
      missionItem('waypoint-1', 1, 'MAV_CMD_NAV_WAYPOINT', coordinate(40.417, -3.704, 45)),
      missionItem('speed-1', 2, 'MAV_CMD_DO_CHANGE_SPEED', null),
    ]);

    const readiness = evaluateMissionPlanExecution({ plan });

    expect(readiness).toMatchObject({
      mode: 'SIM',
      canExecute: true,
      blockers: [],
      simulatedCount: 2,
    });
    expect(readiness.warnings).toContainEqual({
      itemId: 'speed-1',
      seq: 2,
      command: 'MAV_CMD_DO_CHANGE_SPEED',
      message: 'Simulation does not execute non-navigation command MAV_CMD_DO_CHANGE_SPEED.',
    });
  });

  it('blocks simulations without a spatial navigation waypoint', () => {
    const readiness = evaluateMissionPlanExecution({ plan: missionPlan([]) });

    expect(readiness).toMatchObject({
      mode: 'SIM',
      canExecute: false,
      simulatedCount: 0,
    });
    expect(readiness.blockers).toContainEqual({
      itemId: null,
      seq: null,
      command: null,
      message: 'Simulation requires at least one spatial navigation waypoint.',
    });
  });
});
