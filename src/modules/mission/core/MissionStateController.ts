/* ═══════════════════════════════════════════════════════════════
   MissionStateController — Per-drone mission lifecycle FSM
   ═══════════════════════════════════════════════════════════════

   Central authority that tracks and validates mission state
   transitions for every drone. Prevents invalid behavior such
   as drones moving without an active mission.

   ── Responsibilities ────────────────────────────────────────

   • Tracks mission state per drone (Map<droneId, MissionState>)
   • Validates every transition against the allowed transition map
   • Blocks and logs invalid transitions
   • Emits MISSION_STATE_CHANGED event via EventBus
   • Syncs mission lifecycle state to droneStore
   • Provides query API for UI consumers

   ── Usage ────────────────────────────────────────────────────

   import { missionStateController } from './MissionStateController';

   missionStateController.transition('drone-1', MissionState.ARMING);
   missionStateController.getState('drone-1'); // → 'ARMING'

   @author  GCS Engineering
   ═══════════════════════════════════════════════════════════════ */

import {
  MissionState,
  MISSION_STATE_TRANSITIONS,
  isValidTransition,
  isMovableState,
  isActiveFlightState,
  MISSION_STATE_LABELS,
} from './MissionState';
import { eventBus, GCSEvent } from '../../../shared/events';
import { useDroneStore } from '../../drone/store/droneStore';

// ── Transition log entry ────────────────────────────────────────────────

export interface MissionStateTransition {
  droneId: string;
  from: MissionState;
  to: MissionState;
  timestamp: number;
  missionId: string | null;
}

// ── Controller ──────────────────────────────────────────────────────────

export class MissionStateController {
  /** Current state per drone. Defaults to IDLE if never set. */
  private _states: Map<string, MissionState> = new Map();

  /** Active missionId per drone (set on ARMING, cleared on reset to IDLE). */
  private _missionIds: Map<string, string> = new Map();

  /** Recent transition log (bounded ring buffer for diagnostics). */
  private _log: MissionStateTransition[] = [];
  private static readonly MAX_LOG = 200;

  private _destroyed = false;

  // ── Core API ──────────────────────────────────────────────────────────

  /**
   * Attempt to transition a drone to a new mission state.
   *
   * @param droneId   Target drone
   * @param to        Desired new state
   * @param missionId Optional — associates a mission with this transition
   * @returns `true` if the transition succeeded, `false` if blocked
   */
  transition(droneId: string, to: MissionState, missionId?: string): boolean {
    const from = this.getState(droneId);

    if (!isValidTransition(from, to)) {
      if (import.meta.env.DEV) {
        console.warn(
          `[MissionStateController] ✗ BLOCKED: ${droneId}: ${from} → ${to}` +
          ` (allowed: ${this.getAllowedTransitions(droneId).join(', ') || 'none'})`,
        );
      }
      return false;
    }

    // Track mission association
    if (missionId !== undefined) {
      this._missionIds.set(droneId, missionId);
    }

    // Commit state
    this._states.set(droneId, to);

    // If returning to IDLE, clear mission association
    if (to === MissionState.IDLE) {
      this._missionIds.delete(droneId);
    }

    const currentMissionId = this._missionIds.get(droneId) ?? null;
    const now = Date.now();

    // Log
    const entry: MissionStateTransition = {
      droneId,
      from,
      to,
      timestamp: now,
      missionId: currentMissionId,
    };
    this._pushLog(entry);

    if (import.meta.env.DEV) {
      console.log(
        `[MissionStateController] ✓ ${droneId}: ${from} → ${to}` +
        (currentMissionId ? ` (mission: ${currentMissionId})` : ''),
      );
    }

    // Emit event
    eventBus.emit(GCSEvent.MISSION_STATE_CHANGED, {
      droneId,
      from,
      to,
      missionId: currentMissionId,
      timestamp: now,
    });

    // Sync to droneStore so UI picks it up
    useDroneStore.getState().updateDrone(droneId, {
      missionLifecycleState: to,
    });

    return true;
  }

  // ── Queries ───────────────────────────────────────────────────────────

  /**
   * Get the current mission state for a drone (defaults to IDLE).
   */
  getState(droneId: string): MissionState {
    return this._states.get(droneId) ?? MissionState.IDLE;
  }

