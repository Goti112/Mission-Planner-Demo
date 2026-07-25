import {
  createMissionItem,
  getMissionCommandDefinition,
  type MissionCommand,
  type MissionCoordinate,
  type MissionItem,
  type MissionParamValue,
  type MissionParams,
} from '../domain';

const emptyParams = (): MissionParams => [null, null, null, null, null, null, null];

const paramsWithValues = (values: Partial<Record<number, MissionParamValue>>): MissionParams => [
  values[0] ?? null,
  values[1] ?? null,
  values[2] ?? null,
  values[3] ?? null,
  values[4] ?? null,
  values[5] ?? null,
  values[6] ?? null,
];

const commandDefaultParams = (
  command: MissionCommand,
  defaultCoordinate: MissionCoordinate,
): MissionParams => {
  switch (command) {
    case 'MAV_CMD_NAV_TAKEOFF':
      return paramsWithValues({ 6: defaultCoordinate.alt });
    case 'MAV_CMD_NAV_VTOL_TAKEOFF':
      return paramsWithValues({ 6: defaultCoordinate.alt });
    case 'MAV_CMD_NAV_WAYPOINT':
    case 'MAV_CMD_NAV_SPLINE_WAYPOINT':
      return paramsWithValues({ 0: 0 });
    case 'MAV_CMD_NAV_LOITER_TIME':
      return paramsWithValues({ 0: 30 });
    case 'MAV_CMD_NAV_LOITER_TURNS':
      return paramsWithValues({ 0: 1 });
    case 'MAV_CMD_NAV_LOITER_UNLIM':
    case 'MAV_CMD_NAV_RETURN_TO_LAUNCH':
      return emptyParams();
    case 'MAV_CMD_NAV_LAND':
      return emptyParams();
    case 'MAV_CMD_NAV_VTOL_LAND':
      return paramsWithValues({ 0: 0, 6: defaultCoordinate.alt });
    case 'MAV_CMD_DO_CHANGE_SPEED':
      return paramsWithValues({ 0: 1, 1: 8 });
    case 'MAV_CMD_DO_SET_SERVO':
      return paramsWithValues({ 0: 1, 1: 1500 });
    case 'MAV_CMD_DO_SET_RELAY':
      return paramsWithValues({ 0: 0, 1: 1 });
    case 'MAV_CMD_DO_DIGICAM_CONTROL':
      return paramsWithValues({ 4: 1 });
    case 'MAV_CMD_DO_SET_CAM_TRIGG_DIST':
      return paramsWithValues({ 0: 25, 2: 0 });
    case 'MAV_CMD_DO_SET_ROI':
      return paramsWithValues({ 0: 3 });
    case 'MAV_CMD_DO_LAND_START':
      return paramsWithValues({
        4: defaultCoordinate.lat,
        5: defaultCoordinate.lng,
        6: defaultCoordinate.alt,
      });
    case 'MAV_CMD_NAV_DELAY':
      return paramsWithValues({ 0: 30 });
  }
};

const createMissionItemId = (): string => {
  if (globalThis.crypto === undefined || typeof globalThis.crypto.randomUUID !== 'function') {
    throw new Error('Cannot create mission item id because crypto.randomUUID is unavailable.');
  }

  return `planner-item-${globalThis.crypto.randomUUID()}`;
};

export const createDefaultMissionItem = (
  command: MissionCommand,
  seq: number,
  defaultCoordinate: MissionCoordinate,
): MissionItem => {
  const definition = getMissionCommandDefinition(command);
  const coordinate = definition.hasCoordinate ? defaultCoordinate : null;

  return createMissionItem({
    id: createMissionItemId(),
    seq,
    command,
    frame: definition.defaultFrame,
    current: seq === 0,
    autocontinue: true,
    params: commandDefaultParams(command, defaultCoordinate),
    coordinate,
  });
};
