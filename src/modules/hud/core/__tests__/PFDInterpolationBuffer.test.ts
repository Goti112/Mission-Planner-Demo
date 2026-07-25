import { describe, it, expect, beforeEach } from 'vitest';
import { PFDInterpolationBuffer, DEFAULT_PFD_BUFFER_CONFIG } from '../PFDInterpolationBuffer';
import type { FlightTelemetry } from '../../../telemetry';
import { DEFAULT_FLIGHT_TELEMETRY } from '../../../telemetry';

// ── Test helpers ──────────────────────────────────────────────────────────

/** Minimal FlightTelemetry for tests — same pattern as FeedforwardEngine tests. */
function makeTel(overrides: {
  pitchDeg?: number;
  rollDeg?: number;
  yawDeg?: number;
  headingDeg?: number;
  groundSpeedMs?: number;
  verticalSpeedMs?: number;
  altitudeMSLm?: number;
  pitchRateDegS?: number;
  rollRateDegS?: number;
  yawRateDegS?: number;
} = {}): FlightTelemetry {
  return {
    timestamp:     1000,
    attitude:      {
      pitchDeg: overrides.pitchDeg ?? 0,
      rollDeg: overrides.rollDeg ?? 0,
      yawDeg: overrides.yawDeg ?? 0,
      pitchRateDegS: overrides.pitchRateDegS ?? 0,
      rollRateDegS:  overrides.rollRateDegS  ?? 0,
      yawRateDegS:   overrides.yawRateDegS   ?? 0,
    },
    velocity:      {
      groundSpeedMs: overrides.groundSpeedMs ?? 10,
      airSpeedMs: 10,
      verticalSpeedMs: overrides.verticalSpeedMs ?? 0,
      velNorthMs: 0, velEastMs: 0, velDownMs: 0,
    },
    altitude:      {
      altitudeMSLm: overrides.altitudeMSLm ?? 100,
      altitudeAGLm: 50,
      homeAltitudeMSLm: 0,
    },
    navigation:    {
      latitude: 0, longitude: 0,
      headingDeg: overrides.headingDeg ?? 0,
      courseOverGroundDeg: null,
      currentWaypointIndex: null,
      distanceToWaypointM: null,
      bearingToWaypointDeg: null,
    },
    vehicleStatus: {
      armState: 'DISARMED', flightMode: 'STABILIZE', flightModeLabel: 'STABILIZE',
      vehicleType: 2, mavState: 'STANDBY', lastHeartbeatMs: 0,
      isConnected: true, cpuLoadPercent: null,
    },
    gpsStatus:     {
      fixType: 3, satellitesVisible: 10, hdop: 1.0, vdop: 1.0, hasSufficientFix: true,
    },
    battery:       {
      voltageV: 12, currentA: null, remainingPercent: 100, consumedMah: null,
      warningLevel: 'NORMAL',
    },
    ekf:           {
      healthStatus: 'HEALTHY', flags: 0, posHorizVariance: null,
      posVertVariance: null, velocityVariance: null, compassVariance: null,
      hasAbsolutePosition: true,
    },
  } as unknown as FlightTelemetry;
}

// ── Tests ─────────────────────────────────────────────────────────────────

