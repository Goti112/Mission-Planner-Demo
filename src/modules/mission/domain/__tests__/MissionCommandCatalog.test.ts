import { describe, expect, it } from 'vitest';
import {
  MISSION_COMMAND_CATALOG,
  getMissionCommandDefinition,
  isSpatialMissionCommand,
} from '../MissionCommandCatalog';
import { MISSION_COMMANDS } from '../MissionTypes';
import type { MissionCommandParamDefinition, MissionParamIndex } from '../MissionTypes';

const getParamDefinition = (
  params: readonly MissionCommandParamDefinition[],
  index: MissionParamIndex,
): MissionCommandParamDefinition => {
  const paramDefinition = params.find((param) => param.index === index);

  if (paramDefinition === undefined) {
    throw new Error(`Missing mission command param definition: ${index}`);
  }

  return paramDefinition;
};

describe('MissionCommandCatalog', () => {
  it('defines every supported command exactly once with seven params', () => {
    const definitions = Object.values(MISSION_COMMAND_CATALOG);
    const mavlinkIds = definitions.map((definition) => definition.mavlinkId);

    expect(definitions).toHaveLength(MISSION_COMMANDS.length);
    expect(new Set(mavlinkIds).size).toBe(mavlinkIds.length);
    expect(definitions.every((definition) => definition.params.length === 7)).toBe(true);
  });

  it('marks coordinate-bearing Mission Planner commands as spatial', () => {
    expect(isSpatialMissionCommand('MAV_CMD_NAV_WAYPOINT')).toBe(true);
    expect(isSpatialMissionCommand('MAV_CMD_NAV_TAKEOFF')).toBe(true);
    expect(isSpatialMissionCommand('MAV_CMD_DO_CHANGE_SPEED')).toBe(false);
    expect(isSpatialMissionCommand('MAV_CMD_NAV_DELAY')).toBe(false);
  });

  it('returns command metadata by command name', () => {
    const definition = getMissionCommandDefinition('MAV_CMD_NAV_WAYPOINT');

    expect(definition.mavlinkId).toBe(16);
    expect(definition.label).toBe('Waypoint');
    expect(definition.defaultFrame).toBe('MAV_FRAME_GLOBAL_RELATIVE_ALT_INT');
    expect(definition.supportedFrames).toEqual([
      'MAV_FRAME_GLOBAL_RELATIVE_ALT_INT',
      'MAV_FRAME_GLOBAL_INT',
      'MAV_FRAME_GLOBAL_TERRAIN_ALT_INT',
    ]);
  });

  it('defines NAV_DELAY as a mission-frame command', () => {
    const definition = getMissionCommandDefinition('MAV_CMD_NAV_DELAY');

    expect(definition.defaultFrame).toBe('MAV_FRAME_MISSION');
    expect(definition.supportedFrames).toEqual(['MAV_FRAME_MISSION']);
  });

  it('preserves spatial coordinate param metadata', () => {
    const definition = getMissionCommandDefinition('MAV_CMD_NAV_WAYPOINT');

    expect(getParamDefinition(definition.params, 5)).toMatchObject({
      label: 'Latitude',
      unit: 'deg',
      required: true,
    });
    expect(getParamDefinition(definition.params, 6)).toMatchObject({
      label: 'Longitude',
      unit: 'deg',
      required: true,
    });
    expect(getParamDefinition(definition.params, 7)).toMatchObject({
      label: 'Altitude',
      unit: 'm',
      required: true,
    });
  });

  it('preserves DO_CHANGE_SPEED speed param metadata', () => {
    const definition = getMissionCommandDefinition('MAV_CMD_DO_CHANGE_SPEED');

    expect(getParamDefinition(definition.params, 2)).toMatchObject({
      label: 'Speed',
      unit: 'm/s',
      required: true,
    });
  });

  it('preserves NAV_DELAY delay metadata and unused param labels', () => {
    const definition = getMissionCommandDefinition('MAV_CMD_NAV_DELAY');

    expect(getParamDefinition(definition.params, 1)).toMatchObject({
      label: 'Delay',
      unit: 's',
      required: true,
    });
    expect(getParamDefinition(definition.params, 5)).toMatchObject({
      label: 'Param 5',
      unit: null,
      required: false,
    });
  });

  it('defines VTOL takeoff, VTOL land, and land-start command metadata', () => {
    const vtolTakeoff = getMissionCommandDefinition('MAV_CMD_NAV_VTOL_TAKEOFF');
    const vtolLand = getMissionCommandDefinition('MAV_CMD_NAV_VTOL_LAND');
    const landStart = getMissionCommandDefinition('MAV_CMD_DO_LAND_START');

    expect(vtolTakeoff).toMatchObject({
      mavlinkId: 84,
      label: 'VTOL Takeoff',
      category: 'nav',
      hasCoordinate: true,
      defaultFrame: 'MAV_FRAME_GLOBAL_RELATIVE_ALT_INT',
    });
    expect(getParamDefinition(vtolTakeoff.params, 2)).toMatchObject({
      label: 'Transition Heading',
      unit: 'enum',
      required: false,
    });
    expect(getParamDefinition(vtolTakeoff.params, 7)).toMatchObject({
      label: 'Altitude',
      unit: 'm',
      required: true,
    });

    expect(vtolLand).toMatchObject({
      mavlinkId: 85,
      label: 'VTOL Land',
      category: 'nav',
      hasCoordinate: true,
    });
    expect(getParamDefinition(vtolLand.params, 1)).toMatchObject({
      label: 'Land Options',
      unit: 'enum',
      required: false,
    });
    expect(getParamDefinition(vtolLand.params, 3)).toMatchObject({
      label: 'Approach Altitude',
      unit: 'm',
      required: false,
    });
    expect(getParamDefinition(vtolLand.params, 7)).toMatchObject({
      label: 'Ground Altitude',
      unit: 'm',
      required: true,
    });

    expect(landStart).toMatchObject({
      mavlinkId: 189,
      label: 'Land Start',
      category: 'do',
      hasCoordinate: true,
    });
    expect(getParamDefinition(landStart.params, 5)).toMatchObject({
      label: 'Latitude',
      unit: 'deg',
      required: true,
    });
  });
});
