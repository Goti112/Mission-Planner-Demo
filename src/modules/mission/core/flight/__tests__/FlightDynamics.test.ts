import { describe, it, expect } from 'vitest';
import { FlightDynamics } from '../FlightDynamics';

describe('FlightDynamics — rate limits y configuración default', () => {
  it('roll no supera maxRollDeg aunque yaw rate sea muy alto', () => {
    const fd = new FlightDynamics(0);
    const dt = 0.016; // ~60fps
    let result = { rollDeg: 0, pitchDeg: 0, yawDeg: 0 };
    let yaw = 0;
    for (let i = 0; i < 100; i++) {
      yaw += 90 * dt; // ~56°/s yaw rate
      result = fd.update(dt, yaw, 0);
    }
    expect(Math.abs(result.rollDeg)).toBeLessThanOrEqual(35 + 0.001);
  });

  it('roll converge más rápido con maxRollRateDegPerSec=150 que con 120', () => {
    const fd120 = new FlightDynamics(0, { maxRollRateDegPerSec: 120 });
    const fd150 = new FlightDynamics(0, { maxRollRateDegPerSec: 150 });

    const dt = 0.016;
    let roll120 = 0;
    let roll150 = 0;
    for (let i = 0; i < 10; i++) {
      // High yaw rate so targetRoll hits maxRoll (35°) immediately
      roll120 = fd120.update(dt, 5000 * dt * (i + 1), 0).rollDeg;
      roll150 = fd150.update(dt, 5000 * dt * (i + 1), 0).rollDeg;
    }
    expect(Math.abs(roll150)).toBeGreaterThanOrEqual(Math.abs(roll120));
  });

  it('DEFAULT_CONFIG usa maxRollRateDegPerSec=150 (step máximo ≈ 2.4°/frame)', () => {
    const fd = new FlightDynamics(0);
    // First frame: huge yaw delta → targetRoll clamped to 35°, roll advances by maxRate*dt
    // With 150°/s: max step = 150 * 0.016 = 2.4°
    // With 120°/s: max step = 120 * 0.016 = 1.92°
    const result = fd.update(0.016, 100, 0);
    expect(result.rollDeg).toBeCloseTo(2.4, 1);
  });

  it('pitch converge más rápido con maxPitchRateDegPerSec=80 que con 60', () => {
    const fd60 = new FlightDynamics(0, { maxPitchRateDegPerSec: 60 });
    const fd80 = new FlightDynamics(0, { maxPitchRateDegPerSec: 80 });

    const dt = 0.016;
    let pitch60 = 0;
    let pitch80 = 0;
    for (let i = 0; i < 5; i++) {
      pitch60 = fd60.update(dt, 0, 5).pitchDeg; // 5 m/s climb → target 15° (max)
      pitch80 = fd80.update(dt, 0, 5).pitchDeg;
    }
    expect(Math.abs(pitch80)).toBeGreaterThanOrEqual(Math.abs(pitch60));
  });
});
