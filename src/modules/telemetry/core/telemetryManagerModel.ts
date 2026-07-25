import type {
  ControlSurfacesTelemetry,
  MAVServoOutputRaw,
  MAVActuatorOutputStatus,
  MAVRCChannels,
  AttitudeTelemetry,
} from './FlightTelemetryModel';

// ── Status text constants ─────────────────────────────────────────

export const STATUS_TEXT_MAX_MESSAGES = 12;
export const STATUS_TEXT_DEDUP_MS = 15_000;
export const STATUS_TEXT_TTL_MS = 30_000;

// ── Sanity helpers ─────────────────────────────────────────────────

export const safe = (value: number, fallback: number): number =>
  Number.isFinite(value) ? value : fallback;

// ── Servo normalization ────────────────────────────────────────────

export const normalizeServo = (
  raw: MAVServoOutputRaw | undefined,
  prev: ControlSurfacesTelemetry,
): ControlSurfacesTelemetry => {
  if (!raw) {
    return prev;
  }
  const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);
  const bidir = (pwm: number) => clamp((pwm - 1500) / 5, -100, 100);
  const unipolar = (pwm: number) => clamp((pwm - 1000) / 10, 0, 100);
  const isPwmLike = (v: number) => Number.isFinite(v) && v >= 800 && v <= 2200;

  const bank1 = {
    ail: raw.servo1Raw,
    elv: raw.servo2Raw,
    thr: raw.servo3Raw,
    rdr: raw.servo4Raw,
    flp: raw.servo5Raw,
  };
  const bank2 = {
    ail: raw.servo9Raw,
    elv: raw.servo10Raw,
    thr: raw.servo11Raw,
    rdr: raw.servo12Raw,
    flp: raw.servo13Raw,
  };

  const scoreBank = (bank: { ail: number; elv: number; thr: number; rdr: number; flp: number }): number => {
    const values = [bank.ail, bank.elv, bank.thr, bank.rdr, bank.flp];
    const validCount = values.filter(isPwmLike).length;
    const dynamic =
      Math.abs(bank.ail - 1500) +
      Math.abs(bank.elv - 1500) +
      Math.abs(bank.rdr - 1500) +
      Math.abs(bank.thr - 1000) +
      Math.abs(bank.flp - 1000);
    return validCount * 10_000 + dynamic;
  };

  const useBank2 = scoreBank(bank2) > scoreBank(bank1);
  const bank = useBank2 ? bank2 : bank1;

  if (!isPwmLike(bank.ail) || !isPwmLike(bank.elv) || !isPwmLike(bank.rdr)) {
    return prev;
  }

  const nearNeutral = (pwm: number): boolean => Math.abs(pwm - 1500) <= 80;
  const onRail = (pwm: number): boolean => pwm <= 1050 || pwm >= 1950;
  const isolatedRail = (pwm: number, peerA: number, peerB: number): boolean =>
    onRail(pwm) && nearNeutral(peerA) && nearNeutral(peerB);

  const ailPct = isolatedRail(bank.ail, bank.elv, bank.rdr) ? prev.aileronPct : bidir(bank.ail);
  const elvPct = isolatedRail(bank.elv, bank.ail, bank.rdr) ? prev.elevatorPct : bidir(bank.elv);
  const rdrPct = isolatedRail(bank.rdr, bank.ail, bank.elv) ? prev.rudderPct : bidir(bank.rdr);

  return {
    aileronPct:  ailPct,
    elevatorPct: elvPct,
    rudderPct:   rdrPct,
    throttlePct: isPwmLike(bank.thr) ? unipolar(bank.thr) : prev.throttlePct,
    flapsPct:    isPwmLike(bank.flp) ? unipolar(bank.flp) : prev.flapsPct,
  };
};

export const normalizeActuator = (
  raw: MAVActuatorOutputStatus | undefined,
  prev: ControlSurfacesTelemetry,
): ControlSurfacesTelemetry => {
  if (!raw || raw.actuator.length === 0) return prev;

  const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);
  const toPctBidir = (v: number) => {
    if (!Number.isFinite(v)) return null;
    if (v >= -1.2 && v <= 1.2) return clamp(v * 100, -100, 100);
    if (v >= 800 && v <= 2200) return clamp((v - 1500) / 5, -100, 100);
    return null;
  };
  const toPctUni = (v: number) => {
    if (!Number.isFinite(v)) return null;
    if (v >= -1.2 && v <= 1.2) return clamp(((v + 1) / 2) * 100, 0, 100);
    if (v >= 800 && v <= 2200) return clamp((v - 1000) / 10, 0, 100);
    return null;
  };
  const read = (index1: number): number | null => {
    const idx0 = index1 - 1;
    if (idx0 < 0 || idx0 >= raw.actuator.length) return null;
    return Number(raw.actuator[idx0]);
  };

  const ail = toPctBidir(read(1) ?? Number.NaN);
  const elv = toPctBidir(read(2) ?? Number.NaN);
  const thr = toPctUni(read(3) ?? Number.NaN);
  const rdr = toPctBidir(read(4) ?? Number.NaN);
  const flp = toPctUni(read(5) ?? Number.NaN);

  if (ail === null && elv === null && rdr === null && thr === null && flp === null) {
    return prev;
  }

  return {
    aileronPct: ail ?? prev.aileronPct,
    elevatorPct: elv ?? prev.elevatorPct,
    rudderPct: rdr ?? prev.rudderPct,
    throttlePct: thr ?? prev.throttlePct,
    flapsPct: flp ?? prev.flapsPct,
  };
};

