import {
  getMissionCommandDefinition,
  getMissionVehicleProfile,
  type MissionCommand,
  type MissionParamValue,
  type MissionValidationIssue,
  type MissionVehicleType,
} from '../domain';
import type { MissionPlanExecutionIssue } from './missionPlanAdapter';

export interface MissionCommandGroup {
  readonly title: string;
  readonly commands: readonly MissionCommand[];
}

export interface MissionIssueBadge {
  readonly tone: 'error' | 'warning';
  readonly message: string;
  readonly itemId: string | null;
  readonly seq: number | null;
}

export interface MissionParamDisplay {
  readonly label: string;
  readonly value: string;
  readonly unit: string | null;
  readonly required: boolean;
}

interface MissionIssueBadgeInput {
  readonly validationErrors: readonly MissionValidationIssue[];
  readonly validationWarnings: readonly MissionValidationIssue[];
  readonly executionBlockers: readonly MissionPlanExecutionIssue[];
  readonly executionWarnings: readonly MissionPlanExecutionIssue[];
}

const MISSION_PARAM_COUNT = 7;

export const MISSION_LOITER_COMMANDS: readonly MissionCommand[] = [
  'MAV_CMD_NAV_LOITER_UNLIM',
  'MAV_CMD_NAV_LOITER_TURNS',
  'MAV_CMD_NAV_LOITER_TIME',
];

const assertNever = (value: never): never => {
  throw new Error(`Unhandled mission command: ${String(value)}`);
};

const trimFixedNumber = (value: string): string => value.replace(/\.?0+$/, '');

const formatMissionParamValue = (command: MissionCommand, index: number, value: MissionParamValue): string => {
  if (value === null) {
    return '—';
  }

  if (!Number.isFinite(value)) {
    throw new Error(`Mission param value must be finite for command ${command} at param ${index}; value=${value}.`);
  }

  return trimFixedNumber(value.toFixed(2));
};

const missionValidationIssueToBadge = (
  tone: MissionIssueBadge['tone'],
  issue: MissionValidationIssue,
): MissionIssueBadge => ({
  tone,
  message: issue.message,
  itemId: issue.itemId,
  seq: issue.seq,
});

const missionExecutionIssueToBadge = (
  tone: MissionIssueBadge['tone'],
  issue: MissionPlanExecutionIssue,
): MissionIssueBadge => ({
  tone,
  message: issue.message,
  itemId: issue.itemId,
  seq: issue.seq,
});

export const getMissionCommandLabel = (command: MissionCommand): string =>
  getMissionCommandDefinition(command).label;

export const isMissionLoiterCommand = (command: MissionCommand): boolean =>
  MISSION_LOITER_COMMANDS.some((loiterCommand) => loiterCommand === command);

export const getMissionCommandShortLabel = (command: MissionCommand): string => {
  switch (command) {
    case 'MAV_CMD_NAV_TAKEOFF':
      return 'Takeoff';
    case 'MAV_CMD_NAV_VTOL_TAKEOFF':
      return 'VTOL Takeoff';
    case 'MAV_CMD_NAV_WAYPOINT':
      return 'Waypoint';
    case 'MAV_CMD_NAV_SPLINE_WAYPOINT':
      return 'Spline';
    case 'MAV_CMD_NAV_LOITER_UNLIM':
      return 'Loiter Unlimited';
    case 'MAV_CMD_NAV_LOITER_TURNS':
      return 'Loiter Turns';
    case 'MAV_CMD_NAV_LOITER_TIME':
      return 'Loiter Time';
    case 'MAV_CMD_NAV_LAND':
      return 'Land';
    case 'MAV_CMD_NAV_VTOL_LAND':
      return 'VTOL Land';
    case 'MAV_CMD_NAV_RETURN_TO_LAUNCH':
      return 'RTL';
    case 'MAV_CMD_DO_CHANGE_SPEED':
      return 'Speed';
    case 'MAV_CMD_DO_SET_SERVO':
      return 'Servo';
    case 'MAV_CMD_DO_SET_RELAY':
      return 'Relay';
    case 'MAV_CMD_DO_DIGICAM_CONTROL':
      return 'Camera';
    case 'MAV_CMD_DO_SET_CAM_TRIGG_DIST':
      return 'Trigger';
    case 'MAV_CMD_DO_SET_ROI':
      return 'ROI';
    case 'MAV_CMD_DO_LAND_START':
      return 'Land Start';
    case 'MAV_CMD_NAV_DELAY':
      return 'Delay';
    default:
      return assertNever(command);
  }
};

