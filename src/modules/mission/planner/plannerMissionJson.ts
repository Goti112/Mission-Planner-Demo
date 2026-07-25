import {
  MISSION_COMMANDS,
  MISSION_FRAMES,
  VEHICLE_TYPES,
  createMissionItem,
  createMissionPlan,
  validateMissionPlan,
  type MissionCommand,
  type MissionCoordinate,
  type MissionFrame,
  type MissionHome,
  type MissionItem,
  type MissionParamValue,
  type MissionParams,
  type MissionPlan,
  type MissionVehicleType,
} from '../domain';
import { normalizeMissionPlanHome } from './missionPlanHome';
import type {
  AdvancedMissionPlan,
  CircleFence,
  FenceBoundaryKind,
  FenceDefinition,
  FenceShapeKind,
  FenceVertex,
  PolygonFence,
  RallyPoint,
  SurveyCameraTriggerMode,
  SurveyGridSpec,
  SurveyPatternKind,
  SurveyStartCorner,
} from './advancedMissionTypes';
import type { PlannerMissionRecord } from './types';

export interface ImportedPlannerMissionJson {
  readonly name: string;
  readonly plan: MissionPlan;
  readonly advanced: AdvancedMissionPlan;
}

export class PlannerMissionJsonError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PlannerMissionJsonError';
  }
}

const FENCE_BOUNDARIES = ['inclusion', 'exclusion'] as const;
const FENCE_SHAPES = ['polygon', 'circle'] as const;
const SURVEY_PATTERNS = ['grid', 'crosshatch'] as const;
const SURVEY_START_CORNERS = ['southWest', 'northWest', 'southEast', 'northEast'] as const;
const SURVEY_CAMERA_TRIGGER_MODES = ['none', 'distance'] as const;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const readRecord = (value: unknown, label: string): Record<string, unknown> => {
  if (!isRecord(value)) {
    throw new PlannerMissionJsonError(`Cannot import mission JSON because ${label} must be an object.`);
  }

  return value;
};

const readArray = (value: unknown, label: string): readonly unknown[] => {
  if (!Array.isArray(value)) {
    throw new PlannerMissionJsonError(`Cannot import mission JSON because ${label} must be an array.`);
  }

  return value;
};

const readString = (value: unknown, label: string): string => {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new PlannerMissionJsonError(`Cannot import mission JSON because ${label} must be a non-empty string.`);
  }

  return value;
};

const readBoolean = (value: unknown, label: string): boolean => {
  if (typeof value !== 'boolean') {
    throw new PlannerMissionJsonError(`Cannot import mission JSON because ${label} must be a boolean.`);
  }

  return value;
};

const readFiniteNumber = (value: unknown, label: string): number => {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new PlannerMissionJsonError(`Cannot import mission JSON because ${label} must be a finite number.`);
  }

  return value;
};

const readInteger = (value: unknown, label: string): number => {
  const numberValue = readFiniteNumber(value, label);

  if (!Number.isInteger(numberValue)) {
    throw new PlannerMissionJsonError(`Cannot import mission JSON because ${label} must be an integer.`);
  }

  return numberValue;
};

const readNullableFiniteNumber = (value: unknown, label: string): number | null => {
  if (value === null) {
    return null;
  }

  return readFiniteNumber(value, label);
};

const readNonNegativeNumber = (value: unknown, label: string): number => {
  const numberValue = readFiniteNumber(value, label);

  if (numberValue < 0) {
    throw new PlannerMissionJsonError(`Cannot import mission JSON because ${label} must be greater than or equal to 0.`);
  }

  return numberValue;
};

const readPositiveNumber = (value: unknown, label: string): number => {
  const numberValue = readFiniteNumber(value, label);

  if (numberValue <= 0) {
    throw new PlannerMissionJsonError(`Cannot import mission JSON because ${label} must be greater than 0.`);
  }

  return numberValue;
};

const readEnum = <TValue extends string>(
  value: unknown,
  values: readonly TValue[],
  label: string,
): TValue => {
  if (typeof value !== 'string' || !values.includes(value as TValue)) {
    throw new PlannerMissionJsonError(
      `Cannot import mission JSON because ${label} is unsupported; value=${String(value)}.`,
    );
  }

  return value as TValue;
};

const assertLatitude = (lat: number, label: string): void => {
  if (lat < -90 || lat > 90) {
    throw new PlannerMissionJsonError(`Cannot import mission JSON because ${label}.lat must be between -90 and 90.`);
  }
};

const assertLongitude = (lng: number, label: string): void => {
  if (lng < -180 || lng > 180) {
    throw new PlannerMissionJsonError(`Cannot import mission JSON because ${label}.lng must be between -180 and 180.`);
  }
};