export const normalizeRcChannels = (
  raw: MAVRCChannels | undefined,
  prev: ControlSurfacesTelemetry,
): ControlSurfacesTelemetry => {
  if (!raw) return prev;
  const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);
  const bidir = (pwm: number) => clamp((pwm - 1500) / 5, -100, 100);
  const unipolar = (pwm: number) => clamp((pwm - 1000) / 10, 0, 100);
  const isPwmLike = (v: number) => Number.isFinite(v) && v >= 800 && v <= 2200;

  const ail = raw.chan1Raw;
  const elv = raw.chan2Raw;
  const thr = raw.chan3Raw;
  const rdr = raw.chan4Raw;
  const flp = raw.chan6Raw;

  if (!isPwmLike(ail) || !isPwmLike(elv) || !isPwmLike(rdr)) return prev;

  const nearNeutral = (pwm: number): boolean => Math.abs(pwm - 1500) <= 80;
  const onRail = (pwm: number): boolean => pwm <= 1050 || pwm >= 1950;
  const isolatedRail = (pwm: number, peerA: number, peerB: number): boolean =>
    onRail(pwm) && nearNeutral(peerA) && nearNeutral(peerB);

  const ailPct = isolatedRail(ail, elv, rdr) ? prev.aileronPct : bidir(ail);
  const elvPct = isolatedRail(elv, ail, rdr) ? prev.elevatorPct : bidir(elv);
  const rdrPct = isolatedRail(rdr, ail, elv) ? prev.rudderPct : bidir(rdr);

  return {
    aileronPct: ailPct,
    elevatorPct: elvPct,
    rudderPct: rdrPct,
    throttlePct: isPwmLike(thr) ? unipolar(thr) : prev.throttlePct,
    flapsPct: isPwmLike(flp) ? unipolar(flp) : prev.flapsPct,
  };
};

export const hasIsolatedRailInServo = (raw: MAVServoOutputRaw | undefined): boolean => {
  if (!raw) return false;
  const isPwmLike = (v: number) => Number.isFinite(v) && v >= 800 && v <= 2200;
  const nearNeutral = (pwm: number): boolean => Math.abs(pwm - 1500) <= 80;
  const onRail = (pwm: number): boolean => pwm <= 1050 || pwm >= 1950;
  const bank1 = {
    ail: raw.servo1Raw,
    elv: raw.servo2Raw,
    thr: raw.servo3Raw,
    rdr: raw.servo4Raw,
    flp: raw.servo5Raw,
  };
  const bank2 = {
    ail: raw.servo9Raw,
    elv: raw.servo10Raw,
    thr: raw.servo11Raw,
    rdr: raw.servo12Raw,
    flp: raw.servo13Raw,
  };
  const scoreBank = (bank: { ail: number; elv: number; thr: number; rdr: number; flp: number }): number => {
    const values = [bank.ail, bank.elv, bank.thr, bank.rdr, bank.flp];
    const validCount = values.filter(isPwmLike).length;
    const dynamic =
      Math.abs(bank.ail - 1500) +
      Math.abs(bank.elv - 1500) +
      Math.abs(bank.rdr - 1500) +
      Math.abs(bank.thr - 1000) +
      Math.abs(bank.flp - 1000);
    return validCount * 10_000 + dynamic;
  };
  const bank = scoreBank(bank2) > scoreBank(bank1) ? bank2 : bank1;
  if (!isPwmLike(bank.ail) || !isPwmLike(bank.elv) || !isPwmLike(bank.rdr)) return false;
  const isolatedAil = onRail(bank.ail) && nearNeutral(bank.elv) && nearNeutral(bank.rdr);
  const isolatedElv = onRail(bank.elv) && nearNeutral(bank.ail) && nearNeutral(bank.rdr);
  const isolatedRdr = onRail(bank.rdr) && nearNeutral(bank.ail) && nearNeutral(bank.elv);
  return isolatedAil || isolatedElv || isolatedRdr;
};

export const controlActivityScore = (cs: ControlSurfacesTelemetry): number => {
  return (
    Math.abs(cs.aileronPct) +
    Math.abs(cs.elevatorPct) +
    Math.abs(cs.rudderPct) +
    Math.abs(cs.throttlePct) +
    Math.abs(cs.flapsPct)
  );
};

export const normalizeAttitudeToControlSurfaces = (
  attitude: AttitudeTelemetry,
  prev: ControlSurfacesTelemetry,
): ControlSurfacesTelemetry => {
  const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);
  const ail = clamp(attitude.rollDeg * 3.5, -100, 100);
  const elv = clamp(attitude.pitchDeg * 3.5, -100, 100);
  const rdr = clamp(attitude.yawRateDegS * 2.5, -100, 100);
  return {
    aileronPct: Number.isFinite(ail) ? ail : prev.aileronPct,
    elevatorPct: Number.isFinite(elv) ? elv : prev.elevatorPct,
    rudderPct: Number.isFinite(rdr) ? rdr : prev.rudderPct,
    throttlePct: prev.throttlePct,
    flapsPct: prev.flapsPct,
  };
};
