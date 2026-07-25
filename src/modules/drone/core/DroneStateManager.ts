/**
 * DroneStateManager.ts
 *
 * ════════════════════════════════════════════════════════════════════════
 * PER-DRONE TELEMETRY ISOLATION — the single source of truth
 * ════════════════════════════════════════════════════════════════════════
 *
 * Architecture:
 *
 *   For each registered drone:
 *     SimulationTelemetrySource (per-drone, home = drone's store position)
 *       ↓ MAVLink-unit raw packets
 *     TelemetryManager (per-drone pipeline)
 *       ↓ normalized FlightTelemetry
 *     droneStore.updateDrone() ← position, attitude, velocity synced back
 *       ↓
 *     All UI consumers read from droneStore + per-drone TelemetryManager
 *
 *   Selected drone:
 *     PFD          → reads from getSelectedManager().getSnapshot()
 *     Panel        → reads from selectedDrone's NormalizedTelemetry
 *     3D Model     → reads from droneStore (fed by telemetry)
 *     2D Map       → reads from droneStore (fed by telemetry)
 *
 * Design:
 *   • Zero React — pure TypeScript singleton
 *   • Drone registration/unregistration is explicit
 *   • selectedDroneId drives PFD/panel binding
 *   • Telemetry output auto-syncs to droneStore for 3D/map
 *   • No global telemetry state
 *
 * @author  GCS Engineering
 */

import {
  DEFAULT_FLIGHT_TELEMETRY,
  FlightMode,
  SimulationTelemetrySource,
  TelemetryInterpolator,
  TelemetryManager,
} from '../../telemetry';
import type {
  FlightTelemetry,
  MissionOverrideState,
} from '../../telemetry';
import { useFlightRecorderStore } from '../../../modules/replay/store';
import { useMissionStore } from '../../mission/store/missionStore';
import { useDroneStore } from '../store/droneStore';
import type { DroneMode } from '../types/drone';
import { missionStateController } from '../../mission/core/MissionStateController';

// ── DroneMovementMode — per-drone movement authority ─────────────────────

/**
 * Defines which controller (if any) is allowed to move a drone.
 *
 * IDLE    — drone is grounded; SimSource emits static telemetry.
 *           No controller may move this drone.
 * MISSION — DroneMissionController owns movement for this drone.
 *           SimSource emits from mission override state.
 * MANUAL  — Reserved for future joystick / RC control.
 *           SimSource emits from manual control input.
 * DEMO    — Internal SimSource demo scenario (test/dev only).
 *           No mission controller involvement.
 *
 * Implemented as a `const` object + type union rather than an `enum` so that
 * the declaration is fully erasable at compile time (`erasableSyntaxOnly: true`).
 */
export const DroneMovementMode = {
  IDLE:    'IDLE',
  MISSION: 'MISSION',
  MANUAL:  'MANUAL',
  DEMO:    'DEMO',
} as const;

export type DroneMovementMode = typeof DroneMovementMode[keyof typeof DroneMovementMode];

// ── NormalizedDroneState — the single source of position/attitude/velocity ──

/**
 * NormalizedDroneState — per-drone unified state.
 *
 * Every UI consumer (PFD, panel, 3D model, map) must derive its
 * display values from this object. No component may maintain its
 * own altitude, yaw, or position state.
 */
export interface NormalizedDroneState {
  droneId: string;
  position: { lat: number; lon: number; alt: number };
  attitude: { roll: number; pitch: number; yaw: number };
  velocity: { vx: number; vy: number; vz: number };
}

// ── Per-drone internal entry ──────────────────────────────────────────────

interface DroneEntry {
  source:       SimulationTelemetrySource;
  manager:      TelemetryManager;
  interpolator: TelemetryInterpolator;
  unsubs:       (() => void)[];
  /** Latest normalized state derived from telemetry output. */
  state:        NormalizedDroneState;
}

// ── Listener types ────────────────────────────────────────────────────────

type SelectionChangeCallback = (droneId: string | null) => void;
type Unsubscribe = () => void;

// ── Manager ───────────────────────────────────────────────────────────────

export class DroneStateManager {
  private _drones: Map<string, DroneEntry> = new Map();
  private _selectedId: string | null = null;
  private _selectionListeners: Set<SelectionChangeCallback> = new Set();
  private _destroyed = false;
  /** Per-drone movement mode — IDLE by default. */
  private _movementModes: Map<string, DroneMovementMode> = new Map();
  /** Original home position captured at registerDrone time.
   * Used by swapToSimulation to restore the sim home position regardless
   * of where the real drone's telemetry moved the droneStore position.
   */
  private _homePositions: Map<string, { lat: number; lon: number; altMSL: number }> = new Map();

