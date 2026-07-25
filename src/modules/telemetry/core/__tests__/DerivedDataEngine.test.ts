import { describe, expect, it } from 'vitest';

import { computeDerivedData } from '../DerivedDataEngine';
import {
  DEFAULT_FLIGHT_DERIVED_DATA,
  DEFAULT_FLIGHT_TELEMETRY,
  haversineDistanceM,
} from '../FlightTelemetryModel';
import type { FlightDerivedData, FlightTelemetry } from '../FlightTelemetryModel';

const makeTelemetry = (
  latitude: number,
  longitude: number,
  groundSpeedMs: number,
): FlightTelemetry => ({
  ...DEFAULT_FLIGHT_TELEMETRY,
  velocity: {
    ...DEFAULT_FLIGHT_TELEMETRY.velocity,
    groundSpeedMs,
  },
  navigation: {
    ...DEFAULT_FLIGHT_TELEMETRY.navigation,
    latitude,
    longitude,
  },
});

const makePreviousDerived = (totalDistanceTravelledM: number): FlightDerivedData => ({
  ...DEFAULT_FLIGHT_DERIVED_DATA,
  totalDistanceTravelledM,
});

describe('computeDerivedData', () => {
  it('does not invent travelled distance when previous position is unavailable', () => {
    const result = computeDerivedData(makeTelemetry(40, -3, 60), {
      homePosition: null,
      activeWaypoint: null,
      batteryCapacityMah: 5000,
      previousPosition: null,
      prev: makePreviousDerived(10),
    });

    expect(result.totalDistanceTravelledM).toBe(10);
  });

  it('integrates travelled distance from the previous geographic position', () => {
    const previousPosition = { latitude: 40, longitude: -3 };
    const telemetry = makeTelemetry(40.001, -3, 0);
    const expectedStepDistanceM = haversineDistanceM(
      previousPosition.latitude,
      previousPosition.longitude,
      telemetry.navigation.latitude,
      telemetry.navigation.longitude,
    );

    const result = computeDerivedData(telemetry, {
      homePosition: null,
      activeWaypoint: null,
      batteryCapacityMah: 5000,
      previousPosition,
      prev: makePreviousDerived(10),
    });

    expect(result.totalDistanceTravelledM).toBeCloseTo(10 + expectedStepDistanceM, 5);
  });
});
