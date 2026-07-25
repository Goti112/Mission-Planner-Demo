import type {
  FlightTelemetry,
  FlightDerivedData,
  NormalizedTelemetry,
  ArmState,
  FlightMode,
  VehicleType,
  MAVState,
  GPSFixType,
  BatteryWarningLevel,
  EKFHealthStatus,
} from './FlightTelemetryModel';

export const DEFAULT_FLIGHT_TELEMETRY: FlightTelemetry = {
  timestamp: 0,
  attitude: {
    pitchDeg: 0, rollDeg: 0, yawDeg: 0,
    pitchRateDegS: 0, rollRateDegS: 0, yawRateDegS: 0,
  },
  velocity: {
    groundSpeedMs: 0, airSpeedMs: null, verticalSpeedMs: 0,
    throttlePercent: 0,
    velNorthMs: 0, velEastMs: 0, velDownMs: 0,
  },
  altitude: {
    altitudeMSLm: 0, altitudeAGLm: null, homeAltitudeMSLm: null,
  },
  navigation: {
    latitude: 0, longitude: 0, headingDeg: 0,
    courseOverGroundDeg: null, currentWaypointIndex: null,
    distanceToWaypointM: null, bearingToWaypointDeg: null,
  },
  vehicleStatus: {
    armState: 'DISARMED' as ArmState,
    flightMode: 'UNKNOWN' as FlightMode,
    flightModeLabel: 'UNKNOWN',
    vehicleType: 0 as VehicleType,
    mavState: 0 as MAVState,
    lastHeartbeatMs: 0,
    isConnected: false,
    cpuLoadPercent: null,
  },
  gpsStatus: {
    fixType: 0 as GPSFixType,
    satellitesVisible: 0,
    hdop: null,
    vdop: null,
    hasSufficientFix: false,
  },
  battery: {
    voltageV: 0,
    currentA: null,
    remainingPercent: null,
    consumedMah: null,
    warningLevel: 'UNKNOWN' as BatteryWarningLevel,
  },
  ekf: {
    healthStatus: 'UNKNOWN' as EKFHealthStatus,
    flags: 0,
    posHorizVariance: null,
    posVertVariance: null,
    velocityVariance: null,
    compassVariance: null,
    hasAbsolutePosition: false,
  },
  controlSurfaces: {
    aileronPct:  0,
    elevatorPct: 0,
    rudderPct:   0,
    throttlePct: 0,
    flapsPct:    0,
  },
  controlSurfacesSource: 'PREV_HOLD',
  statusTextMessages: [],
};

export const DEFAULT_FLIGHT_DERIVED_DATA: FlightDerivedData = {
  distanceToWaypointM: null,
  bearingToWaypointDeg: null,
  totalDistanceTravelledM: 0,
  smoothedClimbRateMs: 0,
  etaToWaypointSec: null,
  estimatedFlightTimeRemainingSec: null,
  homePosition: null,
  distanceToHomeM: null,
  bearingToHomeDeg: null,
};

export const DEFAULT_NORMALIZED_TELEMETRY: NormalizedTelemetry = {
  altitude: 0,
  groundSpeed: 0,
  verticalSpeed: 0,
  yaw: 0,
  distToWP: null,
  distToMAV: null,
  gpsFixStatus: 0 as GPSFixType,
  ekfHealthy: false,
  connected: false,
  battery: {
    voltageV: 0,
    currentA: null,
    remainingPercent: null,
    consumedMah: null,
    warningLevel: 'UNKNOWN' as BatteryWarningLevel,
  },
};
