import { describe, it, expect } from 'vitest';
import { InertiaSmoother } from '../InertiaSmoother';
import type { FlightTelemetry } from '../../../telemetry';
import { DEFAULT_FLIGHT_TELEMETRY } from '../../../telemetry';
import type { SnapshotProvider } from '../../hooks/useHUDLoop';

// ── Stub providers ────────────────────────────────────────────────────────

function stubProvider(tel: FlightTelemetry): SnapshotProvider {
  return {
    getSnapshot() { return tel; },
    getExtrapolatedSnapshot(_nowMs: number) { return tel; },
  };
}

function mutableProvider(
  initial: FlightTelemetry,
): SnapshotProvider & { set(t: FlightTelemetry): void } {
  let current = initial;
  return {
    getSnapshot()               { return current; },
    getExtrapolatedSnapshot()   { return current; },
    set(t: FlightTelemetry)     { current = t; },
  };
}

function makeTel(overrides: {
  pitchDeg?: number;
  rollDeg?: number;
  yawDeg?: number;
  headingDeg?: number;
  altitudeMSLm?: number;
  groundSpeedMs?: number;
  verticalSpeedMs?: number;
  airSpeedMs?: number | null;
} = {}): FlightTelemetry {
  return {
    ...DEFAULT_FLIGHT_TELEMETRY,
    attitude: {
      ...DEFAULT_FLIGHT_TELEMETRY.attitude,
      pitchDeg: overrides.pitchDeg ?? 0,
      rollDeg:  overrides.rollDeg  ?? 0,
      yawDeg:   overrides.yawDeg   ?? 0,
    },
    navigation: {
      ...DEFAULT_FLIGHT_TELEMETRY.navigation,
      headingDeg: overrides.headingDeg ?? 0,
    },
    altitude: {
      ...DEFAULT_FLIGHT_TELEMETRY.altitude,
      altitudeMSLm: overrides.altitudeMSLm ?? 100,
    },
    velocity: {
      ...DEFAULT_FLIGHT_TELEMETRY.velocity,
      groundSpeedMs:   overrides.groundSpeedMs   ?? 10,
      verticalSpeedMs: overrides.verticalSpeedMs ?? 0,
      airSpeedMs:      overrides.airSpeedMs !== undefined ? overrides.airSpeedMs : 10,
    },
  } as unknown as FlightTelemetry;
}

// ── Tests ─────────────────────────────────────────────────────────────────

