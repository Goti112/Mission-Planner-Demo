import { describe, it, expect, beforeEach } from 'vitest';
import { FeedforwardEngine, DEFAULT_FF_CONFIG } from '../FeedforwardEngine';
import type { FlightTelemetry } from '../../../telemetry';

/** Snapshot de telemetría mínimo para tests. */
function makeTel(pitchDeg = 0, rollDeg = 0, yawDeg = 0, headingDeg = 0): FlightTelemetry {
  return {
    timestamp:     1000,
    attitude:      { pitchDeg, rollDeg, yawDeg, pitchRateDegS: 0, rollRateDegS: 0, yawRateDegS: 0 },
    velocity:      { groundSpeedMs: 10, airSpeedMs: 10, verticalSpeedMs: 0, velNorthMs: 0, velEastMs: 0, velDownMs: 0 },
    altitude:      { altitudeMSLm: 100, altitudeAGLm: 50, homeAltitudeMSLm: 0 },
    navigation:    { latitude: 0, longitude: 0, headingDeg, courseOverGroundDeg: null, currentWaypointIndex: null, distanceToWaypointM: null, bearingToWaypointDeg: null },
    vehicleStatus: { armState: 'DISARMED', flightMode: 'STABILIZE', flightModeLabel: 'STABILIZE', vehicleType: 2, mavState: 'STANDBY', lastHeartbeatMs: 0, isConnected: true, cpuLoadPercent: null },
    gpsStatus:     { fixType: 3, satellitesVisible: 10, hdop: 1.0, vdop: 1.0, hasSufficientFix: true },
    battery:       { voltageV: 12, currentA: null, remainingPercent: 100, consumedMah: null, warningLevel: 'NORMAL' },
    ekf:           { healthStatus: 'HEALTHY', flags: 0, posHorizVariance: null, posVertVariance: null, velocityVariance: null, compassVariance: null, hasAbsolutePosition: true },
  } as unknown as FlightTelemetry;
}

function makeOut(): FlightTelemetry {
  return makeTel();
}

describe('FeedforwardEngine', () => {
  let engine: FeedforwardEngine;

  beforeEach(() => {
    engine = new FeedforwardEngine(DEFAULT_FF_CONFIG);
  });

  it('first recordSnapshot — no crash, velocity = 0', () => {
    const snap = makeTel(10, 5);
    engine.recordSnapshot(snap, 0);
    const out = makeOut();
    engine.extrapolate(snap, out, 50); // 50 ms ahead
    // Sin previo (velocidad 0): out == snap
    expect(out.attitude.pitchDeg).toBeCloseTo(10, 3);
    expect(out.attitude.rollDeg).toBeCloseTo(5, 3);
  });

  it('proyecta pitch a la mitad de un ciclo de 50 ms', () => {
    // t=0: pitch=0 → t=50ms: pitch=10 → velocity = 10/50 = 0.2 deg/ms
    engine.recordSnapshot(makeTel(0), 0);
    engine.recordSnapshot(makeTel(10), 50);

    const smoothed = makeTel(10);
    const out = makeOut();
    // extrapolamos 25 ms después de la segunda actualización (nowMs=75)
    // rawDt = 75 - 50 = 25, dt = min(25,120)*0.8 = 20
    // FF: 10 + 0.2 * 20 = 14
    engine.extrapolate(smoothed, out, 75);
    expect(out.attitude.pitchDeg).toBeCloseTo(14, 1);
  });

  it('no extrapola más allá de maxPredictMs (120 ms)', () => {
    engine.recordSnapshot(makeTel(0), 0);
    engine.recordSnapshot(makeTel(10), 50); // velocity = 0.2 deg/ms

    const smoothed = makeTel(10);
    const out = makeOut();
    // 500 ms después → rawDt=500, acotado a maxPredictMs=120, dt=120*0.8=96
    // FF: 10 + 0.2 * 96 = 29.2
    engine.extrapolate(smoothed, out, 550);
    expect(out.attitude.pitchDeg).toBeCloseTo(29.2, 0);
  });

  it('altitud NO se extrapola — siempre valor real', () => {
    engine.recordSnapshot(makeTel(0), 0);
    engine.recordSnapshot(makeTel(10), 50);
    const smoothed = makeTel(10);
    smoothed.altitude.altitudeMSLm = 100;
    const out = makeOut();
    engine.extrapolate(smoothed, out, 75);
    expect(out.altitude.altitudeMSLm).toBe(100); // passthrough exacto
  });

  it('yaw circular: no hace 360° spin (359→1 = +2°)', () => {
    engine.recordSnapshot(makeTel(0, 0, 359), 0);
    engine.recordSnapshot(makeTel(0, 0, 1),   50); // +2° (menor arco)
    // velocity = +2/50 = +0.04 deg/ms
    const smoothed = makeTel(0, 0, 1);
    const out = makeOut();
    // extrapolamos 25 ms después (nowMs=75)
    // dt = min(25,120)*0.8 = 20
    // FF: 1 + 0.04 * 20 = 1.8°
    engine.extrapolate(smoothed, out, 75);
    expect(out.attitude.yawDeg).toBeCloseTo(1.8, 1);
  });

  it('reset() limpia estado — primer frame después = velocidad 0', () => {
    engine.recordSnapshot(makeTel(0), 0);
    engine.recordSnapshot(makeTel(10), 50);
    engine.reset();
    engine.recordSnapshot(makeTel(20), 100); // primer frame post-reset
    const out = makeOut();
    // velocidad debería ser 0 (solo hay 1 snapshot post-reset)
    // dt = min(25, 120) * 0.8 = 20  →  FF: 20 + 0 * 20 = 20
    engine.extrapolate(makeTel(20), out, 125);
    expect(out.attitude.pitchDeg).toBeCloseTo(20, 3);
  });

  it('gain=0 devuelve snapshot original sin extrapolación', () => {
    const noFF = new FeedforwardEngine({ gain: 0, maxPredictMs: 120 });
    noFF.recordSnapshot(makeTel(0), 0);
    noFF.recordSnapshot(makeTel(10), 50);
    const smoothed = makeTel(10);
    const out = makeOut();
    noFF.extrapolate(smoothed, out, 100); // debería quedar en 10, no proyectar
    expect(out.attitude.pitchDeg).toBeCloseTo(10, 3);
  });
});
