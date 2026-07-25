import { describe, it, expect } from 'vitest';
import { SmoothingEngine, DEFAULT_SMOOTHING_CONFIG } from '../SmoothingEngine';
import type { FlightTelemetry } from '../../../telemetry';

/** Builds a minimal FlightTelemetry for SmoothingEngine tests. */
function makeTel(overrides: {
  pitchDeg?: number;
  rollDeg?: number;
  yawDeg?: number;
  headingDeg?: number;
  verticalSpeedMs?: number;
  groundSpeedMs?: number;
  airSpeedMs?: number | null;
} = {}): FlightTelemetry {
  return {
    timestamp: Date.now(),
    attitude: {
      pitchDeg:      overrides.pitchDeg      ?? 0,
      rollDeg:       overrides.rollDeg       ?? 0,
      yawDeg:        overrides.yawDeg        ?? 0,
      pitchRateDegS: 0,
      rollRateDegS:  0,
      yawRateDegS:   0,
    },
    velocity: {
      groundSpeedMs:   overrides.groundSpeedMs   ?? 0,
      airSpeedMs:      overrides.airSpeedMs       ?? null,
      verticalSpeedMs: overrides.verticalSpeedMs  ?? 0,
      velNorthMs:      0,
      velEastMs:       0,
      velDownMs:       0,
    },
    altitude: {
      altitudeMSLm:     100,
      altitudeAGLm:     50,
      homeAltitudeMSLm: 0,
    },
    navigation: {
      latitude:             0,
      longitude:            0,
      headingDeg:           overrides.headingDeg ?? 0,
      courseOverGroundDeg:  null,
      currentWaypointIndex: null,
      distanceToWaypointM:  null,
      bearingToWaypointDeg: null,
    },
    vehicleStatus: {
      armState:        'DISARMED',
      flightMode:      'STABILIZE',
      flightModeLabel: 'STABILIZE',
      vehicleType:     2,
      mavState:        'STANDBY',
      lastHeartbeatMs: 0,
      isConnected:     true,
      cpuLoadPercent:  null,
    },
    gpsStatus: {
      fixType:           3,
      satellitesVisible: 10,
      hdop:              1.0,
      vdop:              1.0,
      hasSufficientFix:  true,
    },
    battery: {
      voltageV:         12,
      currentA:         null,
      remainingPercent: 100,
      consumedMah:      null,
      warningLevel:     'NORMAL',
    },
    ekf: {
      healthStatus:        'HEALTHY',
      flags:               0,
      posHorizVariance:    null,
      posVertVariance:     null,
      velocityVariance:    null,
      compassVariance:     null,
      hasAbsolutePosition: true,
    },
  } as unknown as FlightTelemetry;
}

describe('SmoothingEngine — EMA', () => {
  it('se inicializa con el primer valor sin salto (sin brusco arranque)', () => {
    const eng = new SmoothingEngine();
    const out = eng.update(makeTel({ pitchDeg: 20, rollDeg: 30 }));
    // En primer frame los valores deben igualar el raw (inicialización directa).
    expect(out.attitude.pitchDeg).toBeCloseTo(20, 5);
    expect(out.attitude.rollDeg).toBeCloseTo(30, 5);
  });

  it('con alpha=0.35 el pitch converge en ≤10 llamadas desde 0 hacia 20°', () => {
    const eng = new SmoothingEngine({ ...DEFAULT_SMOOTHING_CONFIG, pitch: 0.35 });
    // Inicializar en 0
    eng.update(makeTel({ pitchDeg: 0 }));

    let out = eng.update(makeTel({ pitchDeg: 0 }));
    for (let i = 0; i < 10; i++) {
      out = eng.update(makeTel({ pitchDeg: 20 }));
    }
    // α=0.35 → residuo = 0.65^10 ≈ 0.013 → valor ≈ 20*(1-0.013) ≈ 19.7
    expect(out.attitude.pitchDeg).toBeGreaterThan(19.0);
  });

  it('con alpha=0.30 converge más lento que con alpha=0.35', () => {
    const eng30 = new SmoothingEngine({ ...DEFAULT_SMOOTHING_CONFIG, pitch: 0.30 });
    const eng35 = new SmoothingEngine({ ...DEFAULT_SMOOTHING_CONFIG, pitch: 0.35 });

    // Inicializar ambos en 0
    eng30.update(makeTel({ pitchDeg: 0 }));
    eng35.update(makeTel({ pitchDeg: 0 }));

    const target = makeTel({ pitchDeg: 20 });
    let out30 = eng30.update(target);
    let out35 = eng35.update(target);

    for (let i = 0; i < 4; i++) {
      out30 = eng30.update(target);
      out35 = eng35.update(target);
    }
    // α=0.35 alcanza el target más rápido que α=0.30
    expect(out35.attitude.pitchDeg).toBeGreaterThan(out30.attitude.pitchDeg);
  });

  it('EMA circular yaw no produce spin entre 359° y 1°', () => {
    const eng = new SmoothingEngine({ ...DEFAULT_SMOOTHING_CONFIG, yaw: 0.45 });
    // Inicializar en 359°
    eng.update(makeTel({ yawDeg: 359 }));

    const out = eng.update(makeTel({ yawDeg: 1 }));
    const yaw = out.attitude.yawDeg;
    // El resultado debe estar cerca de 0° (pasar por 0), no cerca de 180°
    const nearZero = Math.min(yaw, 360 - yaw);
    expect(nearZero).toBeLessThan(10);
  });

  it('DEFAULT_SMOOTHING_CONFIG tiene alpha pitch=0.35, roll=0.35, yaw=0.45, climbRate=0.20', () => {
    expect(DEFAULT_SMOOTHING_CONFIG.pitch).toBe(0.35);
    expect(DEFAULT_SMOOTHING_CONFIG.roll).toBe(0.35);
    expect(DEFAULT_SMOOTHING_CONFIG.yaw).toBe(0.45);
    expect(DEFAULT_SMOOTHING_CONFIG.climbRate).toBe(0.20);
  });
});
