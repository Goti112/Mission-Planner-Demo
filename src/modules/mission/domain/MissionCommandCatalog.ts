import type {
  MissionCommand,
  MissionCommandDefinition,
  MissionCommandParamDefinition,
  MissionParamIndex,
  MissionFrame,
} from './MissionTypes';

const SPATIAL_FRAME: MissionFrame = 'MAV_FRAME_GLOBAL_RELATIVE_ALT_INT';
const SPATIAL_FRAMES: readonly MissionFrame[] = [
  'MAV_FRAME_GLOBAL_RELATIVE_ALT_INT',
  'MAV_FRAME_GLOBAL_INT',
  'MAV_FRAME_GLOBAL_TERRAIN_ALT_INT',
];
const MISSION_FRAME: MissionFrame = 'MAV_FRAME_MISSION';

const missionParam = (
  index: MissionParamIndex,
  label: string,
  unit: string | null,
  required: boolean,
): MissionCommandParamDefinition => ({
  index,
  label,
  unit,
  required,
});

const unusedMissionParam = (index: MissionParamIndex): MissionCommandParamDefinition =>
  missionParam(index, `Param ${index}`, null, false);

const missionParams = (
  param1: MissionCommandParamDefinition,
  param2: MissionCommandParamDefinition,
  param3: MissionCommandParamDefinition,
  param4: MissionCommandParamDefinition,
  param5: MissionCommandParamDefinition,
  param6: MissionCommandParamDefinition,
  param7: MissionCommandParamDefinition,
): readonly MissionCommandParamDefinition[] => [param1, param2, param3, param4, param5, param6, param7];

const coordinateParams = (): readonly [
  MissionCommandParamDefinition,
  MissionCommandParamDefinition,
  MissionCommandParamDefinition,
] => [
  missionParam(5, 'Latitude', 'deg', true),
  missionParam(6, 'Longitude', 'deg', true),
  missionParam(7, 'Altitude', 'm', true),
];

const spatialMissionParams = (
  param1: MissionCommandParamDefinition,
  param2: MissionCommandParamDefinition,
  param3: MissionCommandParamDefinition,
  param4: MissionCommandParamDefinition,
): readonly MissionCommandParamDefinition[] => {
  const coordinates = coordinateParams();

  return missionParams(param1, param2, param3, param4, coordinates[0], coordinates[1], coordinates[2]);
};

const emptyParamDefinitions = (): readonly MissionCommandParamDefinition[] =>
  missionParams(
    unusedMissionParam(1),
    unusedMissionParam(2),
    unusedMissionParam(3),
    unusedMissionParam(4),
    unusedMissionParam(5),
    unusedMissionParam(6),
    unusedMissionParam(7),
  );

const spatialMissionDefinition = (
  command: MissionCommand,
  mavlinkId: number,
  label: string,
  params: readonly MissionCommandParamDefinition[],
): MissionCommandDefinition => ({
  command,
  mavlinkId,
  label,
  category: command.startsWith('MAV_CMD_NAV_') ? 'nav' : 'do',
  hasCoordinate: true,
  defaultFrame: SPATIAL_FRAME,
  supportedFrames: SPATIAL_FRAMES,
  params,
});

const missionDefinition = (
  command: MissionCommand,
  mavlinkId: number,
  label: string,
  category: 'nav' | 'do',
  params: readonly MissionCommandParamDefinition[],
): MissionCommandDefinition => ({
  command,
  mavlinkId,
  label,
  category,
  hasCoordinate: false,
  defaultFrame: MISSION_FRAME,
  supportedFrames: [MISSION_FRAME],
  params,
});

