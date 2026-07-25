import { getMissionCommandDefinition } from './MissionCommandCatalog';
import type {
  MissionCommand,
  MissionCommandDefinition,
  MissionCommandParamDefinition,
  MissionCoordinate,
  MissionFrame,
  MissionHome,
  MissionItem,
  MissionParamIndex,
  MissionParamValue,
  MissionParams,
  MissionPlan,
  MissionVehicleType,
} from './MissionTypes';

export interface CreateMissionItemInput {
  readonly id: string;
  readonly seq: number;
  readonly command: MissionCommand;
  readonly frame: MissionFrame;
  readonly current: boolean;
  readonly autocontinue: boolean;
  readonly params: MissionParams;
  readonly coordinate: MissionCoordinate | null;
}

export interface CreateMissionPlanInput {
  readonly id: string;
  readonly vehicleType: MissionVehicleType;
  readonly home: MissionHome | null;
  readonly items: readonly MissionItem[];
  readonly updatedAtIso: string;
}

export interface DuplicateMissionItemInput {
  readonly item: MissionItem;
  readonly id: string;
  readonly seq: number;
}

const normalizeMissionParam = (param: MissionParamValue): MissionParamValue => {
  if (param === null) {
    return null;
  }

  return Number.isFinite(param) ? param : null;
};

const getMissionParamDefinition = (
  commandDefinition: MissionCommandDefinition,
  index: MissionParamIndex,
): MissionCommandParamDefinition => {
  const paramDefinition = commandDefinition.params.find((param) => param.index === index);

  if (paramDefinition === undefined) {
    throw new Error(`Mission command ${commandDefinition.command} does not define param ${index}`);
  }

  return paramDefinition;
};

const isUnusedMissionParamDefinition = (definition: MissionCommandParamDefinition): boolean =>
  definition.label === `Param ${definition.index}` && definition.unit === null && !definition.required;

const normalizeNonSpatialParam = (
  param: MissionParamValue,
  definition: MissionCommandParamDefinition,
): MissionParamValue => (isUnusedMissionParamDefinition(definition) ? null : param);

const cloneCoordinate = (coordinate: MissionCoordinate): MissionCoordinate => ({
  lat: coordinate.lat,
  lng: coordinate.lng,
  alt: coordinate.alt,
});

const cloneHome = (home: MissionHome): MissionHome => ({
  lat: home.lat,
  lng: home.lng,
  alt: home.alt,
});

const normalizeParams = (
  params: MissionParams,
  coordinate: MissionCoordinate | null,
  commandDefinition: MissionCommandDefinition,
): MissionParams => {
  const normalizedParams: MissionParams = [
    normalizeMissionParam(params[0]),
    normalizeMissionParam(params[1]),
    normalizeMissionParam(params[2]),
    normalizeMissionParam(params[3]),
    normalizeMissionParam(params[4]),
    normalizeMissionParam(params[5]),
    normalizeMissionParam(params[6]),
  ];

  if (commandDefinition.hasCoordinate && coordinate !== null) {
    return [
      normalizedParams[0],
      normalizedParams[1],
      normalizedParams[2],
      normalizedParams[3],
      normalizeMissionParam(coordinate.lat),
      normalizeMissionParam(coordinate.lng),
      normalizeMissionParam(coordinate.alt),
    ];
  }

  if (!commandDefinition.hasCoordinate) {
    return [
      normalizedParams[0],
      normalizedParams[1],
      normalizedParams[2],
      normalizedParams[3],
      normalizeNonSpatialParam(normalizedParams[4], getMissionParamDefinition(commandDefinition, 5)),
      normalizeNonSpatialParam(normalizedParams[5], getMissionParamDefinition(commandDefinition, 6)),
      normalizeNonSpatialParam(normalizedParams[6], getMissionParamDefinition(commandDefinition, 7)),
    ];
  }

  return normalizedParams;
};

export const createMissionItem = (input: CreateMissionItemInput): MissionItem => {
  const commandDefinition = getMissionCommandDefinition(input.command);
  const coordinate = input.coordinate === null ? null : cloneCoordinate(input.coordinate);

  return {
    id: input.id,
    seq: input.seq,
    command: input.command,
    frame: input.frame,
    current: input.current,
    autocontinue: input.autocontinue,
    params: normalizeParams(input.params, coordinate, commandDefinition),
    coordinate,
  };
};

export const resequenceMissionItems = (items: readonly MissionItem[]): readonly MissionItem[] =>
  items.map((item, index): MissionItem =>
    createMissionItem({
      id: item.id,
      seq: index,
      command: item.command,
      frame: item.frame,
      current: item.current,
      autocontinue: item.autocontinue,
      params: item.params,
      coordinate: item.coordinate,
    }),
  );

export const duplicateMissionItem = (input: DuplicateMissionItemInput): MissionItem =>
  createMissionItem({
    id: input.id,
    seq: input.seq,
    command: input.item.command,
    frame: input.item.frame,
    current: input.item.current,
    autocontinue: input.item.autocontinue,
    params: input.item.params,
    coordinate: input.item.coordinate,
  });

export const createMissionPlan = (input: CreateMissionPlanInput): MissionPlan => ({
  id: input.id,
  vehicleType: input.vehicleType,
  home: input.home === null ? null : cloneHome(input.home),
  items: resequenceMissionItems(input.items),
  updatedAtIso: input.updatedAtIso,
});