  // ── Registration ──────────────────────────────────────────────────────

  /**
   * Register a drone — creates an isolated SimulationTelemetrySource +
   * TelemetryManager pipeline scoped to this droneId.
   *
   * @param droneId  Unique drone identifier (must match droneStore key)
   * @param homeLat  Home latitude in decimal degrees
   * @param homeLon  Home longitude in decimal degrees
   * @param homeAltMSL  Home altitude MSL in metres
   */
  registerDrone(
    droneId: string,
    homeLat: number,
    homeLon: number,
    homeAltMSL: number,
  ): void {
    if (this._drones.has(droneId)) return; // already registered

    // Persist home so swapToSimulation can always restore the drone to this
    // position (the real-drone telemetry overwrites droneStore, making .lat/.lng
    // unreliable as a home reference after a live connection).
    this._homePositions.set(droneId, { lat: homeLat, lon: homeLon, altMSL: homeAltMSL });

    const source = new SimulationTelemetrySource({
      rateHz:      20,
      noiseScale:  0.6,
      homeLatDeg:  homeLat,
      homeLonDeg:  homeLon,
      homeAltMSLm: homeAltMSL,
    });

    const manager = new TelemetryManager(source, {
      batteryCapacityMah: 5200,
      debugLabel: droneId,
      // Disable capturedAt deduplication. MAVLink sources emit multiple
      // message types (VFR_HUD, GLOBAL_POSITION_INT, ATTITUDE) that can
      // share the same timestamp_ms on Windows (~15.6 ms resolution).
      // Without this flag the deduplication drops ATTITUDE frames, causing
      // the PFD to freeze and mode to show UNKNOWN after the stale timer fires.
      emitAllFrames: true,
    });

    // Provide home for distToMAV calculation
    manager.setDerivedContext({
      homePosition: { latitude: homeLat, longitude: homeLon, altitudeMSLm: homeAltMSL },
    });

    // Initial state
    const state: NormalizedDroneState = {
      droneId,
      position: { lat: homeLat, lon: homeLon, alt: 0 },
      attitude: { roll: 0, pitch: 0, yaw: 0 },
      velocity: { vx: 0, vy: 0, vz: 0 },
    };

    const unsubs: (() => void)[] = [];

    // ── Per-drone 60 Hz interpolation layer ──────────────────────────
    // Buffers real telemetry snapshots and emits fluid ~60 Hz frames to
    // droneStore so 3D models, map markers and PFD all animate smoothly
    // regardless of the upstream packet rate (5–50 Hz).
    const interpolator = new TelemetryInterpolator();
    interpolator.start();

    // ── Real-rate callback: NormalizedDroneState + flight recorder ────
    // These run at actual telemetry rate (5–50 Hz) — correct behaviour:
    //   • Flight recorder must record REAL positions, not synthetic ones.
    //   • NormalizedDroneState is used by getSelectedDroneState() for pure
    //     TS consumers (not React); recording real values here is fine.
    const unsubTel = manager.onTelemetry((tel: FlightTelemetry) => {
      // Update NormalizedDroneState at real telemetry rate.
      state.position.lat = tel.navigation.latitude;
      state.position.lon = tel.navigation.longitude;
      state.position.alt = tel.altitude.altitudeAGLm ?? tel.altitude.altitudeMSLm;
      state.attitude.roll = tel.attitude.rollDeg;
      state.attitude.pitch = tel.attitude.pitchDeg;
      state.attitude.yaw = tel.attitude.yawDeg;
      state.velocity.vx = tel.velocity.velNorthMs;
      state.velocity.vy = tel.velocity.velEastMs;
      state.velocity.vz = tel.velocity.verticalSpeedMs;

      // ── Flight recorder: write one frame if recording is active ──
      // useFlightRecorderStore.getState() is O(1) and does NOT trigger React renders.
      const recorder = useFlightRecorderStore.getState();
      if (recorder.isRecording) {
        recorder.record(
          droneId,
          tel.navigation.latitude, tel.navigation.longitude,
          tel.altitude.altitudeAGLm ?? tel.altitude.altitudeMSLm,
          tel.attitude.rollDeg, tel.attitude.pitchDeg, tel.attitude.yawDeg,
          tel.velocity.airSpeedMs ?? 0, tel.velocity.groundSpeedMs,
          tel.battery.remainingPercent ?? 100,
          tel.velocity.velNorthMs, tel.velocity.velEastMs, tel.velocity.verticalSpeedMs,
        );
      }

      // Feed the interpolator so it always has fresh data to lerp from.
      // Done regardless of replay state — the interpolator only drives
      // droneStore updates (guarded below), not recorded flight data.
      interpolator.pushSnapshot(tel);
    });
    unsubs.push(unsubTel);

    // ── 60 Hz interpolated callback → droneStore ──────────────────────
    // This is the ONLY path that writes position/attitude to droneStore.
    // Running at ~60 Hz ensures perfectly fluid 3D model and map updates.
    const unsubFrame = interpolator.onFrame((tel: FlightTelemetry) => {
      // ── Skip droneStore update if replay is active ────────────────
      // During replay, useFlightReplay.tick() is the ONLY authority that
      // updates droneStore position/attitude.
      const replayState = useFlightRecorderStore.getState().replayState;
      if (replayState !== 'IDLE') return;

      // Sync interpolated position/attitude to droneStore.
      // Also sync flightMode so all UI areas read from the same source of
      // truth rather than mixing droneStore.mode with telemetry.flightMode.
      const telMode = tel.vehicleStatus.flightMode;
      useDroneStore.getState().updateDrone(droneId, {        altitude:    tel.altitude.altitudeAGLm ?? tel.altitude.altitudeMSLm,
        altitudeMSL: tel.altitude.altitudeMSLm,
        yaw:         tel.attitude.yawDeg,
        pitch:       tel.attitude.pitchDeg,
        roll:        tel.attitude.rollDeg,
        groundspeed: tel.velocity.groundSpeedMs,
        airspeed:    tel.velocity.airSpeedMs ?? 0,
        battery:     tel.battery.remainingPercent ?? 100,
        // Only propagate a real mode — skip UNKNOWN (e.g. DEFAULT_FLIGHT_TELEMETRY
        // or stale reset) so DroneMissionController / FailsafeManager mode writes
        // (GUIDED, LAND, LOITER, RTL) are not overwritten with UNKNOWN.
        ...(telMode !== FlightMode.UNKNOWN && { mode: telMode as DroneMode }),
        // If GPS fix is not yet 3D+, force world origin until a valid fix arrives.
        lat:         tel.gpsStatus.fixType >= 3 ? tel.navigation.latitude : 0,
        lng:         tel.gpsStatus.fixType >= 3 ? tel.navigation.longitude : 0,
      });
    });
    unsubs.push(unsubFrame);

    this._drones.set(droneId, { source, manager, interpolator, unsubs, state });
  }

