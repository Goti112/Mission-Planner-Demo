import { getMissionCommandDefinition } from './MissionCommandCatalog';
import { getMissionVehicleProfile, isCommandAllowedForVehicle } from './MissionVehicleProfiles';
import type {
  MissionCommandDefinition,
  MissionCommandParamDefinition,
  MissionCoordinate,
  MissionItem,
  MissionPlan,
  MissionValidationIssue,
  MissionValidationResult,
} from './MissionTypes';

const latitudeIsValid = (latitude: number): boolean => Number.isFinite(latitude) && latitude >= -90 && latitude <= 90;

const longitudeIsValid = (longitude: number): boolean => Number.isFinite(longitude) && longitude >= -180 && longitude <= 180;

const altitudeIsValid = (altitude: number, minAltitudeM: number, maxAltitudeM: number): boolean =>
  Number.isFinite(altitude) && altitude >= minAltitudeM && altitude <= maxAltitudeM;

const GROUND_ALTITUDE_COMMANDS = ['MAV_CMD_NAV_LAND', 'MAV_CMD_NAV_VTOL_LAND'] as const;
const isGroundAltitudeCommand = (command: MissionItem['command']): command is (typeof GROUND_ALTITUDE_COMMANDS)[number] =>
  GROUND_ALTITUDE_COMMANDS.includes(command as (typeof GROUND_ALTITUDE_COMMANDS)[number]);

const getMinimumAltitudeM = (item: MissionItem, vehicleMinAltitudeM: number): number => {
  if (isGroundAltitudeCommand(item.command)) {
    return 0;
  }

  if (item.seq === 0) {
    return 0;
  }

  return vehicleMinAltitudeM;
};

const missionError = (code: string, message: string, item: MissionItem): MissionValidationIssue => ({
  severity: 'error',
  code,
  message,
  itemId: item.id,
  seq: item.seq,
});

const missionPlanError = (code: string, message: string): MissionValidationIssue => ({
  severity: 'error',
  code,
  message,
  itemId: null,
  seq: null,
});

const validateMissionHome = (plan: MissionPlan): readonly MissionValidationIssue[] => {
  if (plan.home === null) {
    return [missionPlanError('MISSION_HOME_MISSING', 'Mission home is not set.')];
  }

  const errors: MissionValidationIssue[] = [];

  if (!latitudeIsValid(plan.home.lat)) {
    errors.push(missionPlanError('MISSION_HOME_INVALID', 'Mission HOME latitude must be finite and between -90 and 90 degrees.'));
  }

  if (!longitudeIsValid(plan.home.lng)) {
    errors.push(missionPlanError('MISSION_HOME_INVALID', 'Mission HOME longitude must be finite and between -180 and 180 degrees.'));
  }

  if (!Number.isFinite(plan.home.alt) || plan.home.alt < 0) {
    errors.push(missionPlanError('MISSION_HOME_INVALID', 'Mission HOME altitude must be finite and greater than or equal to 0.'));
  }

  return errors;
};

const validateMissionItemSequence = (item: MissionItem, expectedSeq: number): readonly MissionValidationIssue[] => {
  if (item.seq === expectedSeq) {
    return [];
  }

  return [
    missionError(
      'NON_CONTIGUOUS_SEQUENCE',
      `Mission item sequence must match current item order. Expected seq ${expectedSeq} but received ${item.seq}.`,
      item,
    ),
  ];
};

const validateMissionItemCommand = (item: MissionItem, plan: MissionPlan): readonly MissionValidationIssue[] => {
  if (isCommandAllowedForVehicle(plan.vehicleType, item.command)) {
    return [];
  }

  return [
    missionError(
      'UNSUPPORTED_VEHICLE_COMMAND',
      `Command ${item.command} is not supported for ${plan.vehicleType} missions.`,
      item,
    ),
  ];
};

const validateMissionItemFrame = (item: MissionItem): readonly MissionValidationIssue[] => {
  const commandDefinition = getMissionCommandDefinition(item.command);

  if (commandDefinition.supportedFrames.includes(item.frame)) {
    return [];
  }

  return [
    missionError(
      'INVALID_FRAME',
      `Frame ${item.frame} is not supported for command ${item.command}.`,
      item,
    ),
  ];
};

const missionParamIsValid = (param: number | null): boolean => param !== null && Number.isFinite(param);

