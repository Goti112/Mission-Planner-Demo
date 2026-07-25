import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { TelemetryInterpolator } from '../TelemetryInterpolator';
import type { FlightTelemetry } from '../FlightTelemetryModel';

type TestableInterpolator = {
  _running: boolean;
  _tick: (timeMs: number) => void;
};

beforeEach(() => {
  vi.stubGlobal('requestAnimationFrame', (_cb: FrameRequestCallback) => 1);
  vi.stubGlobal('cancelAnimationFrame', (_id: number) => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function makeTel(pitchDeg: number, rollDeg: number, timestamp: number): FlightTelemetry {
  return {
    timestamp,
    attitude: {
      pitchDeg,
      rollDeg,
      yawDeg: 0,
      pitchRateDegS: 0,
      rollRateDegS: 0,
      yawRateDegS: 0,
    },
    velocity: {
      groundSpeedMs: 10,
      airSpeedMs: 10,
      verticalSpeedMs: 1,
      velNorthMs: 10,
      velEastMs: 0,
      velDownMs: -1,
    },
    altitude: { altitudeMSLm: 100, altitudeAGLm: 50, homeAltitudeMSLm: 0 },
    navigation: {
      latitude: 40.0,
      longitude: -3.0,
      headingDeg: 90,
      courseOverGroundDeg: null,
      currentWaypointIndex: null,
      distanceToWaypointM: null,
      bearingToWaypointDeg: null,
    },
    vehicleStatus: {
      armState: 'DISARMED',
      flightMode: 'STABILIZE',
      flightModeLabel: 'STABILIZE',
      vehicleType: 2,
      mavState: 'STANDBY',
      lastHeartbeatMs: 0,
      isConnected: true,
      cpuLoadPercent: null,
    },
    gpsStatus: {
      fixType: 3,
      satellitesVisible: 10,
      hdop: 1.0,
      vdop: 1.0,
      hasSufficientFix: true,
    },
    battery: {
      voltageV: 12,
      currentA: null,
      remainingPercent: 100,
      consumedMah: null,
      warningLevel: 'NORMAL',
    },
    ekf: {
      healthStatus: 'HEALTHY',
      flags: 0,
      posHorizVariance: null,
      posVertVariance: null,
      velocityVariance: null,
      compassVariance: null,
      hasAbsolutePosition: true,
    },
  } as unknown as FlightTelemetry;
}

function makeTelWithYaw(yawDeg: number, yawRateDegS: number, headingDeg: number, timestamp: number): FlightTelemetry {
  const tel = makeTel(0, 0, timestamp);
  tel.attitude.yawDeg = yawDeg;
  tel.attitude.yawRateDegS = yawRateDegS;
  tel.navigation.headingDeg = headingDeg;
  return tel;
}

describe('TelemetryInterpolator - Catmull-Rom', () => {
  it('con solo 2 snapshots, emite sin crash (fallback a linear)', () => {
    const interp = new TelemetryInterpolator();
    const testInterp = interp as unknown as TestableInterpolator;
    const results: FlightTelemetry[] = [];
    interp.onFrame((tel) => results.push(tel));

    const base = Date.now();

    vi.setSystemTime(base);
    interp.pushSnapshot(makeTel(0, 0, base));

    vi.setSystemTime(base + 100);
    interp.pushSnapshot(makeTel(10, 20, base + 100));

    testInterp._running = true;

    vi.setSystemTime(base + 50);
    testInterp._tick(base + 50);

    expect(results.length).toBeGreaterThan(0);
    const out = results[results.length - 1];
    expect(out.attitude.pitchDeg).toBeCloseTo(5, 0);
    expect(out.attitude.rollDeg).toBeCloseTo(10, 0);
  });

  it('con 4 snapshots, el resultado es suave y dentro de bounds razonables', () => {
    const interp = new TelemetryInterpolator();
    const testInterp = interp as unknown as TestableInterpolator;
    const results: FlightTelemetry[] = [];
    interp.onFrame((tel) => results.push(tel));

    const base = Date.now();
    vi.setSystemTime(base); interp.pushSnapshot(makeTel(0, 0, base));
    vi.setSystemTime(base + 50); interp.pushSnapshot(makeTel(5, 0, base + 50));
    vi.setSystemTime(base + 100); interp.pushSnapshot(makeTel(15, 0, base + 100));
    vi.setSystemTime(base + 150); interp.pushSnapshot(makeTel(30, 0, base + 150));

    testInterp._running = true;

    for (let i = 0; i <= 4; i++) {
      const t = base + 100 + 50 * (i / 4);
      vi.setSystemTime(t);
      testInterp._tick(t);
    }

    expect(results.length).toBeGreaterThan(0);
    for (const r of results) {
      expect(r.attitude.pitchDeg).toBeGreaterThan(4);
      expect(r.attitude.pitchDeg).toBeLessThan(36);
    }
  });

  it('con aceleracion uniforme, Catmull-Rom ~= lineal (error < 1 grado)', () => {
    const interp = new TelemetryInterpolator();
    const testInterp = interp as unknown as TestableInterpolator;
    const results: FlightTelemetry[] = [];
    interp.onFrame((tel) => results.push(tel));

    const base = Date.now();
    vi.setSystemTime(base); interp.pushSnapshot(makeTel(0, 0, base));
    vi.setSystemTime(base + 50); interp.pushSnapshot(makeTel(10, 0, base + 50));
    vi.setSystemTime(base + 100); interp.pushSnapshot(makeTel(20, 0, base + 100));
    vi.setSystemTime(base + 150); interp.pushSnapshot(makeTel(30, 0, base + 150));

    testInterp._running = true;

    const mid = base + 125;
    vi.setSystemTime(mid);
    testInterp._tick(mid);

    expect(results.length).toBeGreaterThan(0);
    const out = results[results.length - 1];
    expect(out.attitude.pitchDeg).toBeCloseTo(25, 0);
  });

  it('dead-reckoning mantiene yaw y heading girando durante gaps largos', () => {
    const interp = new TelemetryInterpolator();
    const testInterp = interp as unknown as TestableInterpolator;
    const results: FlightTelemetry[] = [];
    interp.onFrame((tel) => results.push(tel));

    const base = Date.now();
    vi.setSystemTime(base);
    interp.pushSnapshot(makeTelWithYaw(340, 0, 340, base));

    vi.setSystemTime(base + 100);
    interp.pushSnapshot(makeTelWithYaw(350, 30, 350, base + 100));

    testInterp._running = true;

    vi.setSystemTime(base + 250);
    testInterp._tick(base + 250);

    expect(results.length).toBeGreaterThan(0);
    const out = results[results.length - 1];
    expect(out.attitude.yawDeg).toBeCloseTo(354.5, 1);
    expect(out.navigation.headingDeg).toBeCloseTo(354.5, 1);
  });
});
