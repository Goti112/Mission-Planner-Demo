/**
 * DroneManager.ts
 *
 * ════════════════════════════════════════════════════════════════════════
 * DRONE MANAGER — Central drone lifecycle & state management facade
 * ════════════════════════════════════════════════════════════════════════
 *
 * Clean, event-aware facade over the existing DroneStateManager singleton.
 * This layer provides:
 *
 *   • Unified API for drone registration, selection, and state queries
 *   • Event emission for all lifecycle changes (via EventBus)
 *   • TelemetryProcessor integration (per-drone rate/health tracking)
 *   • Read-only state snapshots (no mutation outside this manager)
 *   • No replacement of DroneStateManager — wraps and augments
 *
 * ── Architecture ─────────────────────────────────────────────────────────
 *
 *   UI / Hooks           DroneManager (facade)
 *       ↕                     ↕
 *   droneStore ←───── DroneStateManager (existing singleton)
 *       ↑                     ↕
 *   3D/Map/PFD          TelemetryProcessor[]
 *                             ↕
 *                         EventBus
 *
 * ── Usage ────────────────────────────────────────────────────────────────
 *
 *   import { droneManager } from './DroneManager';
 *
 *   // Register a drone (delegates to DroneStateManager)
 *   droneManager.registerDrone('drone-1', 'AllDrone 440-A', 40.4168, -3.7038, 650);
 *
 *   // Select
 *   droneManager.selectDrone('drone-1');
 *
 *   // Get state snapshot
 *   const state = droneManager.getDroneState('drone-1');
 *
 *   // Get telemetry stats
 *   const stats = droneManager.getTelemetryStats('drone-1');
 *
 *   // List all drones
 *   const ids = droneManager.getAllDroneIds();
 *
 * @author  GCS Engineering
 */

import { droneStateManager } from './DroneStateManager';
import type { NormalizedDroneState, DroneMovementMode } from './DroneStateManager';
import { TelemetryProcessor } from '../../telemetry';
import { eventBus, GCSEvent } from '../../../shared/events';
import type { TelemetryManager } from '../../telemetry';

// ── Drone registration info ─────────────────────────────────────────────

interface DroneRegistration {
  droneId: string;
  name: string;
  homeLat: number;
  homeLon: number;
  homeAltMSL: number;
  registeredAt: number;
  processor: TelemetryProcessor | null;
}

// ── DroneManager ────────────────────────────────────────────────────────

export class DroneManager {
  /** Per-drone registration metadata + processor reference. */
  private _registrations: Map<string, DroneRegistration> = new Map();

  /** Whether this manager has been destroyed. */
  private _destroyed = false;

  // ── Registration ──────────────────────────────────────────────────────

  /**
   * Register a drone — delegates to DroneStateManager and creates a
   * TelemetryProcessor for event emission and rate tracking.
   *
   * @param droneId    Unique drone identifier
   * @param name       Human-friendly name (for events/logs)
   * @param homeLat    Home latitude in decimal degrees
   * @param homeLon    Home longitude in decimal degrees
   * @param homeAltMSL Home altitude MSL in metres
   */
  registerDrone(
    droneId: string,
    name: string,
    homeLat: number,
    homeLon: number,
    homeAltMSL: number,
  ): void {
    if (this._registrations.has(droneId)) return;

    // Delegate to the existing singleton
    droneStateManager.registerDrone(droneId, homeLat, homeLon, homeAltMSL);

    // Wrap the manager's TelemetryManager with a processor
    let processor: TelemetryProcessor | null = null;
    const manager = droneStateManager.getManager(droneId);
    if (manager) {
      processor = new TelemetryProcessor(droneId, manager);
    }

    this._registrations.set(droneId, {
      droneId,
      name,
      homeLat,
      homeLon,
      homeAltMSL,
      registeredAt: Date.now(),
      processor,
    });

    // Emit registration event
    eventBus.emit(GCSEvent.DRONE_REGISTERED, { droneId, name });

    if (import.meta.env.DEV) {
      console.log(`[DroneManager] Registered: ${name} (${droneId})`);
    }
  }

  /**
   * Unregister a drone — cleans up processor, delegates to DroneStateManager.
   */
  unregisterDrone(droneId: string): void {
    const reg = this._registrations.get(droneId);
    if (!reg) return;

    // Destroy the processor
    reg.processor?.destroy();
    reg.processor = null;

    // Delegate to the existing singleton
    droneStateManager.unregisterDrone(droneId);

    this._registrations.delete(droneId);

    eventBus.emit(GCSEvent.DRONE_UNREGISTERED, { droneId });

    if (import.meta.env.DEV) {
      console.log(`[DroneManager] Unregistered: ${droneId}`);
    }
  }