export const MISSION_COMMAND_CATALOG: Record<MissionCommand, MissionCommandDefinition> = {
  MAV_CMD_NAV_TAKEOFF: spatialMissionDefinition(
    'MAV_CMD_NAV_TAKEOFF',
    22,
    'Takeoff',
    spatialMissionParams(
      missionParam(1, 'Pitch', 'deg', false),
      unusedMissionParam(2),
      unusedMissionParam(3),
      missionParam(4, 'Yaw', 'deg', false),
    ),
  ),
  MAV_CMD_NAV_VTOL_TAKEOFF: spatialMissionDefinition(
    'MAV_CMD_NAV_VTOL_TAKEOFF',
    84,
    'VTOL Takeoff',
    spatialMissionParams(
      unusedMissionParam(1),
      missionParam(2, 'Transition Heading', 'enum', false),
      unusedMissionParam(3),
      missionParam(4, 'Yaw', 'deg', false),
    ),
  ),
  MAV_CMD_NAV_WAYPOINT: spatialMissionDefinition(
    'MAV_CMD_NAV_WAYPOINT',
    16,
    'Waypoint',
    spatialMissionParams(
      missionParam(1, 'Hold', 's', false),
      missionParam(2, 'Accept Radius', 'm', false),
      missionParam(3, 'Pass Radius', 'm', false),
      missionParam(4, 'Yaw', 'deg', false),
    ),
  ),
  MAV_CMD_NAV_SPLINE_WAYPOINT: spatialMissionDefinition(
    'MAV_CMD_NAV_SPLINE_WAYPOINT',
    82,
    'Spline Waypoint',
    spatialMissionParams(
      missionParam(1, 'Hold', 's', false),
      unusedMissionParam(2),
      unusedMissionParam(3),
      unusedMissionParam(4),
    ),
  ),
  MAV_CMD_NAV_LOITER_UNLIM: spatialMissionDefinition(
    'MAV_CMD_NAV_LOITER_UNLIM',
    17,
    'Loiter Unlimited',
    spatialMissionParams(
      unusedMissionParam(1),
      unusedMissionParam(2),
      missionParam(3, 'Radius', 'm', false),
      missionParam(4, 'Yaw', 'deg', false),
    ),
  ),
  MAV_CMD_NAV_LOITER_TURNS: spatialMissionDefinition(
    'MAV_CMD_NAV_LOITER_TURNS',
    18,
    'Loiter Turns',
    spatialMissionParams(
      missionParam(1, 'Turns', 'turns', true),
      unusedMissionParam(2),
      missionParam(3, 'Radius', 'm', false),
      missionParam(4, 'Yaw', 'deg', false),
    ),
  ),
  MAV_CMD_NAV_LOITER_TIME: spatialMissionDefinition(
    'MAV_CMD_NAV_LOITER_TIME',
    19,
    'Loiter Time',
    spatialMissionParams(
      missionParam(1, 'Time', 's', true),
      unusedMissionParam(2),
      missionParam(3, 'Radius', 'm', false),
      missionParam(4, 'Yaw', 'deg', false),
    ),
  ),
  MAV_CMD_NAV_LAND: spatialMissionDefinition(
    'MAV_CMD_NAV_LAND',
    21,
    'Land',
    spatialMissionParams(
      missionParam(1, 'Abort Altitude', 'm', false),
      missionParam(2, 'Precision Land Mode', 'enum', false),
      unusedMissionParam(3),
      missionParam(4, 'Yaw', 'deg', false),
    ),
  ),
  MAV_CMD_NAV_VTOL_LAND: spatialMissionDefinition(
    'MAV_CMD_NAV_VTOL_LAND',
    85,
    'VTOL Land',
    missionParams(
      missionParam(1, 'Land Options', 'enum', false),
      unusedMissionParam(2),
      missionParam(3, 'Approach Altitude', 'm', false),
      missionParam(4, 'Yaw', 'deg', false),
      missionParam(5, 'Latitude', 'deg', true),
      missionParam(6, 'Longitude', 'deg', true),
      missionParam(7, 'Ground Altitude', 'm', true),
    ),
  ),
  MAV_CMD_NAV_RETURN_TO_LAUNCH: missionDefinition(
    'MAV_CMD_NAV_RETURN_TO_LAUNCH',
    20,
    'Return to Launch',
    'nav',
    emptyParamDefinitions(),
  ),
  MAV_CMD_DO_CHANGE_SPEED: missionDefinition(
    'MAV_CMD_DO_CHANGE_SPEED',
    178,
    'Change Speed',
    'do',
    missionParams(
      missionParam(1, 'Speed Type', 'enum', true),
      missionParam(2, 'Speed', 'm/s', true),
      missionParam(3, 'Throttle', '%', false),
      unusedMissionParam(4),
      unusedMissionParam(5),
      unusedMissionParam(6),
      unusedMissionParam(7),
    ),
  ),
  MAV_CMD_DO_SET_SERVO: missionDefinition(
    'MAV_CMD_DO_SET_SERVO',
    183,
    'Set Servo',
    'do',
    missionParams(
      missionParam(1, 'Servo', 'index', true),
      missionParam(2, 'PWM', 'us', true),
      unusedMissionParam(3),
      unusedMissionParam(4),
      unusedMissionParam(5),
      unusedMissionParam(6),
      unusedMissionParam(7),
    ),
  ),
  MAV_CMD_DO_SET_RELAY: missionDefinition(
    'MAV_CMD_DO_SET_RELAY',
    181,
    'Set Relay',
    'do',
    missionParams(
      missionParam(1, 'Relay', 'index', true),
      missionParam(2, 'State', 'bool', true),
      unusedMissionParam(3),
      unusedMissionParam(4),
      unusedMissionParam(5),
      unusedMissionParam(6),
      unusedMissionParam(7),
    ),
  ),
  MAV_CMD_DO_DIGICAM_CONTROL: missionDefinition(
    'MAV_CMD_DO_DIGICAM_CONTROL',
    203,
    'Digicam Control',
    'do',
    missionParams(
      missionParam(1, 'Session Control', 'enum', false),
      missionParam(2, 'Zoom Position', '%', false),
      missionParam(3, 'Zoom Step', 'step', false),
      missionParam(4, 'Focus Lock', 'bool', false),
      missionParam(5, 'Shoot Command', 'bool', false),
      missionParam(6, 'Command ID', 'id', false),
      unusedMissionParam(7),
    ),
  ),
  MAV_CMD_DO_SET_CAM_TRIGG_DIST: missionDefinition(
    'MAV_CMD_DO_SET_CAM_TRIGG_DIST',
    206,
    'Set Camera Trigger Distance',
    'do',
    missionParams(
      missionParam(1, 'Distance', 'm', true),
      unusedMissionParam(2),
      missionParam(3, 'Trigger Immediately', 'bool', false),
      unusedMissionParam(4),
      unusedMissionParam(5),
      unusedMissionParam(6),
      unusedMissionParam(7),
    ),
  ),
  MAV_CMD_DO_SET_ROI: spatialMissionDefinition(
    'MAV_CMD_DO_SET_ROI',
    201,
    'Set ROI',
    spatialMissionParams(
      missionParam(1, 'ROI Mode', 'enum', true),
      missionParam(2, 'Mission Index', 'seq', false),
      missionParam(3, 'ROI Index', 'index', false),
      unusedMissionParam(4),
    ),
  ),
  MAV_CMD_DO_LAND_START: spatialMissionDefinition(
    'MAV_CMD_DO_LAND_START',
    189,
    'Land Start',
    spatialMissionParams(
      unusedMissionParam(1),
      unusedMissionParam(2),
      unusedMissionParam(3),
      unusedMissionParam(4),
    ),
  ),
  MAV_CMD_NAV_DELAY: missionDefinition(
    'MAV_CMD_NAV_DELAY',
    93,
    'Delay',
    'nav',
    missionParams(
      missionParam(1, 'Delay', 's', true),
      missionParam(2, 'Hour', 'h', false),
      missionParam(3, 'Minute', 'm', false),
      missionParam(4, 'Second', 's', false),
      unusedMissionParam(5),
      unusedMissionParam(6),
      unusedMissionParam(7),
    ),
  ),
};

export const getMissionCommandDefinition = (command: MissionCommand): MissionCommandDefinition =>
  MISSION_COMMAND_CATALOG[command];

export const isSpatialMissionCommand = (command: MissionCommand): boolean =>
  MISSION_COMMAND_CATALOG[command].hasCoordinate;