  /**
   * Unregister a drone — destroys its telemetry pipeline and cleans up.
   */
  unregisterDrone(droneId: string): void {
    const entry = this._drones.get(droneId);
    if (!entry) return;

    // Unsubscribe all listeners
    for (const unsub of entry.unsubs) unsub();
    entry.unsubs.length = 0;

    // Stop the 60 Hz rAF loop before destroying the manager.
    entry.interpolator.stop();

    // Destroy manager (which stops source)
    entry.manager.destroy();

    this._drones.delete(droneId);
    this._movementModes.delete(droneId);

    // If the selected drone was unregistered, clear selection
    if (this._selectedId === droneId) {
      this._selectedId = null;
      this._emitSelectionChange(null);
    }
  }

  // ── Selection ─────────────────────────────────────────────────────────

  /**
   * Select a drone — PFD and telemetry panel will bind to this drone.
   * Pass null to deselect all.
   */
  selectDrone(droneId: string | null): void {
    if (droneId === this._selectedId) return;
    this._selectedId = droneId;
    this._emitSelectionChange(droneId);
  }

  /** Currently selected drone ID (null = none). */
  get selectedDroneId(): string | null {
    return this._selectedId;
  }

  /** Subscribe to selection changes. Returns unsubscribe function. */
  onSelectionChange(callback: SelectionChangeCallback): Unsubscribe {
    this._selectionListeners.add(callback);
    return () => { this._selectionListeners.delete(callback); };
  }

  // ── Accessors ─────────────────────────────────────────────────────────

  /** Get the TelemetryManager for a specific drone. */
  getManager(droneId: string): TelemetryManager | null {
    return this._drones.get(droneId)?.manager ?? null;
  }

