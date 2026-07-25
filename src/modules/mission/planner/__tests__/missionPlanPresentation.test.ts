import { describe, expect, it } from 'vitest';
import type { MissionValidationIssue } from '../../domain';
import type { MissionPlanExecutionIssue } from '../missionPlanAdapter';
import {
  formatMissionDistance,
  formatMissionDuration,
  getMissionCommandShortLabel,
  getMissionCommandGroups,
  getMissionParamDisplays,
  toMissionIssueBadges,
} from '../missionPlanPresentation';

describe('missionPlanPresentation', () => {
  it('groups allowed commands by catalog category while preserving vehicle order', () => {
    expect(getMissionCommandGroups('rover')).toEqual([
      {
        title: 'Nav',
        commands: ['MAV_CMD_NAV_WAYPOINT', 'MAV_CMD_NAV_RETURN_TO_LAUNCH', 'MAV_CMD_NAV_DELAY'],
      },
      {
        title: 'Do',
        commands: ['MAV_CMD_DO_CHANGE_SPEED', 'MAV_CMD_DO_SET_SERVO', 'MAV_CMD_DO_SET_RELAY'],
      },
    ]);
  });

  it('shows distinct short labels for loiter commands', () => {
    expect(getMissionCommandShortLabel('MAV_CMD_NAV_LOITER_UNLIM')).toBe('Loiter Unlimited');
    expect(getMissionCommandShortLabel('MAV_CMD_NAV_LOITER_TURNS')).toBe('Loiter Turns');
    expect(getMissionCommandShortLabel('MAV_CMD_NAV_LOITER_TIME')).toBe('Loiter Time');
  });

  it('shows short labels and plane grouping for VTOL mission commands', () => {
    expect(getMissionCommandShortLabel('MAV_CMD_NAV_VTOL_TAKEOFF')).toBe('VTOL Takeoff');
    expect(getMissionCommandShortLabel('MAV_CMD_NAV_VTOL_LAND')).toBe('VTOL Land');
    expect(getMissionCommandShortLabel('MAV_CMD_DO_LAND_START')).toBe('Land Start');

    const planeGroups = getMissionCommandGroups('plane');
    const planeNav = planeGroups.find((group) => group.title === 'Nav');
    const planeDo = planeGroups.find((group) => group.title === 'Do');

    expect(planeNav?.commands).toEqual(
      expect.arrayContaining(['MAV_CMD_NAV_VTOL_TAKEOFF', 'MAV_CMD_NAV_VTOL_LAND']),
    );
    expect(planeDo?.commands).toEqual(expect.arrayContaining(['MAV_CMD_DO_LAND_START']));

    const copterCommands = getMissionCommandGroups('copter').flatMap((group) => group.commands);
    expect(copterCommands).not.toContain('MAV_CMD_NAV_VTOL_TAKEOFF');
    expect(copterCommands).not.toContain('MAV_CMD_NAV_VTOL_LAND');
    expect(copterCommands).not.toContain('MAV_CMD_DO_LAND_START');
  });

  it('formats mission distance values', () => {
    expect(formatMissionDistance(0)).toBe('0 m');
    expect(formatMissionDistance(999.5)).toBe('1000 m');
    expect(formatMissionDistance(1234)).toBe('1.2 km');
    expect(() => formatMissionDistance(-1)).toThrow('Mission distance must be finite');
  });

  it('formats mission duration values', () => {
    expect(formatMissionDuration(12.4)).toBe('12s');
    expect(formatMissionDuration(59.6)).toBe('60s');
    expect(formatMissionDuration(125)).toBe('2m 5s');
    expect(formatMissionDuration(3599.6)).toBe('60m 0s');
    expect(formatMissionDuration(3725)).toBe('1h 2m');
    expect(() => formatMissionDuration(Number.POSITIVE_INFINITY)).toThrow('Mission duration must be finite');
  });

  it('throws when param display input does not contain exactly seven params', () => {
    expect(() => getMissionParamDisplays('MAV_CMD_NAV_WAYPOINT', [1, 2])).toThrow(
      'Mission command MAV_CMD_NAV_WAYPOINT must have exactly 7 params for display; length=2.',
    );
  });

  it('converts validation and execution issues to tone badges', () => {
    const validationError: MissionValidationIssue = {
      severity: 'error',
      code: 'invalid-coordinate',
      message: 'Latitude is invalid.',
      itemId: 'item-1',
      seq: 1,
    };
    const validationWarning: MissionValidationIssue = {
      severity: 'warning',
      code: 'missing-home',
      message: 'Home is missing.',
      itemId: null,
      seq: null,
    };
    const executionBlocker: MissionPlanExecutionIssue = {
      itemId: 'item-2',
      seq: 2,
      command: 'MAV_CMD_DO_CHANGE_SPEED',
      message: 'Command cannot upload.',
    };
    const executionWarning: MissionPlanExecutionIssue = {
      itemId: 'item-3',
      seq: 3,
      command: 'MAV_CMD_DO_SET_SERVO',
      message: 'Command cannot simulate.',
    };

    expect(
      toMissionIssueBadges({
        validationErrors: [validationError],
        validationWarnings: [validationWarning],
        executionBlockers: [executionBlocker],
        executionWarnings: [executionWarning],
      }),
    ).toEqual([
      {
        tone: 'error',
        message: 'Latitude is invalid.',
        itemId: 'item-1',
        seq: 1,
      },
      {
        tone: 'error',
        message: 'Command cannot upload.',
        itemId: 'item-2',
        seq: 2,
      },
      {
        tone: 'warning',
        message: 'Home is missing.',
        itemId: null,
        seq: null,
      },
      {
        tone: 'warning',
        message: 'Command cannot simulate.',
        itemId: 'item-3',
        seq: 3,
      },
    ]);
  });
});
