import * as mgrs from 'mgrs';
import * as utm from 'utm';

export type CoordinateFormat = 'geo' | 'mgrs' | 'utm';

export interface CoordinateDisplayRow {
  readonly label: string;
  readonly value: string;
}

const formatGeoCoordinate = (value: number): string => value.toFixed(6);
const GRID_MIN_LATITUDE = -80;
const GRID_MAX_LATITUDE = 84;

const hasValidCoordinate = (latitude: number, longitude: number): boolean =>
  Number.isFinite(latitude) &&
  Number.isFinite(longitude) &&
  Math.abs(latitude) <= 90 &&
  Math.abs(longitude) <= 180;

const hasSupportedGridCoordinate = (latitude: number, longitude: number): boolean =>
  hasValidCoordinate(latitude, longitude) &&
  latitude >= GRID_MIN_LATITUDE &&
  latitude <= GRID_MAX_LATITUDE;

export const formatCoordinatePair = (
  format: CoordinateFormat,
  latitude: number,
  longitude: number,
): string => {
  if (!hasValidCoordinate(latitude, longitude)) {
    return '--';
  }

  if (format === 'geo') {
    return `${formatGeoCoordinate(latitude)}, ${formatGeoCoordinate(longitude)}`;
  }

  if (!hasSupportedGridCoordinate(latitude, longitude)) {
    return '--';
  }

  if (format === 'mgrs') {
    return mgrs.forward([longitude, latitude]);
  }

  const { easting, northing, zoneNum, zoneLetter } = utm.fromLatLon(latitude, longitude);

  return `${zoneNum}${zoneLetter} ${easting.toFixed(0)} ${northing.toFixed(0)}`;
};

export const formatCoordinateRows = (
  format: CoordinateFormat,
  latitude: number,
  longitude: number,
): readonly CoordinateDisplayRow[] => {
  if (!hasValidCoordinate(latitude, longitude)) {
    return [
      { label: format === 'geo' ? 'Lat' : format.toUpperCase(), value: '--' },
      { label: format === 'geo' ? 'Lon' : 'Coords', value: '--' },
    ];
  }

  if (format === 'geo') {
    return [
      { label: 'Lat', value: formatGeoCoordinate(latitude) },
      { label: 'Lon', value: formatGeoCoordinate(longitude) },
    ];
  }

  return [
    {
      label: format.toUpperCase(),
      value: formatCoordinatePair(format, latitude, longitude),
    },
  ];
};

interface ParsedCoordinate {
  readonly lat: number;
  readonly lng: number;
}

const parseGeoCoordinatePair = (value: string): ParsedCoordinate | null => {
  const trimmed = value.trim();
  const parts = trimmed.split(/[\s,]+/).filter(Boolean);
  if (parts.length !== 2) return null;

  const lat = Number.parseFloat(parts[0]);
  const lng = Number.parseFloat(parts[1]);
  if (!hasValidCoordinate(lat, lng)) return null;

  return { lat, lng };
};

const parseMgrsCoordinate = (value: string): ParsedCoordinate | null => {
  try {
    const point = mgrs.toPoint(value.trim().toUpperCase());
    if (point == null || point.length < 2) return null;
    const [lng, lat] = point;
    if (!hasValidCoordinate(lat, lng)) return null;
    return { lat, lng };
  } catch {
    return null;
  }
};

const parseUtmCoordinate = (value: string): ParsedCoordinate | null => {
  const trimmed = value.trim();
  const parts = trimmed.split(/\s+/).filter(Boolean);
  if (parts.length !== 3) return null;

  const zoneMatch = parts[0].match(/^(\d{1,2})([A-Z])$/i);
  if (zoneMatch == null) return null;

  const zoneNum = Number.parseInt(zoneMatch[1], 10);
  const zoneLetter = zoneMatch[2].toUpperCase();
  const easting = Number.parseFloat(parts[1]);
  const northing = Number.parseFloat(parts[2]);

  if (!Number.isFinite(easting) || !Number.isFinite(northing)) return null;

  try {
    const result = utm.toLatLon(easting, northing, zoneNum, zoneLetter) as {
      latitude: number;
      longitude: number;
    };
    const { latitude: lat, longitude: lon } = result;
    if (!hasValidCoordinate(lat, lon)) return null;
    return { lat, lng: lon };
  } catch {
    return null;
  }
};

export const parseCoordinatePair = (
  format: CoordinateFormat,
  value: string,
): ParsedCoordinate | null => {
  if (format === 'geo') return parseGeoCoordinatePair(value);
  if (format === 'mgrs') return parseMgrsCoordinate(value);
  return parseUtmCoordinate(value);
};

export const validateCoordinateString = (
  format: CoordinateFormat,
  value: string,
): { valid: boolean; error?: string } => {
  const parsed = parseCoordinatePair(format, value);
  if (parsed != null) return { valid: true };

  const label = format === 'geo' ? 'GEO (lat, lng)' : format === 'mgrs' ? 'MGRS' : 'UTM (zone easting northing)';
  return { valid: false, error: `Invalid ${label} coordinate` };
};

export const formatCoordinateInput = (
  format: CoordinateFormat,
  latitude: number,
  longitude: number,
): string => {
  if (!hasValidCoordinate(latitude, longitude)) return '';
  if (format === 'geo') return formatCoordinatePair('geo', latitude, longitude);
  if (!hasSupportedGridCoordinate(latitude, longitude)) return '';
  return formatCoordinatePair(format, latitude, longitude);
};