  /** Get the TelemetryManager for the currently selected drone. */
  getSelectedManager(): TelemetryManager | null {
    if (!this._selectedId) return null;
    return this.getManager(this._selectedId);
  }

  /** Get NormalizedDroneState for a specific drone. */
  getDroneState(droneId: string): NormalizedDroneState | null {
    return this._drones.get(droneId)?.state ?? null;
  }

  /** Get NormalizedDroneState for the selected drone. */
  getSelectedDroneState(): NormalizedDroneState | null {
    if (!this._selectedId) return null;
    return this.getDroneState(this._selectedId);
  }

  /** Get the snapshot provider for the selected drone (for PFD rAF loop). */
  getSelectedSnapshot(): Readonly<FlightTelemetry> {
    const mgr = this.getSelectedManager();
    return mgr ? mgr.getSnapshot() : DEFAULT_FLIGHT_TELEMETRY;
  }

  /** List all registered drone IDs. */
  getRegisteredIds(): string[] {
    return Array.from(this._drones.keys());
  }

  /** Check if a drone is registered. */
  isRegistered(droneId: string): boolean {
    return this._drones.has(droneId);
  }

  // ── Movement mode ─────────────────────────────────────────────────────

  /**
   * Set the movement mode for a drone.
   *
   * This is the SINGLE AUTHORITY for per-drone movement:
   *   • IDLE    → SimSource emits static home position (no drift, disarmed).
   *   • MISSION → SimSource accepts pushMissionState() overrides from
   *               DroneMissionController. Demo scenario is disabled.
   *   • DEMO    → SimSource runs internal flight scenario (dev/test only).
   *   • MANUAL  → Reserved. SimSource will be extended for joystick input.
   *
   * @param droneId  Target drone.
   * @param mode     New movement mode.
   */
  setMovementMode(droneId: string, mode: DroneMovementMode): void {
    const entry = this._drones.get(droneId);
    if (!entry) return;

    const prev = this._movementModes.get(droneId) ?? DroneMovementMode.IDLE;
    if (prev === mode) return; // no change

    this._movementModes.set(droneId, mode);

    // ── Auto-record: start when a mission begins, stop when it ends ──────
    // We use the store directly (no React context needed — this is a singleton).
    const recorder = useFlightRecorderStore.getState();
    if (mode === DroneMovementMode.MISSION && !recorder.isRecording) {
      // Resolve the active mission name for this drone so the export file
      // is labelled with something meaningful.
      const missions = Object.values(useMissionStore.getState().missions);
      const activeMission = missions.find(
        (m) => m.droneId === droneId && m.status !== 'idle',
      ) ?? missions.find((m) => m.droneId === droneId);
      recorder.startRecording(activeMission?.name ?? droneId);
    } else if (
      prev === DroneMovementMode.MISSION &&
      mode !== DroneMovementMode.MISSION &&
      recorder.isRecording
    ) {
      recorder.stopRecording();
    }

    // Apply to the source
    switch (mode) {
      case DroneMovementMode.IDLE:
        // Do NOT clear mission override — if one exists, it holds the drone at
        // its current position (hover state). Clearing it would snap the drone
        // back to the home lat/lon used at SimSource construction time.
        entry.source.disableDemoScenario();
        break;
      case DroneMovementMode.MISSION:
        // Mission override will be pushed each tick by DroneMissionController.
        // Disable demo so it cannot conflict.
        entry.source.disableDemoScenario();
        break;
      case DroneMovementMode.DEMO:
        // Demo scenario takes over — clear any stale mission data.
        entry.source.clearMissionOverride();
        entry.source.enableDemoScenario();
        break;
      case DroneMovementMode.MANUAL:
        // Manual control coming — clear both demo and mission.
        entry.source.clearMissionOverride();
        entry.source.disableDemoScenario();
        break;
    }

    if (import.meta.env.DEV) {
      console.log(`[DroneStateManager] ${droneId}: movement mode ${prev} → ${mode}`);
    }
  }

  /**
   * Get the current movement mode for a drone.
   * Returns IDLE if the drone is not registered.
   */
  getMovementMode(droneId: string): DroneMovementMode {
    return this._movementModes.get(droneId) ?? DroneMovementMode.IDLE;
  }

  // ── Mission override ──────────────────────────────────────────────────

