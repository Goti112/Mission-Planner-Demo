/**
 * SimulationEngine.ts
 *
 * ════════════════════════════════════════════════════════════════════════
 * SIMULATION ENGINE — Centralized simulation control for all drones
 * ════════════════════════════════════════════════════════════════════════
 *
 * Wraps the per-drone SimulationTelemetrySource management and provides
 * a unified API to control simulation behavior across all drones.
 *
 * ── Responsibilities ─────────────────────────────────────────────────────
 *
 *   • Enable/disable demo scenarios per drone
 *   • Manage simulation rate (Hz) for all sources
 *   • Track which drones are in simulation mode vs. MAVLink
 *   • Emit events for simulation state changes
 *   • Provide diagnostics for simulation health
 *
 * ── Architecture ─────────────────────────────────────────────────────────
 *
 *   SimulationEngine (facade)
 *        ↓
 *   DroneStateManager → SimulationTelemetrySource[] (existing)
 *        ↓
 *   EventBus
 *
 * ── Usage ────────────────────────────────────────────────────────────────
 *
 *   import { simulationEngine } from './SimulationEngine';
 *
 *   // Enable demo for a drone
 *   simulationEngine.enableDemo('drone-1');
 *
 *   // Disable demo
 *   simulationEngine.disableDemo('drone-1');
 *
 *   // Check simulation state
 *   simulationEngine.getSimulationState('drone-1');
 *
 * @author  GCS Engineering
 */

import { droneRuntime } from '../../../drone';

type DroneMovementMode = ReturnType<typeof droneRuntime.getMovementMode>;
import { eventBus, GCSEvent } from '../../../../shared/events';

// ── Simulation state per drone ──────────────────────────────────────────

export const SimulationMode = {
  /** Source is running but only emitting idle/static telemetry. */
  IDLE:     'IDLE',
  /** Internal demo scenario is active (takeoff → cruise → turns → loop). */
  DEMO:     'DEMO',
  /** External mission controller is driving the source via override. */
  MISSION:  'MISSION',
  /** Source is stopped / drone is using MAVLink instead. */
  INACTIVE: 'INACTIVE',
} as const;

export type SimulationMode = typeof SimulationMode[keyof typeof SimulationMode];

interface SimulationEntry {
  droneId: string;
  mode: SimulationMode;
  startedAt: number | null;
  rateHz: number;
}

// ── SimulationEngine ────────────────────────────────────────────────────

export class SimulationEngine {
  private _entries: Map<string, SimulationEntry> = new Map();
  private _destroyed = false;

  /** Default simulation rate for new drones. */
  private static readonly DEFAULT_RATE_HZ = 20;

  // ── Per-drone simulation control ──────────────────────────────────────

  /**
   * Track a drone for simulation management.
   * Called by DroneManager during registration.
   *
   * @param droneId  Drone identifier
   * @param rateHz   Simulation emission rate (default: 20)
   */
  trackDrone(droneId: string, rateHz?: number): void {
    if (this._entries.has(droneId)) return;

    this._entries.set(droneId, {
      droneId,
      mode: SimulationMode.IDLE,
      startedAt: Date.now(),
      rateHz: rateHz ?? SimulationEngine.DEFAULT_RATE_HZ,
    });

    eventBus.emit(GCSEvent.SIMULATION_STARTED, {
      droneId,
      rateHz: rateHz ?? SimulationEngine.DEFAULT_RATE_HZ,
    });
  }

  /**
   * Stop tracking a drone.
   */
  untrackDrone(droneId: string): void {
    const entry = this._entries.get(droneId);
    if (!entry) return;

    // Disable demo if active
    if (entry.mode === SimulationMode.DEMO) {
      this._disableDemoInternal(droneId);
    }

    this._entries.delete(droneId);

    eventBus.emit(GCSEvent.SIMULATION_STOPPED, { droneId });
  }

  // ── Demo scenario control ─────────────────────────────────────────────

  /**
   * Enable the internal demo flight scenario for a drone.
   * This activates the SimulationTelemetrySource's demo mode
   * (takeoff → cruise → banked turn → descent → loop).
   */
  enableDemo(droneId: string): void {
    const entry = this._entries.get(droneId);
    if (!entry) return;
    if (entry.mode === SimulationMode.DEMO) return;

    // Access the underlying source via DroneStateManager
    // DroneStateManager stores per-drone sources internally;
    // we use the movement mode API to set DEMO mode
    droneRuntime.setMovementMode(droneId, 'DEMO' as DroneMovementMode);

    entry.mode = SimulationMode.DEMO;

    eventBus.emit(GCSEvent.SIMULATION_MODE_CHANGED, {
      droneId,
      mode: SimulationMode.DEMO,
    });

    if (import.meta.env.DEV) {
      console.log(`[SimulationEngine] Demo enabled: ${droneId}`);
    }
  }

