import type {
  MissionCoordinate,
  MissionItem,
  MissionParamValue,
  MissionParams,
  MissionTableRow,
} from '../domain';

export const PARAM_INDEXES: readonly [0, 1, 2, 3, 4, 5, 6] = [0, 1, 2, 3, 4, 5, 6];

const INCOMPLETE_NUMERIC_INPUTS = ['', '-', '+', 'e', 'E', '.', '+.', '-.'] as const;

export const isIncompleteNumericInput = (rawValue: string): boolean =>
  INCOMPLETE_NUMERIC_INPUTS.some((input) => input === rawValue.trim());

export const parseFiniteNumber = (rawValue: string): number | null => {
  const parsed = Number(rawValue);

  return Number.isFinite(parsed) ? parsed : null;
};

export const updateParamAtIndex = (
  params: MissionParams,
  index: number,
  value: MissionParamValue,
): MissionParams => [
  index === 0 ? value : params[0],
  index === 1 ? value : params[1],
  index === 2 ? value : params[2],
  index === 3 ? value : params[3],
  index === 4 ? value : params[4],
  index === 5 ? value : params[5],
  index === 6 ? value : params[6],
];

export const updateCoordinateField = (
  coordinate: MissionCoordinate | null,
  defaultCoordinate: MissionCoordinate,
  field: keyof MissionCoordinate,
  value: number,
): MissionCoordinate => {
  const baseCoordinate = coordinate ?? defaultCoordinate;

  return {
    ...baseCoordinate,
    [field]: value,
  };
};

export const paramsFromMissionTableRow = (row: MissionTableRow): MissionParams => [
  row.param1,
  row.param2,
  row.param3,
  row.param4,
  row.lat,
  row.lng,
  row.alt,
];

export const coordinateFromMissionTableRow = (row: MissionTableRow): MissionCoordinate | null => {
  if (row.lat === null || row.lng === null || row.alt === null) {
    return null;
  }

  return {
    lat: row.lat,
    lng: row.lng,
    alt: row.alt,
  };
};

export type MissionItemPatch = Partial<Omit<MissionItem, 'id' | 'seq'>>;