  /**
   * Push mission state into a drone's SimulationTelemetrySource.
   * Only has effect when movement mode is MISSION.
   *
   * Called by DroneMissionController every tick during TAKING_OFF / EN_ROUTE.
   */
  pushMissionState(droneId: string, state: MissionOverrideState): void {
    const entry = this._drones.get(droneId);
    if (!entry) return;

    // ── Mission State Machine guard: block position updates in invalid states ──
    if (!missionStateController.canMove(droneId)) {
      if (import.meta.env.DEV) {
        console.warn(
          `[DroneStateManager] pushMissionState BLOCKED on ${droneId}` +
          ` — missionLifecycleState=${missionStateController.getState(droneId)}`,
        );
      }
      return;
    }

    if (import.meta.env.DEV) {
      const mode = this._movementModes.get(droneId) ?? DroneMovementMode.IDLE;
      if (mode !== DroneMovementMode.MISSION) {
        console.warn(
          `[DroneStateManager] pushMissionState called on ${droneId} but movementMode=${mode}` +
          ` — call setMovementMode(droneId, MISSION) first`,
        );
      }
    }

    entry.source.setMissionOverride(state);
  }

  /**
   * Clear mission override and set drone back to IDLE.
   *
   * Unlike `setMovementMode(droneId, IDLE)`, this method ALSO clears the
   * mission override. That will snap the drone back to its home position.
   * Call this only when you explicitly want a full position reset (e.g., a
   * test reset or drone re-registration).
   *
   * For mission end / abort, prefer `setMovementMode(droneId, IDLE)` which
   * leaves the override in place so the drone stays at its final position.
   */
  clearMissionState(droneId: string): void {
    const entry = this._drones.get(droneId);
    if (!entry) return;
    entry.source.clearMissionOverride();
    this._movementModes.set(droneId, DroneMovementMode.IDLE);
    entry.source.disableDemoScenario();
  }

  /**
   * Clear the per-drone interpolation history.
   * Use on source transitions so stale snapshots cannot survive into the next mode.
   */
  resetInterpolator(droneId: string): void {
    const entry = this._drones.get(droneId);
    if (!entry) return;
    entry.interpolator.reset();
  }
  /** Get the SimulationTelemetrySource for a specific drone. */
  getSource(droneId: string): SimulationTelemetrySource | null {
    return this._drones.get(droneId)?.source ?? null;
  }

  /**
   * Get the original home position captured when the drone was first registered.
   *
   * This is the ONLY reliable home reference after a live MAVLink session,
   * because the real-drone telemetry overwrites droneStore lat/lng.
   *
   * Used by MAVLinkBridge.swapToSimulation to seed the new SimSource at the
   * correct home position instead of the real drone's last GPS fix.
   */
  getHomePosition(droneId: string): { lat: number; lon: number; altMSL: number } | null {
    return this._homePositions.get(droneId) ?? null;
  }

  /**
   * Update the SimulationTelemetrySource reference for a drone.
   *
   * Call this whenever a new SimulationTelemetrySource is created and given
   * to the drone's TelemetryManager (e.g. after swapToSimulation).
   * Keeping entry.source in sync ensures that setMovementMode, pushMissionState,
   * and getSource all target the ACTIVE source rather than an orphaned one.
   *
   * @param droneId   Target drone
   * @param source    The new SimulationTelemetrySource that was set on the TelemetryManager
   */
  setSimSource(droneId: string, source: SimulationTelemetrySource): void {
    const entry = this._drones.get(droneId);
    if (!entry) return;
    entry.source = source;
  }

  /**
   * Send an ARM/DISARM command to the active simulation source for a drone.
   *
   * This method is intentionally narrow: it only changes the simulated arm
   * state and leaves all live MAVLink command handling outside this manager.
   */
  setSimulationArmState(droneId: string, armed: boolean): void {
    const entry = this._drones.get(droneId);
    if (!entry) {
      throw new Error(`Cannot set simulation arm state: drone ${droneId} is not registered`);
    }

    entry.source.setArmState(armed);
  }

  // ── Lifecycle ─────────────────────────────────────────────────────────

  /**
   * Destroy everything — unregister all drones, clear all listeners.
   */
  destroy(): void {
    if (this._destroyed) return;
    this._destroyed = true;

    for (const droneId of this._drones.keys()) {
      this.unregisterDrone(droneId);
    }
    this._selectionListeners.clear();
  }

  // ── Internal ──────────────────────────────────────────────────────────

  private _emitSelectionChange(droneId: string | null): void {
    for (const cb of this._selectionListeners) cb(droneId);
  }
}

// ── Singleton ─────────────────────────────────────────────────────────────

export const droneStateManager = new DroneStateManager();