  /**
   * Disable the demo scenario — drone returns to idle.
   */
  disableDemo(droneId: string): void {
    const entry = this._entries.get(droneId);
    if (!entry) return;
    if (entry.mode !== SimulationMode.DEMO) return;

    this._disableDemoInternal(droneId);
  }

  /**
   * Notify the engine that a mission has started on a drone.
   * Called by MissionEngine when a mission begins.
   */
  notifyMissionStarted(droneId: string): void {
    const entry = this._entries.get(droneId);
    if (!entry) return;

    entry.mode = SimulationMode.MISSION;

    eventBus.emit(GCSEvent.SIMULATION_MODE_CHANGED, {
      droneId,
      mode: SimulationMode.MISSION,
    });
  }

  /**
   * Notify the engine that a mission has ended.
   * Called by MissionEngine when a mission completes, aborts, etc.
   */
  notifyMissionEnded(droneId: string): void {
    const entry = this._entries.get(droneId);
    if (!entry) return;

    entry.mode = SimulationMode.IDLE;

    eventBus.emit(GCSEvent.SIMULATION_MODE_CHANGED, {
      droneId,
      mode: SimulationMode.IDLE,
    });
  }

  // ── Queries ───────────────────────────────────────────────────────────

  /**
   * Get the current simulation mode for a drone.
   */
  getSimulationMode(droneId: string): SimulationMode {
    return this._entries.get(droneId)?.mode ?? SimulationMode.INACTIVE;
  }

  /**
   * Get simulation state for a drone.
   */
  getSimulationState(droneId: string) {
    const entry = this._entries.get(droneId);
    if (!entry) return null;

    return {
      droneId: entry.droneId,
      mode: entry.mode,
      startedAt: entry.startedAt,
      rateHz: entry.rateHz,
      uptimeMs: entry.startedAt ? Date.now() - entry.startedAt : 0,
    };
  }

  /**
   * Get all tracked drone IDs.
   */
  getTrackedDroneIds(): string[] {
    return [...this._entries.keys()];
  }

  /**
   * Check if a drone is using simulation.
   */
  isSimulated(droneId: string): boolean {
    const entry = this._entries.get(droneId);
    return entry !== undefined && entry.mode !== SimulationMode.INACTIVE;
  }

  // ── Internal ──────────────────────────────────────────────────────────

  private _disableDemoInternal(droneId: string): void {
    droneRuntime.setMovementMode(droneId, 'IDLE' as DroneMovementMode);

    const entry = this._entries.get(droneId);
    if (entry) {
      entry.mode = SimulationMode.IDLE;
    }

    eventBus.emit(GCSEvent.SIMULATION_MODE_CHANGED, {
      droneId,
      mode: SimulationMode.IDLE,
    });

    if (import.meta.env.DEV) {
      console.log(`[SimulationEngine] Demo disabled: ${droneId}`);
    }
  }

  // ── Diagnostics ───────────────────────────────────────────────────────

  /**
   * Get a diagnostic overview of all simulation state.
   */
  getDiagnostics() {
    const drones: Record<string, {
      mode: SimulationMode;
      rateHz: number;
      uptimeMs: number;
    }> = {};

    for (const [id, entry] of this._entries) {
      drones[id] = {
        mode: entry.mode,
        rateHz: entry.rateHz,
        uptimeMs: entry.startedAt ? Date.now() - entry.startedAt : 0,
      };
    }

    return {
      trackedCount: this._entries.size,
      drones,
    };
  }

  // ── Cleanup ───────────────────────────────────────────────────────────

  /**
   * Destroy the engine — stop tracking all drones.
   */
  destroy(): void {
    if (this._destroyed) return;
    this._destroyed = true;

    for (const droneId of [...this._entries.keys()]) {
      this.untrackDrone(droneId);
    }
    this._entries.clear();
  }
}

// ── Singleton ───────────────────────────────────────────────────────────

/**
 * Global SimulationEngine — manages all drone simulation state.
 */
export const simulationEngine = new SimulationEngine();
