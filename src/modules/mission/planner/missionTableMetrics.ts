import type { MissionTableRow } from '../domain';
import { formatCoordinatePair, type CoordinateFormat } from '../../../utils/coordinateFormat';
import { formatMissionDistance, formatMissionNumber } from './missionPlanPresentation';

export interface MissionTableSegmentMetrics {
  readonly coordinate: string;
  readonly gradePercent: string;
  readonly angleDegrees: string;
  readonly distance: string;
  readonly azimuthDegrees: string;
}

interface SpatialMissionTableRow extends MissionTableRow {
  readonly lat: number;
  readonly lng: number;
  readonly alt: number;
}

const EARTH_RADIUS_M = 6371008.8;
const DEG_TO_RAD = Math.PI / 180;
const RAD_TO_DEG = 180 / Math.PI;
const EMPTY_METRIC = '—';

const hasSpatialCoordinate = (row: MissionTableRow): row is SpatialMissionTableRow =>
  row.lat !== null &&
  row.lng !== null &&
  row.alt !== null &&
  Number.isFinite(row.lat) &&
  Number.isFinite(row.lng) &&
  Number.isFinite(row.alt) &&
  Math.abs(row.lat) <= 90 &&
  Math.abs(row.lng) <= 180;

const toRadians = (degrees: number): number => degrees * DEG_TO_RAD;

const toDegrees = (radians: number): number => radians * RAD_TO_DEG;

const positiveModulo = (value: number, modulus: number): number => ((value % modulus) + modulus) % modulus;

const horizontalDistanceMeters = (from: SpatialMissionTableRow, to: SpatialMissionTableRow): number => {
  const fromLat = toRadians(from.lat);
  const toLat = toRadians(to.lat);
  const deltaLat = toRadians(to.lat - from.lat);
  const deltaLng = toRadians(to.lng - from.lng);
  const haversine =
    Math.sin(deltaLat / 2) ** 2 +
    Math.cos(fromLat) * Math.cos(toLat) * Math.sin(deltaLng / 2) ** 2;

  return 2 * EARTH_RADIUS_M * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));
};

const azimuthDegrees = (from: SpatialMissionTableRow, to: SpatialMissionTableRow): number => {
  const fromLat = toRadians(from.lat);
  const toLat = toRadians(to.lat);
  const deltaLng = toRadians(to.lng - from.lng);
  const y = Math.sin(deltaLng) * Math.cos(toLat);
  const x = Math.cos(fromLat) * Math.sin(toLat) - Math.sin(fromLat) * Math.cos(toLat) * Math.cos(deltaLng);

  return positiveModulo(toDegrees(Math.atan2(y, x)), 360);
};

const findPreviousSpatialRow = (
  rows: readonly MissionTableRow[],
  index: number,
): SpatialMissionTableRow | null => rows.slice(0, index).reverse().find(hasSpatialCoordinate) ?? null;

const formatAngle = (value: number | null): string =>
  value === null ? EMPTY_METRIC : `${formatMissionNumber(value, 1)}°`;

const formatGrade = (value: number | null): string =>
  value === null ? EMPTY_METRIC : formatMissionNumber(value, 1);

const segmentMetricsFromRows = (
  previousRow: SpatialMissionTableRow | null,
  row: SpatialMissionTableRow,
): Omit<MissionTableSegmentMetrics, 'coordinate'> => {
  if (previousRow === null) {
    return {
      gradePercent: EMPTY_METRIC,
      angleDegrees: EMPTY_METRIC,
      distance: EMPTY_METRIC,
      azimuthDegrees: EMPTY_METRIC,
    };
  }

  const distanceM = horizontalDistanceMeters(previousRow, row);
  const altitudeDeltaM = row.alt - previousRow.alt;
  const gradePercent = distanceM === 0 ? null : (altitudeDeltaM / distanceM) * 100;
  const angleDeg = distanceM === 0 ? null : toDegrees(Math.atan2(altitudeDeltaM, distanceM));

  return {
    gradePercent: formatGrade(gradePercent),
    angleDegrees: formatAngle(angleDeg),
    distance: formatMissionDistance(distanceM),
    azimuthDegrees: formatAngle(azimuthDegrees(previousRow, row)),
  };
};

export const getMissionTableSegmentMetrics = (
  rows: readonly MissionTableRow[],
  index: number,
  coordinateFormat: CoordinateFormat,
): MissionTableSegmentMetrics => {
  const row = rows[index];

  if (row === undefined) {
    throw new Error(`Cannot calculate mission table metrics because row index ${index} does not exist.`);
  }

  if (!hasSpatialCoordinate(row)) {
    return {
      coordinate: EMPTY_METRIC,
      gradePercent: EMPTY_METRIC,
      angleDegrees: EMPTY_METRIC,
      distance: EMPTY_METRIC,
      azimuthDegrees: EMPTY_METRIC,
    };
  }

  return {
    coordinate: formatCoordinatePair(coordinateFormat, row.lat, row.lng),
    ...segmentMetricsFromRows(findPreviousSpatialRow(rows, index), row),
  };
};
