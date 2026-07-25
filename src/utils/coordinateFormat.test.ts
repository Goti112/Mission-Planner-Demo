import * as mgrs from 'mgrs';
import * as utm from 'utm';
import { describe, expect, it } from 'vitest';
import {
  formatCoordinatePair,
  formatCoordinateRows,
  formatCoordinateInput,
  parseCoordinatePair,
  validateCoordinateString,
} from './coordinateFormat';

const TEST_LATITUDE = 40.4168;
const TEST_LONGITUDE = -3.7038;

describe('coordinateFormat', () => {
  it('formats decimal geographic coordinates', () => {
    expect(formatCoordinatePair('geo', TEST_LATITUDE, TEST_LONGITUDE)).toBe('40.416800, -3.703800');
    expect(formatCoordinateRows('geo', TEST_LATITUDE, TEST_LONGITUDE)).toEqual([
      { label: 'Lat', value: '40.416800' },
      { label: 'Lon', value: '-3.703800' },
    ]);
  });

  it('formats MGRS and UTM grid coordinates from the same latitude longitude order', () => {
    const utmCoordinate = utm.fromLatLon(TEST_LATITUDE, TEST_LONGITUDE);

    expect(formatCoordinatePair('mgrs', TEST_LATITUDE, TEST_LONGITUDE)).toBe(
      mgrs.forward([TEST_LONGITUDE, TEST_LATITUDE]),
    );
    expect(formatCoordinatePair('utm', TEST_LATITUDE, TEST_LONGITUDE)).toBe(
      `${utmCoordinate.zoneNum}${utmCoordinate.zoneLetter} ${utmCoordinate.easting.toFixed(0)} ${utmCoordinate.northing.toFixed(0)}`,
    );
  });

  it('keeps GEO valid at the poles but rejects MGRS and UTM outside their supported grid range', () => {
    expect(formatCoordinatePair('geo', 90, 0)).toBe('90.000000, 0.000000');
    expect(formatCoordinatePair('mgrs', 90, 0)).toBe('--');
    expect(formatCoordinatePair('utm', 90, 0)).toBe('--');
  });

  it('returns empty display values for invalid coordinates', () => {
    expect(formatCoordinatePair('geo', Number.NaN, TEST_LONGITUDE)).toBe('--');
    expect(formatCoordinateRows('utm', 40, 181)).toEqual([
      { label: 'UTM', value: '--' },
      { label: 'Coords', value: '--' },
    ]);
  });
});

describe('formatCoordinateInput', () => {
  it('formats geo as "lat, lng"', () => {
    expect(formatCoordinateInput('geo', TEST_LATITUDE, TEST_LONGITUDE)).toBe(
      '40.416800, -3.703800',
    );
  });

  it('formats mgrs', () => {
    expect(formatCoordinateInput('mgrs', TEST_LATITUDE, TEST_LONGITUDE)).toBe(
      mgrs.forward([TEST_LONGITUDE, TEST_LATITUDE]),
    );
  });

  it('formats utm', () => {
    const utmCoordinate = utm.fromLatLon(TEST_LATITUDE, TEST_LONGITUDE);
    expect(formatCoordinateInput('utm', TEST_LATITUDE, TEST_LONGITUDE)).toBe(
      `${utmCoordinate.zoneNum}${utmCoordinate.zoneLetter} ${utmCoordinate.easting.toFixed(0)} ${utmCoordinate.northing.toFixed(0)}`,
    );
  });

  it('returns empty string for invalid coordinates', () => {
    expect(formatCoordinateInput('geo', Number.NaN, TEST_LONGITUDE)).toBe('');
  });
});

describe('parseCoordinatePair', () => {
  it('parses geo "lat, lng"', () => {
    expect(parseCoordinatePair('geo', '40.4168, -3.7038')).toEqual({ lat: 40.4168, lng: -3.7038 });
  });

  it('parses geo "lat lng"', () => {
    expect(parseCoordinatePair('geo', '40.4168 -3.7038')).toEqual({ lat: 40.4168, lng: -3.7038 });
  });

  it('returns null for out-of-range geo values', () => {
    expect(parseCoordinatePair('geo', '95, 0')).toBeNull();
    expect(parseCoordinatePair('geo', '0, 190')).toBeNull();
  });

  it('parses mgrs string back to lat/lng', () => {
    const mgrsString = mgrs.forward([TEST_LONGITUDE, TEST_LATITUDE]);
    const result = parseCoordinatePair('mgrs', mgrsString);
    expect(result).not.toBeNull();
    expect(result!.lat).toBeCloseTo(TEST_LATITUDE, 3);
    expect(result!.lng).toBeCloseTo(TEST_LONGITUDE, 3);
  });

  it('returns null for invalid mgrs', () => {
    expect(parseCoordinatePair('mgrs', 'NOT-VALID')).toBeNull();
  });

  it('parses utm string back to lat/lng', () => {
    const { easting, northing, zoneNum, zoneLetter } = utm.fromLatLon(TEST_LATITUDE, TEST_LONGITUDE);
    const result = parseCoordinatePair('utm', `${zoneNum}${zoneLetter} ${easting.toFixed(0)} ${northing.toFixed(0)}`);
    expect(result).not.toBeNull();
    expect(result!.lat).toBeCloseTo(TEST_LATITUDE, 3);
    expect(result!.lng).toBeCloseTo(TEST_LONGITUDE, 3);
  });

  it('returns null for invalid utm', () => {
    expect(parseCoordinatePair('utm', 'BAD')).toBeNull();
    expect(parseCoordinatePair('utm', '30T 445000')).toBeNull();
  });
});

describe('validateCoordinateString', () => {
  it('validates geo strings', () => {
    expect(validateCoordinateString('geo', '40.4168, -3.7038').valid).toBe(true);
    expect(validateCoordinateString('geo', 'abc').valid).toBe(false);
  });

  it('validates mgrs strings', () => {
    expect(validateCoordinateString('mgrs', mgrs.forward([TEST_LONGITUDE, TEST_LATITUDE])).valid).toBe(true);
    expect(validateCoordinateString('mgrs', 'bad').valid).toBe(false);
  });

  it('validates utm strings', () => {
    const { easting, northing, zoneNum, zoneLetter } = utm.fromLatLon(TEST_LATITUDE, TEST_LONGITUDE);
    expect(validateCoordinateString('utm', `${zoneNum}${zoneLetter} ${easting.toFixed(0)} ${northing.toFixed(0)}`).valid).toBe(true);
    expect(validateCoordinateString('utm', '30T 445000').valid).toBe(false);
  });
});