const validateMissionItemRequiredParam = (
  item: MissionItem,
  commandDefinition: MissionCommandDefinition,
  paramDefinition: MissionCommandParamDefinition,
): readonly MissionValidationIssue[] => {
  const param = item.params[paramDefinition.index - 1];

  if (missionParamIsValid(param)) {
    return [];
  }

  return [
    missionError(
      'MISSION_PARAM_REQUIRED',
      `${commandDefinition.label} (${commandDefinition.command}) requires ${paramDefinition.label} at param ${paramDefinition.index}.`,
      item,
    ),
  ];
};

const validateMissionItemRequiredParams = (item: MissionItem): readonly MissionValidationIssue[] => {
  const commandDefinition = getMissionCommandDefinition(item.command);
  const requiredParams = commandDefinition.params.filter((paramDefinition) => paramDefinition.required);

  return requiredParams.flatMap((paramDefinition) =>
    validateMissionItemRequiredParam(item, commandDefinition, paramDefinition),
  );
};

const validateMissionItemCoordinatePresence = (item: MissionItem): readonly MissionValidationIssue[] => {
  const commandDefinition = getMissionCommandDefinition(item.command);

  if (commandDefinition.hasCoordinate && item.coordinate === null) {
    return [missionError('MISSING_COORDINATE', `Command ${item.command} requires a coordinate.`, item)];
  }

  if (!commandDefinition.hasCoordinate && item.coordinate !== null) {
    return [missionError('UNEXPECTED_COORDINATE', `Command ${item.command} does not allow a coordinate.`, item)];
  }

  return [];
};

const validateMissionItemCoordinateRange = (
  item: MissionItem,
  coordinate: MissionCoordinate,
  minAltitudeM: number,
  maxAltitudeM: number,
): readonly MissionValidationIssue[] => {
  const errors: MissionValidationIssue[] = [];

  if (!latitudeIsValid(coordinate.lat)) {
    errors.push(
      missionError('INVALID_COORDINATE', 'Latitude must be finite and between -90 and 90 degrees.', item),
    );
  }

  if (!longitudeIsValid(coordinate.lng)) {
    errors.push(
      missionError('INVALID_COORDINATE', 'Longitude must be finite and between -180 and 180 degrees.', item),
    );
  }

  if (!altitudeIsValid(coordinate.alt, minAltitudeM, maxAltitudeM)) {
    errors.push(
      missionError(
        'INVALID_ALTITUDE',
        `Altitude must be finite and between ${minAltitudeM} and ${maxAltitudeM} meters for ${item.command}.`,
        item,
      ),
    );
  }

  return errors;
};

const validateMissionItemCoordinate = (
  item: MissionItem,
  minAltitudeM: number,
  maxAltitudeM: number,
): readonly MissionValidationIssue[] => {
  const presenceErrors = validateMissionItemCoordinatePresence(item);

  if (presenceErrors.length > 0 || item.coordinate === null) {
    return presenceErrors;
  }

  return validateMissionItemCoordinateRange(item, item.coordinate, getMinimumAltitudeM(item, minAltitudeM), maxAltitudeM);
};

const validateMissionItem = (item: MissionItem, expectedSeq: number, plan: MissionPlan): readonly MissionValidationIssue[] => {
  const vehicleProfile = getMissionVehicleProfile(plan.vehicleType);

  return [
    ...validateMissionItemSequence(item, expectedSeq),
    ...validateMissionItemCommand(item, plan),
    ...validateMissionItemFrame(item),
    ...validateMissionItemRequiredParams(item),
    ...validateMissionItemCoordinate(item, vehicleProfile.minAltitudeM, vehicleProfile.maxAltitudeM),
  ];
};

export const validateMissionPlan = (plan: MissionPlan): MissionValidationResult => {
  const homeErrors = validateMissionHome(plan);

  if (plan.items.length === 0) {
    const errors = [
      ...homeErrors,
      missionPlanError('MISSION_EMPTY', 'Mission plan must contain at least one mission item.'),
    ];

    return {
      isValid: false,
      errors,
      warnings: [],
    };
  }

  const errors = [
    ...homeErrors,
    ...plan.items.flatMap((item, index) => validateMissionItem(item, index, plan)),
  ];

  return {
    isValid: errors.length === 0,
    errors,
    warnings: [],
  };
};
