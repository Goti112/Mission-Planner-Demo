import type { MissionCommand, MissionVehicleProfile, MissionVehicleType } from './MissionTypes';

const DEFAULT_FRAME = 'MAV_FRAME_GLOBAL_RELATIVE_ALT_INT';

const SHARED_DO_COMMANDS: readonly MissionCommand[] = [
  'MAV_CMD_DO_CHANGE_SPEED',
  'MAV_CMD_DO_SET_SERVO',
  'MAV_CMD_DO_SET_RELAY',
  'MAV_CMD_DO_DIGICAM_CONTROL',
  'MAV_CMD_DO_SET_CAM_TRIGG_DIST',
  'MAV_CMD_DO_SET_ROI',
];

const SHARED_NAV_COMMANDS: readonly MissionCommand[] = [
  'MAV_CMD_NAV_WAYPOINT',
  'MAV_CMD_NAV_LOITER_UNLIM',
  'MAV_CMD_NAV_LOITER_TURNS',
  'MAV_CMD_NAV_LOITER_TIME',
  'MAV_CMD_NAV_LAND',
  'MAV_CMD_NAV_RETURN_TO_LAUNCH',
  'MAV_CMD_NAV_DELAY',
];

const GROUND_AND_SUB_COMMANDS: readonly MissionCommand[] = [
  'MAV_CMD_NAV_WAYPOINT',
  'MAV_CMD_NAV_RETURN_TO_LAUNCH',
  'MAV_CMD_NAV_DELAY',
  'MAV_CMD_DO_CHANGE_SPEED',
  'MAV_CMD_DO_SET_SERVO',
  'MAV_CMD_DO_SET_RELAY',
];

export const MISSION_VEHICLE_PROFILES: Record<MissionVehicleType, MissionVehicleProfile> = {
  plane: {
    vehicleType: 'plane',
    label: 'Plane',
    defaultFrame: DEFAULT_FRAME,
    defaultTakeoffAltitudeM: 80,
    defaultCruiseSpeedMps: 18,
    minAltitudeM: 15,
    maxAltitudeM: 5000,
    supportsSplineWaypoints: false,
    allowedCommands: [
      'MAV_CMD_NAV_TAKEOFF',
      'MAV_CMD_NAV_VTOL_TAKEOFF',
      ...SHARED_NAV_COMMANDS,
      'MAV_CMD_NAV_VTOL_LAND',
      ...SHARED_DO_COMMANDS,
      'MAV_CMD_DO_LAND_START',
    ],
  },
  copter: {
    vehicleType: 'copter',
    label: 'Copter',
    defaultFrame: DEFAULT_FRAME,
    defaultTakeoffAltitudeM: 30,
    defaultCruiseSpeedMps: 8,
    minAltitudeM: 2,
    maxAltitudeM: 1000,
    supportsSplineWaypoints: true,
    allowedCommands: [
      'MAV_CMD_NAV_TAKEOFF',
      'MAV_CMD_NAV_SPLINE_WAYPOINT',
      ...SHARED_NAV_COMMANDS,
      ...SHARED_DO_COMMANDS,
    ],
  },
  rover: {
    vehicleType: 'rover',
    label: 'Rover',
    defaultFrame: DEFAULT_FRAME,
    defaultTakeoffAltitudeM: 0,
    defaultCruiseSpeedMps: 3,
    minAltitudeM: 0,
    maxAltitudeM: 0,
    supportsSplineWaypoints: false,
    allowedCommands: GROUND_AND_SUB_COMMANDS,
  },
  sub: {
    vehicleType: 'sub',
    label: 'Sub',
    defaultFrame: DEFAULT_FRAME,
    defaultTakeoffAltitudeM: 0,
    defaultCruiseSpeedMps: 2,
    minAltitudeM: -500,
    maxAltitudeM: 0,
    supportsSplineWaypoints: false,
    allowedCommands: GROUND_AND_SUB_COMMANDS,
  },
};

export const getMissionVehicleProfile = (vehicleType: MissionVehicleType): MissionVehicleProfile =>
  MISSION_VEHICLE_PROFILES[vehicleType];

export const isCommandAllowedForVehicle = (
  vehicleType: MissionVehicleType,
  command: MissionCommand,
): boolean => getMissionVehicleProfile(vehicleType).allowedCommands.includes(command);