const readFenceVertex = (value: unknown, label: string): FenceVertex => {
  const record = readRecord(value, label);
  const lat = readFiniteNumber(record.lat, `${label}.lat`);
  const lng = readFiniteNumber(record.lng, `${label}.lng`);

  assertLatitude(lat, label);
  assertLongitude(lng, label);

  return { lat, lng };
};

const readCoordinate = (value: unknown, label: string): MissionCoordinate => {
  const record = readRecord(value, label);
  const vertex = readFenceVertex(record, label);

  return {
    ...vertex,
    alt: readNonNegativeNumber(record.alt, `${label}.alt`),
  };
};

const readHome = (value: unknown, label: string): MissionHome | null => {
  if (value === null) {
    return null;
  }

  return readCoordinate(value, label);
};

const readMissionParams = (value: unknown, label: string): MissionParams => {
  const params = readArray(value, label);

  if (params.length !== 7) {
    throw new PlannerMissionJsonError(`Cannot import mission JSON because ${label} must contain exactly 7 values.`);
  }

  const parsedParams = params.map((param, index): MissionParamValue => {
    if (param === null) {
      return null;
    }

    return readFiniteNumber(param, `${label}[${index.toString()}]`);
  });

  return [
    parsedParams[0],
    parsedParams[1],
    parsedParams[2],
    parsedParams[3],
    parsedParams[4],
    parsedParams[5],
    parsedParams[6],
  ];
};

const readMissionItem = (value: unknown, index: number): MissionItem => {
  const label = `mission.plan.items[${index.toString()}]`;
  const record = readRecord(value, label);
  const coordinate = record.coordinate === null ? null : readCoordinate(record.coordinate, `${label}.coordinate`);

  return createMissionItem({
    id: readString(record.id, `${label}.id`),
    seq: readInteger(record.seq, `${label}.seq`),
    command: readEnum(record.command, MISSION_COMMANDS, `${label}.command`) as MissionCommand,
    frame: readEnum(record.frame, MISSION_FRAMES, `${label}.frame`) as MissionFrame,
    current: readBoolean(record.current, `${label}.current`),
    autocontinue: readBoolean(record.autocontinue, `${label}.autocontinue`),
    params: readMissionParams(record.params, `${label}.params`),
    coordinate,
  });
};

const readMissionPlan = (value: unknown): MissionPlan => {
  const record = readRecord(value, 'mission.plan');
  const items = readArray(record.items, 'mission.plan.items').map(readMissionItem);
  const plan = createMissionPlan({
    id: readString(record.id, 'mission.plan.id'),
    vehicleType: readEnum(record.vehicleType, VEHICLE_TYPES, 'mission.plan.vehicleType') as MissionVehicleType,
    home: readHome(record.home, 'mission.plan.home'),
    items,
    updatedAtIso: readString(record.updatedAtIso, 'mission.plan.updatedAtIso'),
  });

  const normalized = normalizeMissionPlanHome({
    plan,
    updatedAtIso: plan.updatedAtIso,
  }).plan;

  if (normalized.items.length > 0) {
    const result = validateMissionPlan(normalized);

    if (!result.isValid) {
      throw new PlannerMissionJsonError(
        `Cannot import mission JSON because mission.plan is invalid: ${result.errors.map((issue) => issue.message).join('; ')}.`,
      );
    }
  }

  return normalized;
};

const readNullableNonNegativeNumber = (value: unknown, label: string): number | null => {
  if (value === null) {
    return null;
  }

  return readNonNegativeNumber(value, label);
};

const readFenceBase = (record: Record<string, unknown>, label: string): {
  readonly id: string;
  readonly name: string;
  readonly boundary: FenceBoundaryKind;
  readonly minAltitudeM: number | null;
  readonly maxAltitudeM: number | null;
} => ({
  id: readString(record.id, `${label}.id`),
  name: readString(record.name, `${label}.name`),
  boundary: readEnum(record.boundary, FENCE_BOUNDARIES, `${label}.boundary`),
  minAltitudeM: readNullableNonNegativeNumber(record.minAltitudeM, `${label}.minAltitudeM`),
  maxAltitudeM: readNullableNonNegativeNumber(record.maxAltitudeM, `${label}.maxAltitudeM`),
});