  /**
   * Get the Spanish label for a drone's current state.
   */
  getLabel(droneId: string): string {
    return MISSION_STATE_LABELS[this.getState(droneId)];
  }

  /**
   * Check if a specific transition would be valid.
   */
  canTransition(droneId: string, to: MissionState): boolean {
    return isValidTransition(this.getState(droneId), to);
  }

  /**
   * Get all allowed next states for a drone.
   */
  getAllowedTransitions(droneId: string): readonly MissionState[] {
    return MISSION_STATE_TRANSITIONS[this.getState(droneId)] ?? [];
  }

  /**
   * Can the mission controller push position updates for this drone?
   * Returns true for TAKEOFF, MISSION_RUNNING, PAUSED, RETURN_HOME, LANDING.
   */
  canMove(droneId: string): boolean {
    return isMovableState(this.getState(droneId));
  }

  /**
   * Is the drone actively flying (engines on, possibly moving)?
   */
  isFlying(droneId: string): boolean {
    return isActiveFlightState(this.getState(droneId));
  }

  /**
   * Get the mission ID currently associated with this drone.
   */
  getMissionId(droneId: string): string | null {
    return this._missionIds.get(droneId) ?? null;
  }

  /**
   * Get all drone IDs with active (non-IDLE, non-COMPLETED, non-ABORTED) states.
   */
  getActiveDroneIds(): string[] {
    const result: string[] = [];
    for (const [id, state] of this._states) {
      if (
        state !== MissionState.IDLE &&
        state !== MissionState.COMPLETED &&
        state !== MissionState.ABORTED
      ) {
        result.push(id);
      }
    }
    return result;
  }

  /**
   * Get a snapshot of all drone states.
   */
  getAllStates(): ReadonlyMap<string, MissionState> {
    return this._states;
  }

  // ── Reset ─────────────────────────────────────────────────────────────

  /**
   * Force-reset a drone to IDLE. Used for recovery / cleanup.
   * Bypasses transition validation but logs the reset.
   */
  forceReset(droneId: string): void {
    const from = this.getState(droneId);
    this._states.set(droneId, MissionState.IDLE);
    this._missionIds.delete(droneId);

    const now = Date.now();
    this._pushLog({
      droneId,
      from,
      to: MissionState.IDLE,
      timestamp: now,
      missionId: null,
    });

    eventBus.emit(GCSEvent.MISSION_STATE_CHANGED, {
      droneId,
      from,
      to: MissionState.IDLE,
      missionId: null,
      timestamp: now,
    });

    useDroneStore.getState().updateDrone(droneId, {
      missionLifecycleState: MissionState.IDLE,
    });

    if (import.meta.env.DEV) {
      console.log(`[MissionStateController] ⚠ Force-reset: ${droneId}: ${from} → IDLE`);
    }
  }

  // ── Diagnostics ───────────────────────────────────────────────────────

  /**
   * Get recent transition log entries.
   */
  getTransitionLog(limit = 50): readonly MissionStateTransition[] {
    return this._log.slice(-limit);
  }

  /**
   * Get a diagnostic summary of all drone states.
   */
  getDiagnostics() {
    const states: Record<string, { state: MissionState; missionId: string | null }> = {};
    for (const [id, state] of this._states) {
      states[id] = { state, missionId: this._missionIds.get(id) ?? null };
    }
    return {
      droneCount: this._states.size,
      activeDrones: this.getActiveDroneIds(),
      states,
      recentTransitions: this._log.slice(-10),
    };
  }

  // ── Lifecycle ─────────────────────────────────────────────────────────

  /**
   * Destroy — force-reset all drones, clear log.
   */
  destroy(): void {
    if (this._destroyed) return;
    this._destroyed = true;

    for (const droneId of this._states.keys()) {
      this.forceReset(droneId);
    }
    this._states.clear();
    this._missionIds.clear();
    this._log.length = 0;
  }

  // ── Internal ──────────────────────────────────────────────────────────

  private _pushLog(entry: MissionStateTransition): void {
    this._log.push(entry);
    if (this._log.length > MissionStateController.MAX_LOG) {
      this._log.splice(0, this._log.length - MissionStateController.MAX_LOG);
    }
  }
}

// ── Singleton ───────────────────────────────────────────────────────────

export const missionStateController = new MissionStateController();