describe('PFDInterpolationBuffer', () => {
  const DELAY = DEFAULT_PFD_BUFFER_CONFIG.renderDelayMs;

  let buffer: PFDInterpolationBuffer;

  beforeEach(() => {
    buffer = new PFDInterpolationBuffer();
  });

  // ── No samples ──────────────────────────────────────────────────────

  it('returns DEFAULT_FLIGHT_TELEMETRY when buffer is empty', () => {
    const result = buffer.sample(1000);
    expect(result).toBe(DEFAULT_FLIGHT_TELEMETRY);
  });

  // ── One sample ──────────────────────────────────────────────────────

  it('returns the single sample unchanged when only one sample exists', () => {
    const tel = makeTel({ pitchDeg: 10, rollDeg: 5 });
    buffer.pushSample(tel, 1000);

    const result = buffer.sample(1000 + DELAY);
    expect(result.attitude.pitchDeg).toBe(10);
    expect(result.attitude.rollDeg).toBe(5);
  });

  // ── Midpoint interpolation ──────────────────────────────────────────

  it('interpolates pitch at midpoint between two samples', () => {
    const telA = makeTel({ pitchDeg: 0 });
    const telB = makeTel({ pitchDeg: 20 });

    buffer.pushSample(telA, 1000);
    buffer.pushSample(telB, 1100);

    // renderTime = (1050 + DELAY) - DELAY = 1050  (midpoint of [1000, 1100])
    const result = buffer.sample(1050 + DELAY);
    expect(result.attitude.pitchDeg).toBeCloseTo(10, 5);
  });

  it('interpolates roll at quarter point', () => {
    const telA = makeTel({ rollDeg: 0 });
    const telB = makeTel({ rollDeg: 40 });

    buffer.pushSample(telA, 1000);
    buffer.pushSample(telB, 1100);

    // renderTime = (1025 + DELAY) - DELAY = 1025  → t = 0.25
    const result = buffer.sample(1025 + DELAY);
    expect(result.attitude.rollDeg).toBeCloseTo(10, 5);
  });

  it('interpolates roll continuously across the +180/-180 boundary', () => {
    const telA = makeTel({ rollDeg: 170 });
    const telB = makeTel({ rollDeg: -170 });

    buffer.pushSample(telA, 1000);
    buffer.pushSample(telB, 1100);

    const result = buffer.sample(1050 + DELAY);
    expect(result.attitude.rollDeg).toBeCloseTo(180, 5);
  });

  it('interpolates altitude at three-quarter point', () => {
    const telA = makeTel({ altitudeMSLm: 100 });
    const telB = makeTel({ altitudeMSLm: 200 });

    buffer.pushSample(telA, 1000);
    buffer.pushSample(telB, 1100);

    // renderTime = (1075 + DELAY) - DELAY = 1075  → t = 0.75
    const result = buffer.sample(1075 + DELAY);
    expect(result.altitude.altitudeMSLm).toBeCloseTo(175, 5);
  });

  // ── Circular yaw interpolation ──────────────────────────────────────

  it('interpolates yaw across the 360/0 boundary via shortest arc', () => {
    const telA = makeTel({ yawDeg: 350 });
    const telB = makeTel({ yawDeg: 10 });

    buffer.pushSample(telA, 1000);
    buffer.pushSample(telB, 1100);

    // renderTime = (1050 + DELAY) - DELAY = 1050  → midpoint → yaw ≈ 0 (or 360)
    const result = buffer.sample(1050 + DELAY);
    // Should go 350 → 360/0 → 10, midpoint ≈ 0
    expect(result.attitude.yawDeg).toBeCloseTo(0, 0);
  });

  it('interpolates heading across the 360/0 boundary', () => {
    const telA = makeTel({ headingDeg: 355 });
    const telB = makeTel({ headingDeg: 5 });

    buffer.pushSample(telA, 1000);
    buffer.pushSample(telB, 1100);

    // midpoint → should be ~ 0 (or 360)
    const result = buffer.sample(1050 + DELAY);
    expect(result.navigation.headingDeg).toBeCloseTo(0, 0);
  });

  // ── Edge cases: renderTime before oldest ────────────────────────────

  it('returns oldest sample when renderTime is before oldest', () => {
    const telA = makeTel({ pitchDeg: 10 });
    const telB = makeTel({ pitchDeg: 20 });

    buffer.pushSample(telA, 1000);
    buffer.pushSample(telB, 1100);

    // renderTime = 900 - 150 = 750  → before oldest (1000) → return oldest
    const result = buffer.sample(900);
    expect(result.attitude.pitchDeg).toBeCloseTo(10, 5);
  });

  // ── Edge cases: renderTime past newest (extrapolation) ───────────────

  it('extrapolates using angular rates when renderTime is past newest', () => {
    const telA = makeTel({ pitchDeg: 10 });
    const telB = makeTel({ pitchDeg: 20 }); // pitchRateDegS=0 (default: not rotating)

    buffer.pushSample(telA, 1000);
    buffer.pushSample(telB, 1100);

    // renderTime = (1250 + DELAY) - DELAY = 1250 → 150ms past newest (ts=1100)
    // maxEdgeExtrapolationMs = 1000, so dtS = min(150, 1000) / 1000 = 0.15s
    // pitchRateDegS = 0 → pitch = 20 + 0 * 0.15 = 20 (no rotation, stay at newest)
    const result = buffer.sample(1250 + DELAY);
    expect(result.attitude.pitchDeg).toBeCloseTo(20, 5);
  });

  it('clamps edge extrapolation at maxEdgeExtrapolationMs', () => {
    const buf = new PFDInterpolationBuffer({ maxEdgeExtrapolationMs: 50 });
    const telA = makeTel({ pitchDeg: 0 });
    const telB = makeTel({ pitchDeg: 10 }); // pitchRateDegS=0

    buf.pushSample(telA, 1000);
    buf.pushSample(telB, 1100);

    // far future: renderTime = (1900 + DELAY) - DELAY = 1900 → 800ms past newest
    // Clamped to 50ms cap → dtS = 0.05s
    // pitchRateDegS = 0 → pitch = 10 + 0 * 0.05 = 10 (freeze at newest)
    const result = buf.sample(1900 + DELAY);
    expect(result.attitude.pitchDeg).toBeCloseTo(10, 5);
  });

  it('dead-reckons attitude using angular rates from the newest sample', () => {
    const buf = new PFDInterpolationBuffer({ maxEdgeExtrapolationMs: 200 });
    // Aircraft pitching up at 60°/s, rolling at 30°/s, climbing at 3 m/s
    const tel = makeTel({
      pitchDeg: 10,
      rollDeg: 5,
      pitchRateDegS: 60,
      rollRateDegS: 30,
      verticalSpeedMs: 3,
      altitudeMSLm: 100,
    });
    buf.pushSample(tel, 1000);

    // renderTime = (1050 + DELAY) - DELAY = 1050 → 50ms past newest
    // dtS = min(50, 200) / 1000 = 0.05s
    // pitch  = 10 + 60  * 0.05 = 13°
    // roll   =  5 + 30  * 0.05 = 6.5°
    // altMSL = 100 + 3  * 0.05 = 100.15m
    const result = buf.sample(1050 + DELAY);
    expect(result.attitude.pitchDeg).toBeCloseTo(13, 1);
    expect(result.attitude.rollDeg).toBeCloseTo(6.5, 1);
    expect(result.altitude.altitudeMSLm).toBeCloseTo(100.15, 2);
  });

  it('disables extrapolation when maxEdgeExtrapolationMs=0', () => {
    const buf = new PFDInterpolationBuffer({ maxEdgeExtrapolationMs: 0 });
    const telA = makeTel({ pitchDeg: 0 });
    const telB = makeTel({ pitchDeg: 10 });

    buf.pushSample(telA, 1000);
    buf.pushSample(telB, 1100);

    // renderTime past newest → should just return newest (10)
    const result = buf.sample(1300 + DELAY);
    expect(result.attitude.pitchDeg).toBe(10);
  });

  // ── Buffer eviction ─────────────────────────────────────────────────

  it('evicts oldest entries when buffer exceeds maxBufferSize', () => {
    const buf = new PFDInterpolationBuffer({ maxBufferSize: 3 });

    buf.pushSample(makeTel({ pitchDeg: 1 }), 1000);
    buf.pushSample(makeTel({ pitchDeg: 2 }), 1100);
    buf.pushSample(makeTel({ pitchDeg: 3 }), 1200);
    expect(buf.bufferDepth).toBe(3);

    // Push 4th sample → evicts the 1st (pitch=1)
    buf.pushSample(makeTel({ pitchDeg: 4 }), 1300);
    expect(buf.bufferDepth).toBe(3);

    // renderTime = 1250 - 150 = 1100 → should be pitch=2 (now oldest)
    const result = buf.sample(1250);
    expect(result.attitude.pitchDeg).toBe(2);
  });

  // ── Reset ───────────────────────────────────────────────────────────

  it('reset() clears the buffer', () => {
    buffer.pushSample(makeTel({ pitchDeg: 10 }), 1000);
    buffer.pushSample(makeTel({ pitchDeg: 20 }), 1100);
    expect(buffer.bufferDepth).toBe(2);

    // Sample once past newest so _output holds the newest rendered frame (pitch≈20)
    buffer.sample(1150 + DELAY);

    buffer.reset();
    expect(buffer.bufferDepth).toBe(0);

    // After reset, buffer freezes at last rendered frame instead of flashing
    // to DEFAULT (all-zeros / black PFD). Values are deep-equal to DEFAULT
    // because _output was populated with interpolated data, but we return the
    // internal _output object, not the DEFAULT singleton.
    const result = buffer.sample(DELAY + 1200);
    expect(result).not.toBe(DEFAULT_FLIGHT_TELEMETRY); // not the singleton
    expect(result.attitude.pitchDeg).toBeCloseTo(20, 0); // last rendered value
  });

  // ── Gap detection ───────────────────────────────────────────────────

  it('clears buffer on gap > maxGapMs (reconnection)', () => {
    buffer.pushSample(makeTel({ pitchDeg: 10 }), 1000);
    buffer.pushSample(makeTel({ pitchDeg: 20 }), 1100);
    expect(buffer.bufferDepth).toBe(2);

    // Push with 600ms gap (> default 500ms maxGapMs) → should clear + add new
    buffer.pushSample(makeTel({ pitchDeg: 30 }), 1700);
    expect(buffer.bufferDepth).toBe(1);

    // The only sample is pitch=30
    const result = buffer.sample(1700 + DELAY);
    expect(result.attitude.pitchDeg).toBe(30);
  });

  it('does NOT clear buffer on gap ≤ maxGapMs', () => {
    buffer.pushSample(makeTel({ pitchDeg: 10 }), 1000);
    buffer.pushSample(makeTel({ pitchDeg: 20 }), 1400); // 400ms gap, ≤ 500ms
    expect(buffer.bufferDepth).toBe(2);
  });

  // ── High and low telemetry rates ────────────────────────────────────

  it('handles high telemetry rate (50 Hz = 20ms intervals)', () => {
    // Push 10 samples at 50Hz
    for (let i = 0; i < 10; i++) {
      buffer.pushSample(makeTel({ pitchDeg: i * 2 }), 1000 + i * 20);
    }

    // renderTime = nowMs - DELAY. We want renderTime=1090 (midway in buffer)
    // So nowMs = 1090 + DELAY
    const result = buffer.sample(1090 + DELAY);
    // renderTime = 1090. Samples at 1080 (pitch=8) and 1100 (pitch=10).
    // t = (1090-1080)/(1100-1080) = 0.5 → pitch = 9
    expect(result.attitude.pitchDeg).toBeCloseTo(9, 5);
  });

  it('handles low telemetry rate (2 Hz = 500ms intervals)', () => {
    buffer.pushSample(makeTel({ pitchDeg: 0 }), 1000);
    buffer.pushSample(makeTel({ pitchDeg: 10 }), 1500);

    // renderTime = (1250 + DELAY) - DELAY = 1250 → t = (1250-1000)/(1500-1000) = 0.5
    const result = buffer.sample(1250 + DELAY);
    expect(result.attitude.pitchDeg).toBeCloseTo(5, 5);
  });

  // ── SnapshotProvider interface ──────────────────────────────────────

  it('implements getSnapshot() and getExtrapolatedSnapshot()', () => {
    expect(typeof buffer.getSnapshot).toBe('function');
    expect(typeof buffer.getExtrapolatedSnapshot).toBe('function');
  });

  it('getExtrapolatedSnapshot(nowMs) returns same as sample(nowMs)', () => {
    buffer.pushSample(makeTel({ pitchDeg: 10 }), 1000);
    buffer.pushSample(makeTel({ pitchDeg: 20 }), 1100);

    const nowMs = 1200;
    const fromSample = buffer.sample(nowMs);
    const fromProvider = buffer.getExtrapolatedSnapshot(nowMs);
    expect(fromProvider.attitude.pitchDeg).toBe(fromSample.attitude.pitchDeg);
  });

  // ── Passthrough fields ──────────────────────────────────────────────

  it('passes through vehicleStatus from latest sample (B)', () => {
    const telA = makeTel({ pitchDeg: 0 });
    const telB = makeTel({ pitchDeg: 10 });
    // Modify telB's vehicleStatus
    (telB.vehicleStatus as unknown as Record<string, unknown>).flightMode = 'LOITER';

    buffer.pushSample(telA, 1000);
    buffer.pushSample(telB, 1100);

    // renderTime = midpoint → but vehicleStatus should be from B
    const result = buffer.sample(1050 + DELAY);
    expect(result.vehicleStatus.flightMode).toBe('LOITER');
  });

  // ── Multiple brackets ──────────────────────────────────────────────

  it('finds correct bracket among multiple samples', () => {
    // Push 5 samples: pitch 0, 10, 20, 30, 40 at 100ms intervals
    for (let i = 0; i < 5; i++) {
      buffer.pushSample(makeTel({ pitchDeg: i * 10 }), 1000 + i * 100);
    }

    // renderTime = (1300 + DELAY) - DELAY = 1300 → sample[3].ts=1300 exactly → t=0 → pitch=30
    const result = buffer.sample(1300 + DELAY);
    expect(result.attitude.pitchDeg).toBeCloseTo(30, 5);
  });

  it('interpolates between correct bracket when renderTime is between middle samples', () => {
    for (let i = 0; i < 5; i++) {
      buffer.pushSample(makeTel({ pitchDeg: i * 10 }), 1000 + i * 100);
    }

    // renderTime = (1250 + DELAY) - DELAY = 1250 → between sample[2]=1200 (pitch=20) and sample[3]=1300 (pitch=30)
    // t = (1250-1200)/(1300-1200) = 0.5 → pitch = 25
    const result = buffer.sample(1250 + DELAY);
    expect(result.attitude.pitchDeg).toBeCloseTo(25, 5);
  });

  // ── Ground speed interpolation ──────────────────────────────────────

  it('interpolates ground speed correctly', () => {
    const telA = makeTel({ groundSpeedMs: 5 });
    const telB = makeTel({ groundSpeedMs: 15 });

    buffer.pushSample(telA, 1000);
    buffer.pushSample(telB, 1100);

    // midpoint
    const result = buffer.sample(1050 + DELAY);
    expect(result.velocity.groundSpeedMs).toBeCloseTo(10, 5);
  });

  // ── bufferDepth ─────────────────────────────────────────────────────

  it('reports correct bufferDepth', () => {
    expect(buffer.bufferDepth).toBe(0);
    buffer.pushSample(makeTel(), 1000);
    expect(buffer.bufferDepth).toBe(1);
    buffer.pushSample(makeTel(), 1100);
    expect(buffer.bufferDepth).toBe(2);
  });

  // ── Config defaults ─────────────────────────────────────────────────

  it('uses default config values', () => {
    expect(DEFAULT_PFD_BUFFER_CONFIG.renderDelayMs).toBe(2000);
    expect(DEFAULT_PFD_BUFFER_CONFIG.maxBufferSize).toBe(30);
    expect(DEFAULT_PFD_BUFFER_CONFIG.maxGapMs).toBe(500);
    expect(DEFAULT_PFD_BUFFER_CONFIG.maxEdgeExtrapolationMs).toBe(1000);
  });

  it('accepts partial config overrides', () => {
    const buf = new PFDInterpolationBuffer({ renderDelayMs: 200 });
    const telA = makeTel({ pitchDeg: 0 });
    const telB = makeTel({ pitchDeg: 20 });

    buf.pushSample(telA, 1000);
    buf.pushSample(telB, 1100);

    // With 200ms delay: renderTime = 1250 - 200 = 1050 → t = 0.5
    const result = buf.sample(1250);
    expect(result.attitude.pitchDeg).toBeCloseTo(10, 5);
  });
});