const readFence = (value: unknown, index: number): FenceDefinition => {
  const label = `mission.advanced.fences[${index.toString()}]`;
  const record = readRecord(value, label);
  const shape = readEnum(record.shape, FENCE_SHAPES, `${label}.shape`) as FenceShapeKind;
  const base = readFenceBase(record, label);

  if (shape === 'polygon') {
    const fence: PolygonFence = {
      ...base,
      shape,
      vertices: readArray(record.vertices, `${label}.vertices`).map((vertex, vertexIndex) =>
        readFenceVertex(vertex, `${label}.vertices[${vertexIndex.toString()}]`),
      ),
    };

    if (fence.vertices.length < 3) {
      throw new PlannerMissionJsonError(`Cannot import mission JSON because ${label}.vertices must contain at least 3 vertices.`);
    }

    return fence;
  }

  const fence: CircleFence = {
    ...base,
    shape,
    center: readFenceVertex(record.center, `${label}.center`),
    radiusM: readPositiveNumber(record.radiusM, `${label}.radiusM`),
  };

  return fence;
};

const readRallyPoint = (value: unknown, index: number): RallyPoint => {
  const label = `mission.advanced.rallyPoints[${index.toString()}]`;
  const record = readRecord(value, label);

  return {
    id: readString(record.id, `${label}.id`),
    name: readString(record.name, `${label}.name`),
    coordinate: readCoordinate(record.coordinate, `${label}.coordinate`),
    loiterAltitudeM: readNonNegativeNumber(record.loiterAltitudeM, `${label}.loiterAltitudeM`),
    breakAltitudeM: readNullableNonNegativeNumber(record.breakAltitudeM, `${label}.breakAltitudeM`),
    landHeadingDeg: readNullableFiniteNumber(record.landHeadingDeg, `${label}.landHeadingDeg`),
  };
};

const readSurvey = (value: unknown, index: number): SurveyGridSpec => {
  const label = `mission.advanced.surveys[${index.toString()}]`;
  const record = readRecord(value, label);
  const polygon = readArray(record.polygon, `${label}.polygon`).map((vertex, vertexIndex) =>
    readFenceVertex(vertex, `${label}.polygon[${vertexIndex.toString()}]`),
  );

  if (polygon.length < 3) {
    throw new PlannerMissionJsonError(`Cannot import mission JSON because ${label}.polygon must contain at least 3 vertices.`);
  }

  return {
    id: readString(record.id, `${label}.id`),
    name: readString(record.name, `${label}.name`),
    polygon,
    altitudeM: readNonNegativeNumber(record.altitudeM, `${label}.altitudeM`),
    angleDeg: readFiniteNumber(record.angleDeg, `${label}.angleDeg`),
    laneSpacingM: readPositiveNumber(record.laneSpacingM, `${label}.laneSpacingM`),
    overshootM: readNonNegativeNumber(record.overshootM, `${label}.overshootM`),
    pattern: readEnum(record.pattern, SURVEY_PATTERNS, `${label}.pattern`) as SurveyPatternKind,
    startCorner: readEnum(record.startCorner, SURVEY_START_CORNERS, `${label}.startCorner`) as SurveyStartCorner,
    cameraTriggerMode: readEnum(
      record.cameraTriggerMode,
      SURVEY_CAMERA_TRIGGER_MODES,
      `${label}.cameraTriggerMode`,
    ) as SurveyCameraTriggerMode,
    cameraTriggerDistanceM: readNullableNonNegativeNumber(
      record.cameraTriggerDistanceM,
      `${label}.cameraTriggerDistanceM`,
    ),
  };
};

const readAdvancedMissionPlan = (value: unknown): AdvancedMissionPlan => {
  const record = readRecord(value, 'mission.advanced');

  return {
    fences: readArray(record.fences, 'mission.advanced.fences').map(readFence),
    rallyPoints: readArray(record.rallyPoints, 'mission.advanced.rallyPoints').map(readRallyPoint),
    surveys: readArray(record.surveys, 'mission.advanced.surveys').map(readSurvey),
  };
};

export const readPlannerMissionJson = (rawText: string): ImportedPlannerMissionJson => {
  let parsed: unknown;

  try {
    parsed = JSON.parse(rawText);
  } catch (error) {
    throw new PlannerMissionJsonError(
      `Cannot import mission JSON because parsing failed: ${error instanceof Error ? error.message : String(error)}.`,
    );
  }

  const root = readRecord(parsed, 'root value');

  if (root.version !== 1) {
    throw new PlannerMissionJsonError(
      `Cannot import mission JSON because version is unsupported; version=${String(root.version)}.`,
    );
  }

  const mission = readRecord(root.mission, 'mission');

  return {
    name: readString(mission.name, 'mission.name'),
    plan: readMissionPlan(mission.plan),
    advanced: readAdvancedMissionPlan(mission.advanced),
  };
};

export const exportPlannerMissionToJson = (mission: PlannerMissionRecord): string =>
  JSON.stringify(
    {
      version: 1,
      mission: {
        name: mission.name,
        plan: mission.plan,
        advanced: mission.advanced,
      },
    },
    null,
    2,
  );
