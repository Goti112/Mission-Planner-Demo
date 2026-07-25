import { describe, expect, it } from 'vitest';
import { resolveDroneTrailAltitude } from '../droneTrailAltitude';

describe('droneTrailAltitude', () => {
  it('uses telemetry MSL for the rendered trail height when available', () => {
    const altitude = resolveDroneTrailAltitude({
      telemetryAltitudeAGL: 80,
      telemetryAltitudeMSL: 720,
      storeAltitudeAGL: 0,
      storeAltitudeMSL: null,
      terrainMSL: 100,
    });

    expect(altitude.altitudeAGL).toBe(80);
    expect(altitude.altitudeMSL).toBe(720);
  });

  it('derives AGL from telemetry MSL and terrain when telemetry AGL is missing', () => {
    const altitude = resolveDroneTrailAltitude({
      telemetryAltitudeAGL: null,
      telemetryAltitudeMSL: 720,
      storeAltitudeAGL: 0,
      storeAltitudeMSL: null,
      terrainMSL: 640,
    });

    expect(altitude.altitudeAGL).toBe(80);
    expect(altitude.altitudeMSL).toBe(720);
  });
});
