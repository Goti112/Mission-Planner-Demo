/**
 * SimulationTelemetrySource.ts
 *
 * ════════════════════════════════════════════════════════════════════════
 * SYNTHETIC TELEMETRY SOURCE — FOR DEVELOPMENT & TESTING
 * ════════════════════════════════════════════════════════════════════════
 *
 * Emits TelemetryRawData at a configurable rate (default 20 Hz).
 * All values are in MAVLink raw units — radians, mm, cm/s, mV, cA —
 * exactly as they would arrive from a real ArduPilot / PX4 autopilot.
 * This forces the normalization layer (TelemetryManager) to do real work.
 *
 * ── Simulated flight scenario ────────────────────────────────────────────
 *
 *   - Phase 0 – 10 s  : Takeoff (altitude ramp 0→50 m, pitch +10°)
 *   - Phase 10 – 50 s : Level cruise with mild pitch/roll oscillation
 *   - Phase 50 – 80 s : Banked right turn (roll up to +35°)
 *   - Phase 80 – 100s : Descending approach (altitude 50→10 m, VS −2 m/s)
 *   - Loops continuously for endless development testing
 *
 * ── Noise model ──────────────────────────────────────────────────────────
 *
 * Gaussian white noise is added to each field at a realistic amplitude:
 *
 *   Field           σ (1σ RMS)
 *   ──────────────  ─────────────────────────────────────────────────────
 *   pitch/roll      0.5°  — vibration, air turbulence
 *   groundspeed     0.3 m/s
 *   climbRate       0.2 m/s
 *   altitude        1.0 m
 *   lat/lon         0.5 m (≈ 0.0000045°)
 *
 * This exercises the SmoothingEngine so you can visually validate
 * the EMA filtering in real-time.
 *
 * ── Configuration ────────────────────────────────────────────────────────
 *
 * ```ts
 * const sim = new SimulationTelemetrySource({
 *   rateHz:        20,           // emission frequency
 *   sysId:          1,           // MAVLink system ID
 *   noiseScale:     1.0,         // 0 = no noise, 2 = double noise
 *   homeLatDeg:    28.4567,
 *   homeLonDeg:   -16.3219,
 *   homeAltMSLm:   520,
 * });
 * ```
 *
 * Implements: TelemetrySource via BaseTelemetrySource.
 * No React. No DOM. No side effects outside the timer.
 */

import { BaseTelemetrySource, SourceStatus } from './TelemetrySource';
import type { SourceInfo } from './TelemetrySource';
import type {
  TelemetryRawData,
  MAVAttitude,
  MAVVFRHUD,
  MAVGPSRaw,
  MAVGlobalPosition,
  MAVHeartbeat,
  MAVSysStatus,
  MAVBatteryStatus,
  MAVEKFStatus,
  MAVServoOutputRaw,
} from './FlightTelemetryModel';
import {
  VehicleType,
  FlightMode,

  GPSFixType,
  MAVState,
  EKFStatusFlag,
  degToRad,
} from './FlightTelemetryModel';

// ── Math helpers ──────────────────────────────────────────────────────────

const DEG_TO_RAD = Math.PI / 180;