describe('InertiaSmoother', () => {

  // ── Initialization ──────────────────────────────────────────────────

  it('teleports to initial target on first call (no animation from zero)', () => {
    const tel = makeTel({ pitchDeg: 15, rollDeg: -30 });
    const smoother = new InertiaSmoother(stubProvider(tel));

    const result = smoother.getExtrapolatedSnapshot(1000);

    expect(result.attitude.pitchDeg).toBeCloseTo(15, 3);
    expect(result.attitude.rollDeg).toBeCloseTo(-30, 3);
  });

  it('teleports yaw without wrapping artifact on first call', () => {
    const tel = makeTel({ yawDeg: 270 });
    const smoother = new InertiaSmoother(stubProvider(tel));

    const result = smoother.getExtrapolatedSnapshot(1000);
    expect(result.attitude.yawDeg).toBeCloseTo(270, 3);
  });

  // ── Spring approaches target ────────────────────────────────────────

  it('pitch moves toward target after multiple frames', () => {
    const provider = mutableProvider(makeTel({ pitchDeg: 0 }));
    const smoother = new InertiaSmoother(provider, {
      attitude: { tauMs: 50, zeta: 0.7 },
    });

    // Teleport first
    smoother.getExtrapolatedSnapshot(0);

    // Now set target to 20°
    provider.set(makeTel({ pitchDeg: 20 }));

    // After 200ms (4 × 50ms tau) the spring should be > 90% of the way there
    let now = 0;
    let last: Readonly<FlightTelemetry> = DEFAULT_FLIGHT_TELEMETRY;
    while (now < 200) {
      now += 16;
      last = smoother.getExtrapolatedSnapshot(now);
    }

    expect(last.attitude.pitchDeg).toBeGreaterThan(18);
  });

  it('roll converges to target without violent overshoot (zeta=0.7)', () => {
    const provider = mutableProvider(makeTel({ rollDeg: 0 }));
    const smoother = new InertiaSmoother(provider, {
      attitude: { tauMs: 50, zeta: 0.7 },
    });

    smoother.getExtrapolatedSnapshot(0);
    provider.set(makeTel({ rollDeg: 30 }));

    let now = 0;
    let maxSeen = 0;
    while (now < 600) {
      now += 16;
      const snap = smoother.getExtrapolatedSnapshot(now);
      if (snap.attitude.rollDeg > maxSeen) maxSeen = snap.attitude.rollDeg;
    }

    // Slight underdamped overshoot is allowed but must stay < 2× target
    expect(maxSeen).toBeLessThan(60);
    // And eventually settles near target
    const final = smoother.getExtrapolatedSnapshot(now).attitude.rollDeg;
    expect(final).toBeCloseTo(30, 0);
  });

  // ── Momentum carry-through ──────────────────────────────────────────

  it('carries momentum through a target snap (the "corte" scenario)', () => {
    const provider = mutableProvider(makeTel({ pitchDeg: 0 }));
    const smoother = new InertiaSmoother(provider);
    smoother.getExtrapolatedSnapshot(0);

    // Build up momentum by feeding incrementing targets
    for (let i = 1; i <= 10; i++) {
      provider.set(makeTel({ pitchDeg: i * 5 }));
      smoother.getExtrapolatedSnapshot(i * 16);
    }
    // At t=160ms, spring pos is around 30–40° moving upward with velocity
    const beforeSnap = smoother.getExtrapolatedSnapshot(10 * 16).attitude.pitchDeg;
    const velBefore  = (smoother as unknown as { _pitch: { vel: number } })._pitch.vel;

    // Target snaps back to 0° (simulates buffer transition)
    provider.set(makeTel({ pitchDeg: 0 }));
    const afterSnap = smoother.getExtrapolatedSnapshot(11 * 16).attitude.pitchDeg;

    // Display position must NOT snap to 0 — it should continue with inertia
    expect(afterSnap).toBeGreaterThan(beforeSnap * 0.9);
    expect(velBefore).toBeGreaterThan(0); // was moving up before snap
  });

  // ── Angle wrapping ──────────────────────────────────────────────────

  it('yaw follows shortest arc across 0/360 boundary', () => {
    const provider = mutableProvider(makeTel({ yawDeg: 350 }));
    const smoother = new InertiaSmoother(provider, {
      yaw: { tauMs: 60, zeta: 0.8 },
    });
    smoother.getExtrapolatedSnapshot(0);

    // Change target to 10° (crossing zero, short arc = +20°; long arc = -340°)
    provider.set(makeTel({ yawDeg: 10 }));

    let now = 0;
    let last: Readonly<FlightTelemetry> = DEFAULT_FLIGHT_TELEMETRY;
    while (now < 400) {
      now += 16;
      last = smoother.getExtrapolatedSnapshot(now);
    }

    // Should approach 10° going through 360/0, NOT spin backward through 180°
    const yaw = last.attitude.yawDeg;
    const errForward  = Math.abs(((yaw - 10)  + 360) % 360);
    const errBackward = 360 - errForward;
    expect(errForward).toBeLessThan(errBackward);
  });

  it('roll continues forward across +180/-180 instead of returning through 0', () => {
    const provider = mutableProvider(makeTel({ rollDeg: 170 }));
    const smoother = new InertiaSmoother(provider, {
      attitude: { tauMs: 60, zeta: 0.8 },
    });
    smoother.getExtrapolatedSnapshot(0);

    provider.set(makeTel({ rollDeg: -170 }));

    let now = 0;
    let minSeen = 170;
    let last: Readonly<FlightTelemetry> = DEFAULT_FLIGHT_TELEMETRY;
    while (now < 400) {
      now += 16;
      last = smoother.getExtrapolatedSnapshot(now);
      if (last.attitude.rollDeg < minSeen) minSeen = last.attitude.rollDeg;
    }

    expect(minSeen).toBeGreaterThan(160);
    expect(last.attitude.rollDeg).toBeGreaterThan(175);
  });

  // ── Passthrough fields ──────────────────────────────────────────────

  it('passthrough fields are taken from the inner provider unchanged', () => {
    const tel = makeTel({ pitchDeg: 5 });
    const smoother = new InertiaSmoother(stubProvider(tel));

    const result = smoother.getExtrapolatedSnapshot(0);

    expect(result.vehicleStatus).toBe(tel.vehicleStatus);
    expect(result.gpsStatus).toBe(tel.gpsStatus);
    expect(result.battery).toBe(tel.battery);
    expect(result.ekf).toBe(tel.ekf);
  });

  // ── Zero-allocation contract ────────────────────────────────────────

  it('returns the same object reference on repeated calls (zero alloc)', () => {
    const tel = makeTel({ pitchDeg: 5 });
    const smoother = new InertiaSmoother(stubProvider(tel));

    const a = smoother.getExtrapolatedSnapshot(0);
    const b = smoother.getExtrapolatedSnapshot(16);

    expect(a).toBe(b);
  });

  // ── Reset ───────────────────────────────────────────────────────────

  it('teleports to new target after reset (no animation from old state)', () => {
    const provider = mutableProvider(makeTel({ pitchDeg: 45 }));
    const smoother = new InertiaSmoother(provider);
    smoother.getExtrapolatedSnapshot(0);

    // Simulate frames so spring has velocity
    provider.set(makeTel({ pitchDeg: 90 }));
    smoother.getExtrapolatedSnapshot(100);

    // Reset and change target
    smoother.reset();
    provider.set(makeTel({ pitchDeg: -10 }));
    const afterReset = smoother.getExtrapolatedSnapshot(200);

    // Should teleport to new target immediately after reset
    expect(afterReset.attitude.pitchDeg).toBeCloseTo(-10, 3);
  });

  // ── Large dt gap ────────────────────────────────────────────────────

  it('handles very large dt gap without NaN or explosion', () => {
    const provider = mutableProvider(makeTel({ pitchDeg: 5 }));
    const smoother = new InertiaSmoother(provider);
    smoother.getExtrapolatedSnapshot(0);

    provider.set(makeTel({ pitchDeg: 30 }));

    // Simulate a 2-second gap (tab was hidden)
    const result = smoother.getExtrapolatedSnapshot(2000);
    expect(Number.isNaN(result.attitude.pitchDeg)).toBe(false);
    expect(Number.isFinite(result.attitude.pitchDeg)).toBe(true);
  });

  // ── Altitude ────────────────────────────────────────────────────────

  it('altitude approaches target with no overshoot (zeta=1.0)', () => {
    const provider = mutableProvider(makeTel({ altitudeMSLm: 100 }));
    const smoother = new InertiaSmoother(provider);
    smoother.getExtrapolatedSnapshot(0);

    provider.set(makeTel({ altitudeMSLm: 200 }));

    let now = 0;
    let maxSeen = 100;
    while (now < 600) {
      now += 16;
      const snap = smoother.getExtrapolatedSnapshot(now);
      if (snap.altitude.altitudeMSLm > maxSeen) maxSeen = snap.altitude.altitudeMSLm;
    }

    // Critically damped — must not overshoot target
    expect(maxSeen).toBeLessThanOrEqual(200.1);
  });
});