export const getMissionCommandGroups = (vehicleType: MissionVehicleType): readonly MissionCommandGroup[] => {
  const allowedCommands = getMissionVehicleProfile(vehicleType).allowedCommands;
  const navCommands = allowedCommands.filter(
    (command): command is MissionCommand => getMissionCommandDefinition(command).category === 'nav',
  );
  const doCommands = allowedCommands.filter(
    (command): command is MissionCommand => getMissionCommandDefinition(command).category === 'do',
  );
  const groups: readonly MissionCommandGroup[] = [
    {
      title: 'Nav',
      commands: navCommands,
    },
    {
      title: 'Do',
      commands: doCommands,
    },
  ];

  return groups.filter((group) => group.commands.length > 0);
};

export const formatMissionNumber = (value: number | null, decimals: number): string => {
  if (!Number.isInteger(decimals) || decimals < 0) {
    throw new Error(`Mission number decimals must be an integer greater than or equal to 0; decimals=${decimals}.`);
  }

  if (value === null) {
    return '—';
  }

  if (!Number.isFinite(value)) {
    throw new Error(`Mission number value must be finite; value=${value}, decimals=${decimals}.`);
  }

  return value.toFixed(decimals);
};

export const formatMissionDistance = (meters: number): string => {
  if (!Number.isFinite(meters) || meters < 0) {
    throw new Error(`Mission distance must be finite and greater than or equal to 0; meters=${meters}.`);
  }

  if (meters < 1000) {
    return `${Math.round(meters)} m`;
  }

  return `${(meters / 1000).toFixed(1)} km`;
};

export const formatMissionDuration = (seconds: number): string => {
  if (!Number.isFinite(seconds) || seconds < 0) {
    throw new Error(`Mission duration must be finite and greater than or equal to 0; seconds=${seconds}.`);
  }

  const roundedSeconds = Math.round(seconds);

  if (seconds < 60) {
    return `${roundedSeconds}s`;
  }

  if (seconds < 3600) {
    const minutes = Math.floor(roundedSeconds / 60);
    const remainingSeconds = roundedSeconds % 60;

    return `${minutes}m ${remainingSeconds}s`;
  }

  const hours = Math.floor(roundedSeconds / 3600);
  const remainingMinutes = Math.floor((roundedSeconds % 3600) / 60);

  return `${hours}h ${remainingMinutes}m`;
};

export const formatMissionCoordinate = (value: number | null): string => formatMissionNumber(value, 6);

export const formatMissionAltitude = (value: number | null): string =>
  value === null ? '—' : `${formatMissionNumber(value, 0)} m`;

export const getMissionParamDisplays = (
  command: MissionCommand,
  params: readonly MissionParamValue[],
): readonly MissionParamDisplay[] => {
  if (params.length !== MISSION_PARAM_COUNT) {
    throw new Error(
      `Mission command ${command} must have exactly ${MISSION_PARAM_COUNT} params for display; length=${params.length}.`,
    );
  }

  return getMissionCommandDefinition(command).params.map((paramDefinition) => {
    const index = paramDefinition.index - 1;

    return {
      label: paramDefinition.label,
      value: formatMissionParamValue(command, paramDefinition.index, params[index]),
      unit: paramDefinition.unit,
      required: paramDefinition.required,
    };
  });
};

export const toMissionIssueBadges = (input: MissionIssueBadgeInput): readonly MissionIssueBadge[] => [
  ...input.validationErrors.map((issue) => missionValidationIssueToBadge('error', issue)),
  ...input.executionBlockers.map((issue) => missionExecutionIssueToBadge('error', issue)),
  ...input.validationWarnings.map((issue) => missionValidationIssueToBadge('warning', issue)),
  ...input.executionWarnings.map((issue) => missionExecutionIssueToBadge('warning', issue)),
];