function gaussian(sigma: number = 1): number {
  // Box-Muller transform for Gaussian white noise
  const u = 1 - Math.random();
  const v = Math.random();
  return sigma * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

// ── Scenario definition ───────────────────────────────────────────────────

interface SimScenarioState {
  /** Phase elapsed time in seconds (resets on loop). */
  t: number;
  /** True altitude AGL in metres. */
  altAGL: number;
  /** Groundspeed in m/s. */
  groundSpeed: number;
  /** Pitch in degrees. */
  pitchDeg: number;
  /** Roll in degrees. */
  rollDeg: number;
  /** Heading in degrees [0, 360). */
  headingDeg: number;
  /** Climb rate in m/s. */
  climbRate: number;
  /** Latitude in decimal degrees. */
  lat: number;
  /** Longitude in decimal degrees. */
  lon: number;
  /** Battery remaining 0–100. */
  batteryPct: number;
  /** Arm state. */
  armed: boolean;
  /** Current flight mode string. */
  mode: string;
  /**
   * Simulated NAV_CONTROLLER_OUTPUT.wp_dist in metres.
   * Distance to the next active waypoint. 0 when no active navigation.
   */
  wpDist: number;
}

// ── Configuration ─────────────────────────────────────────────────────────

export interface SimulationConfig {
  /** Data emission frequency. Default: 20 Hz. */
  rateHz?: number;
  /** MAVLink system ID. Default: 1. */
  sysId?: number;
  /** Multiplier for noise amplitude. 0 = silent, 2 = double. Default: 1. */
  noiseScale?: number;
  /** Home latitude in decimal degrees. Default: 28.4567. */
  homeLatDeg?: number;
  /** Home longitude in decimal degrees. Default: -16.3219. */
  homeLonDeg?: number;
  /** Home altitude MSL in metres. Default: 520. */
  homeAltMSLm?: number;
  /** Initial battery capacity in mAh (purely for simulation). Default: 6000. */
  batteryCapacityMah?: number;
}

// ── Mission override — external state pushed by DroneMissionController ─────

/**
 * When a real mission is running, DroneMissionController pushes this state
 * into the SimulationTelemetrySource. The source bypasses its internal
 * scenario phases and emits MAVLink packets derived from this state instead.
 *
 * This ensures ONE data path:
 *   MissionController → SimSource (override) → MAVLink → TelemetryManager
 *     → DroneStateManager → droneStore → 3D / Map / PFD
 */
export interface MissionOverrideState {
  lat: number;
  lon: number;
  altAGL: number;
  headingDeg: number;
  groundSpeed: number;
  climbRate: number;
  pitchDeg: number;
  rollDeg: number;
  armed: boolean;
  mode: string;
  wpDist: number;
}

// ── Scenario time-points ──────────────────────────────────────────────────

const PHASE_TAKEOFF_END   = 10;   // s
const PHASE_CRUISE_END    = 50;   // s
const PHASE_TURN_END      = 80;   // s
const PHASE_APPROACH_END  = 100;  // s

export class SimulationTelemetrySource extends BaseTelemetrySource {
  readonly info: SourceInfo = {
    name:        'Simulation',
    transport:   'simulation',
    description: 'Synthetic MAVLink-format telemetry for development',
  };

  // ── Config ───────────────────────────────────────────────────────────

  private readonly _rateHz:       number;
  private readonly _intervalMs:   number;
  private readonly _sysId:        number;
  private readonly _noise:        number;
  private readonly _homeLat:      number;
  private readonly _homeLon:      number;
  private readonly _homeAltMSL:   number;
  private readonly _battCapMah:   number;

  // ── Internal state ───────────────────────────────────────────────────

  private _timer:       ReturnType<typeof setInterval> | null = null;
  private _scenario:    SimScenarioState;
  private _startTime:   number = 0;
  /** True after HOME_POSITION has been emitted for the current arm cycle. */
  private _homeEmitted: boolean = false;
  /** When non-null, mission controller drives scenario state. */
  private _missionOverride: MissionOverrideState | null = null;
  /**
   * When false (default) the source emits a STATIC heartbeat at home
   * position — no position drift, no speed, disarmed. This is the correct
   * state for a grounded idle drone.
   *
   * Set true only to run the internal demo flight scenario.
   * This flag is ignored when _missionOverride is active.
   */
  private _isDemoEnabled: boolean = false;
  /**
   * Commanded arm state for idle/manual simulation.
   * Mission override and demo scenario can still own their own armed state.
   */
  private _commandedArmState: boolean = false;

  constructor(cfg: SimulationConfig = {}) {
    super();
    this._rateHz      = cfg.rateHz           ?? 20;
    this._intervalMs  = 1000 / this._rateHz;
    this._sysId       = cfg.sysId            ?? 1;
    this._noise       = cfg.noiseScale       ?? 1;
    this._homeLat     = cfg.homeLatDeg       ?? 28.4567;
    this._homeLon     = cfg.homeLonDeg       ?? -16.3219;
    this._homeAltMSL  = cfg.homeAltMSLm      ?? 520;
    this._battCapMah  = cfg.batteryCapacityMah ?? 6000;

    this._scenario = this._initialState();
  }

  // ── Lifecycle ────────────────────────────────────────────────────────

  start(): void {
    if (this.status === SourceStatus.ACTIVE) return;

    // ── Cleanup guarantee: kill any stale timer before creating a new one ──
    if (this._timer !== null) {
      clearInterval(this._timer);
      this._timer = null;
    }

    this._scenario  = this._initialState();
    this._startTime = performance.now();
    this._setStatus(SourceStatus.CONNECTING);

    // Brief simulated "connecting" delay (50 ms), then begin emitting
    setTimeout(() => {
      // Guard: stop() may have been called during the 50 ms delay
      if (this.status === SourceStatus.STOPPED || this.status === SourceStatus.IDLE) return;
      this._setStatus(SourceStatus.ACTIVE);
      this._timer = setInterval(() => this._tick(), this._intervalMs);
    }, 50);
  }

  stop(): void {
    if (this.status === SourceStatus.STOPPED || this.status === SourceStatus.IDLE) return;

    if (this._timer !== null) {
      clearInterval(this._timer);
      this._timer = null;
    }
    this._homeEmitted = false;
    this._setStatus(SourceStatus.STOPPED);
  }

  // ── Mission override API ─────────────────────────────────────────────

  /**
   * Enable mission override — the internal scenario is bypassed.
   * DroneMissionController calls this every tick with the navigator's state.
   */
  setMissionOverride(state: MissionOverrideState): void {
    this._missionOverride = state;
  }

  /**
   * Disable mission override — return to internal demo scenario.
   * Call when mission completes or is aborted (pass final hover state first
   * if you want the drone to stay in place).
   */
  clearMissionOverride(): void {
    this._missionOverride = null;
  }

  /** True when external mission state is driving the source. */
  get hasMissionOverride(): boolean {
    return this._missionOverride !== null;
  }

  // ── Demo scenario API ────────────────────────────────────────────────

  /**
   * Enable the internal demo flight scenario (takeoff → cruise → turn →
   * descent loop). Should only be called for testing / demo purposes.
   * Has no effect when mission override is active.
   */
  enableDemoScenario(): void {
    this._isDemoEnabled = true;
    // Reset scenario so it starts from the beginning
    this._scenario = this._initialState();
    this._startTime = performance.now();
  }

  /**
   * Disable the demo scenario — source returns to IDLE (static position).
   * Call this before activating mission override, or when returning to
   * ground idle state.
   */
  disableDemoScenario(): void {
    this._isDemoEnabled = false;
  }

  /** True when the internal demo scenario is running. */
  get isDemoEnabled(): boolean {
    return this._isDemoEnabled;
  }

  /**
   * Reset the simulated battery to full charge (100 %).
   *
   * Call this when starting a new simulation mission so each run begins
   * with a fresh battery rather than inheriting the depleted state from
   * a previous mission.
   */
  resetBattery(): void {
    this._scenario.batteryPct = 100;
  }

  /**
   * Set the command-controlled arm state for simulation.
   *
   * Mission override owns arm state while an active mission is driving the
   * source, so direct simulation ARM/DISARM commands are rejected there.
   */
  setArmState(armed: boolean): void {
    if (this._missionOverride !== null) {
      throw new Error('Cannot change simulation arm state while mission override is active');
    }

    this._commandedArmState = armed;

    if (!armed) {
      this._isDemoEnabled = false;
      this._homeEmitted = false;
    }
  }

  // ── Tick ─────────────────────────────────────────────────────────────

  private _tick(): void {
    const wallMs = performance.now();
    const totalT = (wallMs - this._startTime) / 1000;   // seconds since start

    // Loop the scenario every PHASE_APPROACH_END seconds
    this._scenario.t = totalT % PHASE_APPROACH_END;
    this._advanceScenario(this._scenario.t, 1 / this._rateHz);

    this._emit(this._buildRawPacket(wallMs));
  }

  // ── Scenario advancement ─────────────────────────────────────────────

  private _advanceScenario(t: number, dt: number): void {
    const s = this._scenario;

    // ═══════════════════════════════════════════════════════════════════
    // PRIORITY 1: MISSION OVERRIDE
    // DroneMissionController provides absolute state each tick.
    // Bypasses both IDLE and demo scenario completely.
    // ═══════════════════════════════════════════════════════════════════
    if (this._missionOverride) {
      const ovr = this._missionOverride;
      s.lat         = ovr.lat;
      s.lon         = ovr.lon;
      s.altAGL      = ovr.altAGL;
      s.headingDeg  = ovr.headingDeg;
      s.groundSpeed = ovr.groundSpeed;
      s.climbRate   = ovr.climbRate;
      s.pitchDeg    = ovr.pitchDeg;
      s.rollDeg     = ovr.rollDeg;
      s.armed       = ovr.armed;
      s.mode        = ovr.mode;
      s.wpDist      = ovr.wpDist;
      // Battery drain still applies in mission mode
      const drainPctPerS = (10 / (this._battCapMah / 1000)) / 3600 * 100;
      s.batteryPct = Math.max(0, s.batteryPct - drainPctPerS * dt);
      return; // skip IDLE + demo scenario
    }

    // ═══════════════════════════════════════════════════════════════════
    // PRIORITY 2: IDLE MODE (default)
    // Drone is grounded / waiting. Emit static state at home position.
    // No position integration, no speed, disarmed.
    // ═══════════════════════════════════════════════════════════════════
    if (!this._isDemoEnabled) {
      s.lat         = this._homeLat;
      s.lon         = this._homeLon;
      s.altAGL      = 0;
      s.groundSpeed = 0;
      s.climbRate   = 0;
      s.pitchDeg    = 0;
      s.rollDeg     = 0;
      // s.headingDeg preserved as-is (compass keeps last value)
      s.armed       = this._commandedArmState;
      s.mode        = FlightMode.STABILIZE;
      s.wpDist      = 0;
      // No battery drain while idle on the ground
      return;
    }

    // ═══════════════════════════════════════════════════════════════════
    // PRIORITY 3: INTERNAL DEMO SCENARIO (opt-in, for testing only)
    // Only runs when enableDemoScenario() has been explicitly called.
    // ═══════════════════════════════════════════════════════════════════
    const n = this._noise;

    if (t < PHASE_TAKEOFF_END) {
      // ── Takeoff phase ──────────────────────────────────────────────
      const progress = t / PHASE_TAKEOFF_END;
      s.altAGL     = progress * 50;
      s.climbRate  = 5.0 + gaussian(0.2 * n);
      s.pitchDeg   = 10 + gaussian(0.5 * n);
      s.rollDeg    = gaussian(1.0 * n);
      s.groundSpeed = 3 + progress * 9 + gaussian(0.3 * n);
      s.headingDeg = 90;
      s.armed      = true;
      s.mode       = FlightMode.TAKEOFF;
      // wp_dist = remaining altitude to reach the takeoff altitude WP
      s.wpDist     = Math.max(0, 50 - s.altAGL);

    } else if (t < PHASE_CRUISE_END) {
      // ── Cruise phase — gentle sinusoidal turbulence ─────────────────
      const tc = t - PHASE_TAKEOFF_END;
      s.altAGL      = 50 + Math.sin(tc * 0.1) * 3 + gaussian(1.0 * n);
      s.climbRate   = Math.cos(tc * 0.1) * 0.3 + gaussian(0.2 * n);
      s.pitchDeg    = 2 + Math.sin(tc * 0.3) * 88 + gaussian(0.5 * n); // Reaches ~90°
      s.rollDeg     = Math.sin(tc * 0.2) * 5 + gaussian(1.0 * n);
      s.groundSpeed = 12 + Math.sin(tc * 0.15) * 1.5 + gaussian(0.3 * n);
      s.headingDeg  = (90 + tc * 0.5) % 360;
      s.armed       = true;
      s.mode        = FlightMode.AUTO;
      // Simulate 3 waypoints of 160 m each (covers ~40 s at 12 m/s = 480 m total)
      const LEG_S = 40 / 3;  // ~13.3 s per leg
      const legProgress = (tc % LEG_S) / LEG_S;
      s.wpDist = Math.max(0, 160 * (1 - legProgress));

    } else if (t < PHASE_TURN_END) {
      // ── Banked right turn ───────────────────────────────────────────
      const tt = t - PHASE_CRUISE_END;
      const turnProgress = tt / (PHASE_TURN_END - PHASE_CRUISE_END);
      s.altAGL      = 50 + gaussian(1.0 * n);
      s.climbRate   = gaussian(0.15 * n);
      s.pitchDeg    = 3 + gaussian(0.5 * n);
      s.rollDeg     = Math.sin(turnProgress * Math.PI) * 90 + gaussian(1.0 * n);
      s.groundSpeed = 12 + gaussian(0.3 * n);
      // Turn rate proportional to bank angle (simplified coordinated turn)
      const bankRad    = Math.min(1.5, s.rollDeg * DEG_TO_RAD); // Cap tan for sanity
      const turnRateDegS = (9.81 * Math.tan(bankRad)) / (s.groundSpeed || 1) * (180 / Math.PI);
      s.headingDeg  = (s.headingDeg + turnRateDegS * dt + 360) % 360;
      s.armed       = true;
      s.mode        = FlightMode.GUIDED;
      // Counting down 180 m WP at the end of the turn (at ~12 m/s over 30 s = ~180 m)
      s.wpDist      = Math.max(0, 180 - tt * (12 * 30 / 180));
    } else {
      // ── Descending approach ─────────────────────────────────────────
      const ta = t - PHASE_TURN_END;
      const descProgress = ta / (PHASE_APPROACH_END - PHASE_TURN_END);
      s.altAGL      = Math.max(2, 50 - descProgress * 40) + gaussian(0.8 * n);
      s.climbRate   = -2.0 + gaussian(0.2 * n);
      s.pitchDeg    = -3 + gaussian(0.5 * n);
      s.rollDeg     = gaussian(1.0 * n);
      s.groundSpeed = Math.max(3, 12 - descProgress * 6) + gaussian(0.3 * n);
      s.headingDeg  = (s.headingDeg + 0.2 + 360) % 360;
      s.armed       = true;
      s.mode        = FlightMode.LAND;      // wp_dist counts down proportional to remaining altitude (LAND WP is on the ground)
      s.wpDist      = Math.max(0, s.altAGL * 4);    }

    // ── Integrate position (great-circle approximation) ────────────
    // dx (east) = vE × dt / R_earth → Δlon
    // dy (north) = vN × dt / R_earth → Δlat
    const headRad  = s.headingDeg * DEG_TO_RAD;
    const speed    = s.groundSpeed;
    const R_EARTH  = 6_371_000;
    const dNorth   = speed * Math.cos(headRad) * dt;
    const dEast    = speed * Math.sin(headRad) * dt;
    s.lat += (dNorth / R_EARTH) * (180 / Math.PI);
    s.lon += (dEast  / R_EARTH) * (180 / Math.PI) / Math.cos(s.lat * DEG_TO_RAD);

    // ── Battery drain ──────────────────────────────────────────────
    // 10 A average consumption → drains from 100% over ~(capacity/10 Ah)
    const drainPctPerS = (10 / (this._battCapMah / 1000)) / 3600 * 100;
    s.batteryPct = Math.max(0, s.batteryPct - drainPctPerS * dt);
  }

  // ── Packet builder ───────────────────────────────────────────────────
  // Converts the clean scenario state to MAVLink-unit raw fields.

  private _buildRawPacket(wallMs: number): TelemetryRawData {
    const s    = this._scenario;
    const altMSLm = this._homeAltMSL + s.altAGL;

    // ── ATTITUDE (radians) ─────────────────────────────────────────────
    const attitude: MAVAttitude = {
      timeBootMs:  wallMs,
      roll:        degToRad(s.rollDeg),
      pitch:       degToRad(s.pitchDeg),
      yaw:         degToRad(s.headingDeg > 180 ? s.headingDeg - 360 : s.headingDeg),  // MAVLink yaw: [-π, π]
      rollSpeed:   degToRad(gaussian(0.5 * this._noise)),
      pitchSpeed:  degToRad(gaussian(0.3 * this._noise)),
      yawSpeed:    degToRad(gaussian(0.2 * this._noise)),
    };

    // ── VFR_HUD (m/s, m, %, degrees) ──────────────────────────────────
    const vfrHud: MAVVFRHUD = {
      groundspeed: Math.max(0, s.groundSpeed),
      airspeed:    Math.max(0, s.groundSpeed + gaussian(0.5 * this._noise)),  // +wind noise
      heading:     Math.round(s.headingDeg),
      throttle:    Math.min(100, Math.max(0, 50 + s.pitchDeg * 2)),
      alt:         altMSLm,
      climbRate:   s.climbRate,
    };

    // ── GPS_RAW_INT (×1e7 lat/lon, mm alt) ────────────────────────────
    const gpsRaw: MAVGPSRaw = {
      timeUsec:          wallMs * 1000,
      fixType:           GPSFixType.FIX_3D,
      lat:               Math.round(s.lat * 1e7),
      lon:               Math.round(s.lon * 1e7),
      alt:               Math.round(altMSLm * 1000),         // mm
      eph:               120,                                   // 1.2 m HDOP (×100)
      epv:               200,                                   // 2.0 m VDOP (×100)
      vel:               Math.round(s.groundSpeed * 100),      // cm/s
      cog:               Math.round(s.headingDeg * 100),       // centidegrees
      satellitesVisible: 14,
    };

    // ── GLOBAL_POSITION_INT (×1e7, mm, cm/s) ──────────────────────────
    const headRad = s.headingDeg * DEG_TO_RAD;
    const globalPosition: MAVGlobalPosition = {
      timeBootMs:   wallMs,
      lat:          Math.round(s.lat * 1e7),
      lon:          Math.round(s.lon * 1e7),
      alt:          Math.round(altMSLm * 1000),             // mm
      relativeAlt:  Math.round(s.altAGL * 1000),            // mm AGL
      vx:           Math.round(s.groundSpeed * Math.cos(headRad) * 100),  // cm/s North
      vy:           Math.round(s.groundSpeed * Math.sin(headRad) * 100),  // cm/s East
      vz:           Math.round(-s.climbRate * 100),          // cm/s Down (NED: positive = down)
      hdg:          Math.round(s.headingDeg * 100),          // centidegrees
    };

    // ── HEARTBEAT ─────────────────────────────────────────────────────
    const baseMode = s.armed ? 0x80 | 0x04 : 0x04;   // bit7 = armed, bit2 = auto mode
    const heartbeat: MAVHeartbeat = {
      type:           VehicleType.QUADROTOR,
      autopilot:      3,                // ArduPilot
      baseMode,
      customMode:     this._modeToCustomMode(s.mode),
      systemStatus:   s.armed ? MAVState.ACTIVE : MAVState.STANDBY,
      mavlinkVersion: 3,
    };

    // ── SYS_STATUS (mV, cA) ────────────────────────────────────────────
    const voltageV    = 16.8 - (1 - s.batteryPct / 100) * 4.2;  // 4S LiPo curve
    const currentA    = 10 + gaussian(1 * this._noise);           // ~10 A
    const sysStatus: MAVSysStatus = {
      voltageBattery:                 Math.round(voltageV * 1000),  // mV
      currentBattery:                 Math.round(currentA * 100),   // cA
      batteryRemaining:               Math.round(s.batteryPct),
      load:                           350,   // 35% CPU load
      errorsComm:                     0,
      onboardControlSensorsPresent:   0xFFFFFFFF,
      onboardControlSensorsEnabled:   0xFFFFFFFF,
      onboardControlSensorsHealth:    0xFFFFFFFF,
    };

    // ── BATTERY_STATUS ────────────────────────────────────────────────
    const batteryStatus: MAVBatteryStatus = {
      id:                 0,
      temperature:        3500,                                     // 35°C in centi-degrees
      voltages:           [Math.round(voltageV / 4 * 1000)],       // per-cell mV (1 cell reported)
      currentBattery:     Math.round(currentA * 100),              // cA
      currentConsumed:    Math.round((100 - s.batteryPct) / 100 * this._battCapMah),  // mAh
      energyConsumed:     -1,
      batteryRemaining:   Math.round(s.batteryPct),
    };

    // ── EKF_STATUS_REPORT ─────────────────────────────────────────────
    // All EKF flags healthy in simulation
    const ekfFlags =
      EKFStatusFlag.ATTITUDE         |
      EKFStatusFlag.VELOCITY_HORIZ   |
      EKFStatusFlag.VELOCITY_VERT    |
      EKFStatusFlag.POS_HORIZ_REL    |
      EKFStatusFlag.POS_HORIZ_ABS    |
      EKFStatusFlag.POS_VERT_ABS     |
      EKFStatusFlag.PRED_POS_HORIZ_ABS;
    const ekfStatus: MAVEKFStatus = {
      flags:             ekfFlags,
      velocityVariance:  0.01,
      posHorizVariance:  0.08,
      posVertVariance:   0.05,
      compassVariance:   0.02,
      terrainAltVariance: 0,
    };

    // ── NAV_CONTROLLER_OUTPUT ─────────────────────────────────────────────
    // Emitted only while armed (matches real ArduPilot behaviour).
    const navController = s.armed
      ? {
          wp_dist:          Math.round(s.wpDist),
          nav_bearing:      Math.round(s.headingDeg),
          crosstrack_error: gaussian(1.5 * this._noise),
          alt_error:        gaussian(2.0 * this._noise),
          aspd_error:       gaussian(0.5 * this._noise),
          xtrack_error:     gaussian(1.0 * this._noise),
        }
      : undefined;

    // ── SERVO_OUTPUT_RAW ──────────────────────────────────────────────
    // Derived from actual simulation state — mirrors what an autopilot would output.
    //
    // Channel mapping (ArduPlane):
    //   ch1 = AIL   (bidirectional, neutral 1500)
    //   ch2 = ELV   (bidirectional, neutral 1500)
    //   ch3 = THR   (unipolar, 0% = 1000, 100% = 2000)
    //   ch4 = RDR   (bidirectional, neutral 1500)
    //   ch5 = FLAPS (unipolar, retracted = 1000, full = 2000)
    //
    // Gains chosen to match typical ArduPlane output ranges:
    //   AIL: ±400 PWM at ±50° bank  (saturates at ±80%)
    //   ELV: ±400 PWM at ±33° pitch (saturates at ±80%)
    //   RDR: ±200 PWM coordinated with roll (saturates at ±40%)
    //   THR: directly from vfrHud.throttle
    //   FLAPS: mode-dependent (TAKEOFF=50%, LAND=100%, else 0%)
    const clamp = (v: number, lo: number, hi: number) => v < lo ? lo : v > hi ? hi : v;

    const ailPwmDelta  = clamp(Math.round(s.rollDeg  *  8), -400, 400);
    const elvPwmDelta  = clamp(Math.round(s.pitchDeg * 12), -400, 400);
    const rdrPwmDelta  = clamp(Math.round(s.rollDeg  *  3), -200, 200);
    const thrPwm       = 1000 + clamp(Math.round(vfrHud.throttle * 10), 0, 1000);

    let flapsPwm = 1000; // retracted
    if (s.mode === FlightMode.TAKEOFF) {
      flapsPwm = 1500;   // 50% — takeoff flaps
    } else if (s.mode === FlightMode.LAND || (s.altAGL < 20 && s.armed)) {
      flapsPwm = 2000;   // 100% — full flaps on approach / landing
    }

    const servoOutput: MAVServoOutputRaw = {
      timeUsec:  Math.round(wallMs * 1000),
      port:      0,
      servo1Raw: 1500 + ailPwmDelta,
      servo2Raw: 1500 + elvPwmDelta,
      servo3Raw: thrPwm,
      servo4Raw: 1500 + rdrPwmDelta,
      servo5Raw: flapsPwm,
      servo6Raw: 0,
      servo7Raw: 0,
      servo8Raw: 0,
      servo9Raw: 0,
      servo10Raw: 0,
      servo11Raw: 0,
      servo12Raw: 0,
      servo13Raw: 0,
      servo14Raw: 0,
      servo15Raw: 0,
      servo16Raw: 0,
    };

    // ── HOME_POSITION ─────────────────────────────────────────────────
    // Emitted exactly once per arm cycle, on the tick when armed becomes true,
    // mirroring real ArduPilot HOME_POSITION behaviour.
    let homePosition: { latitude: number; longitude: number; altitude: number } | undefined;
    if (s.armed && !this._homeEmitted) {
      this._homeEmitted = true;
      homePosition = {
        latitude:  Math.round(this._homeLat * 1e7),    // ×1e7 MAVLink units
        longitude: Math.round(this._homeLon * 1e7),
        altitude:  Math.round(this._homeAltMSL * 1000), // mm
      };
    } else if (!s.armed) {
      // Reset flag so HOME_POSITION is re-emitted on the next arm event.
      this._homeEmitted = false;
    }

    return {
      capturedAt:     Date.now(),
      sysId:          this._sysId,
      compId:         1,
      attitude,
      vfrHud,
      gpsRaw,
      globalPosition,
      heartbeat,
      sysStatus,
      batteryStatus,
      ekfStatus,
      navController,
      homePosition,
      servoOutput,
    };
  }

  // ── Initial state ────────────────────────────────────────────────────

  private _initialState(): SimScenarioState {
    return {
      t:            0,
      altAGL:       0,
      groundSpeed:  0,
      pitchDeg:     0,
      rollDeg:      0,
      headingDeg:   90,
      climbRate:    0,
      lat:          this._homeLat,
      lon:          this._homeLon,
      batteryPct:   100,
      armed:        false,
      mode:         FlightMode.STABILIZE,
      wpDist:       0,
    };
  }

  // ── Mode code helper ─────────────────────────────────────────────────
  // ArduCopter custom_mode codes (abbreviated, good for simulation display)

  private _modeToCustomMode(mode: string): number {
    const MAP: Record<string, number> = {
      [FlightMode.STABILIZE]: 0,
      [FlightMode.ACRO]:      1,
      [FlightMode.ALT_HOLD]:  2,
      [FlightMode.AUTO]:      3,
      [FlightMode.GUIDED]:    4,
      [FlightMode.LOITER]:    5,
      [FlightMode.RTL]:       6,
      [FlightMode.CIRCLE]:    7,
      [FlightMode.LAND]:      9,
      [FlightMode.TAKEOFF]:   25,
    };
    return MAP[mode] ?? 0;
  }
}