  // ── Selection ─────────────────────────────────────────────────────────

  /**
   * Set the active/selected drone. Emits DRONE_SELECTED event.
   * Pass null to deselect.
   */
  selectDrone(droneId: string | null): void {
    const previousId = droneStateManager.selectedDroneId;
    if (previousId === droneId) return;

    droneStateManager.selectDrone(droneId);

    eventBus.emit(GCSEvent.DRONE_SELECTED, { droneId, previousId });
  }

  /** Get the currently selected drone ID (or null). */
  get selectedDroneId(): string | null {
    return droneStateManager.selectedDroneId;
  }

  // ── State queries ─────────────────────────────────────────────────────

  /**
   * Get the normalized state of a specific drone.
   * Returns null if the drone is not registered.
   */
  getDroneState(droneId: string): NormalizedDroneState | null {
    return droneStateManager.getDroneState(droneId);
  }

  /**
   * Get the TelemetryManager for a specific drone.
   * Returns null if not registered.
   */
  getManager(droneId: string): TelemetryManager | null {
    return droneStateManager.getManager(droneId) ?? null;
  }

  /**
   * Get the TelemetryManager for the currently selected drone.
   * Returns null if nothing is selected.
   */
  getSelectedManager(): TelemetryManager | null {
    return droneStateManager.getSelectedManager();
  }

  /**
   * Get the TelemetryProcessor for a specific drone.
   * Returns null if not registered.
   */
  getProcessor(droneId: string): TelemetryProcessor | null {
    return this._registrations.get(droneId)?.processor ?? null;
  }

  /**
   * Get telemetry stats (FPS, staleness) for a specific drone.
   * Returns null if not registered or no processor.
   */
  getTelemetryStats(droneId: string) {
    return this._registrations.get(droneId)?.processor?.getStats() ?? null;
  }

  /**
   * Get the movement mode for a drone.
   */
  getMovementMode(droneId: string): DroneMovementMode {
    return droneStateManager.getMovementMode(droneId);
  }

  /**
   * Get all registered drone IDs.
   */
  getAllDroneIds(): string[] {
    return [...this._registrations.keys()];
  }

  /**
   * Get registration info for all drones.
   */
  getAllRegistrations(): ReadonlyArray<Readonly<Omit<DroneRegistration, 'processor'>>> {
    return [...this._registrations.values()].map((reg) => {
      const { processor: _, ...rest } = reg;
      void _;
      return rest;
    });
  }

  /**
   * Check if a drone is registered.
   */
  isDroneRegistered(droneId: string): boolean {
    return this._registrations.has(droneId);
  }

  /**
   * Get the total number of registered drones.
   */
  get droneCount(): number {
    return this._registrations.size;
  }

  // ── Diagnostics ───────────────────────────────────────────────────────

  /**
   * Get a diagnostic snapshot of the entire system.
   */
  getDiagnostics() {
    const drones: Record<string, {
      name: string;
      registeredAt: number;
      telemetryStats: ReturnType<TelemetryProcessor['getStats']> | null;
      movementMode: DroneMovementMode;
      state: NormalizedDroneState | null;
    }> = {};

    for (const [id, reg] of this._registrations) {
      drones[id] = {
        name: reg.name,
        registeredAt: reg.registeredAt,
        telemetryStats: reg.processor?.getStats() ?? null,
        movementMode: droneStateManager.getMovementMode(id),
        state: droneStateManager.getDroneState(id),
      };
    }

    return {
      droneCount: this._registrations.size,
      selectedDroneId: this.selectedDroneId,
      eventBusStats: {
        totalEventsEmitted: eventBus.totalEventsEmitted,
        uptimeMs: eventBus.uptimeMs,
      },
      drones,
    };
  }

  // ── Cleanup ───────────────────────────────────────────────────────────

  /**
   * Destroy the manager — unregisters all drones and cleans up.
   */
  destroy(): void {
    if (this._destroyed) return;
    this._destroyed = true;

    for (const reg of this._registrations.values()) {
      reg.processor?.destroy();
      reg.processor = null;
    }

    for (const droneId of droneStateManager.getRegisteredIds()) {
      droneStateManager.unregisterDrone(droneId);
    }

    this._registrations.clear();
    droneStateManager.selectDrone(null);
  }
}

// ── Singleton ───────────────────────────────────────────────────────────

/**
 * Global DroneManager instance — the primary facade for drone operations.
 */
export const droneManager = new DroneManager();
