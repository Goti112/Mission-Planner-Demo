export interface DroneTrailAltitudeInput {
  telemetryAltitudeAGL: number | null | undefined;
  telemetryAltitudeMSL: number | null | undefined;
  storeAltitudeAGL: number;
  storeAltitudeMSL: number | null | undefined;
  terrainMSL: number;
}

export interface DroneTrailAltitudeSample {
  altitudeAGL: number;
  altitudeMSL: number;
}

function isFiniteNumber(value: number | null | undefined): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

export function resolveDroneTrailAltitude(input: DroneTrailAltitudeInput): DroneTrailAltitudeSample {
  const altitudeMSL = isFiniteNumber(input.telemetryAltitudeMSL)
    ? input.telemetryAltitudeMSL
    : isFiniteNumber(input.storeAltitudeMSL)
      ? input.storeAltitudeMSL
      : input.terrainMSL + input.storeAltitudeAGL;

  const altitudeAGL = isFiniteNumber(input.telemetryAltitudeAGL)
    ? input.telemetryAltitudeAGL
    : Math.max(0, altitudeMSL - input.terrainMSL);

  return {
    altitudeAGL,
    altitudeMSL,
  };
}
