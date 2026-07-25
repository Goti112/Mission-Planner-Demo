/**
 * MissionEngine.ts
 *
 * ════════════════════════════════════════════════════════════════════════
 * MISSION ENGINE — Event-aware mission lifecycle management
 * ════════════════════════════════════════════════════════════════════════
 *
 * Wraps the existing DroneMissionController and provides:
 *
 *   • Clean mission lifecycle API (start / pause / resume / abort)
 *   • Event emission for every state transition (via EventBus)
 *   • Mission timing (start time, duration tracking)
 *   • Integration with SimulationEngine for mode bookkeeping
 *   • Per-drone mission state queries
 *   • No replacement of DroneMissionController — purely additive
 *
 * ── Architecture ─────────────────────────────────────────────────────────
 *
 *   UI / MissionControls
 *        ↓
 *   MissionEngine (facade)
 *        ↓
 *   DroneMissionController (existing singleton)
 *        ↓
 *   DroneStateManager → SimulationTelemetrySource → TelemetryManager
 *        ↓
 *   droneStore / missionStore
 *        ↓
 *   EventBus → UI listeners
 *
 * ── Usage ────────────────────────────────────────────────────────────────
 *
 *   import { missionEngine } from './MissionEngine';
 *
 *   // Start a mission (same args as DroneMissionController.startMission)
 *   missionEngine.startMission('drone-1', mission);
 *
 *   // Pause / Resume / Abort
 *   missionEngine.pauseMission('drone-1');
 *   missionEngine.resumeMission('drone-1');
 *   missionEngine.abortMission('drone-1');
 *
 *   // Query state
 *   const state = missionEngine.getMissionState('drone-1');
 *
 * @author  GCS Engineering
 */

import { droneMissionController } from './DroneMissionController';
import { eventBus, GCSEvent } from '../../../shared/events';
import { simulationEngine } from './simulation/SimulationEngine';
import { missionStateController } from './MissionStateController';
import { MissionState } from './MissionState';
import type { Mission } from '../../../types/mission';

// ── Mission lifecycle state ─────────────────────────────────────────────

export const MissionPhase = {
  /** No active mission for this drone. */
  IDLE:      'IDLE',
  /** Mission is being prepared (waypoints loaded, pre-checks). */
  READY:     'READY',
  /** Mission is actively running (takeoff, en route). */
  RUNNING:   'RUNNING',
  /** Mission is paused by user. */
  PAUSED:    'PAUSED',
  /** All waypoints completed successfully. */
  COMPLETED: 'COMPLETED',
  /** Mission was aborted by user or error. */
  ABORTED:   'ABORTED',
} as const;

export type MissionPhase = typeof MissionPhase[keyof typeof MissionPhase];

// ── Per-drone mission tracking ──────────────────────────────────────────

interface ActiveMission {
  droneId: string;
  missionId: string;
  mission: Mission;
  phase: MissionPhase;
  startedAt: number;
  pausedAt: number | null;
  totalPausedMs: number;
  completedAt: number | null;
  lastWaypointIndex: number;
}

// ── MissionEngine ───────────────────────────────────────────────────────

export class MissionEngine {
  private _activeMissions: Map<string, ActiveMission> = new Map();
  private _destroyed = false;

  // ── Mission lifecycle ─────────────────────────────────────────────────

  /**
   * Start a mission for a drone. Delegates to DroneMissionController
   * and emits lifecycle events.
   *
   * @param droneId   Drone to run the mission on
   * @param mission   Mission object with waypoints
   */
  startMission(droneId: string, mission: Mission): void {
    // Abort any existing mission for this drone
    if (this._activeMissions.has(droneId)) {
      this.abortMission(droneId, 'New mission started');
    }

    // ── Mission State Machine: IDLE → ARMING ──
    if (!missionStateController.transition(droneId, MissionState.ARMING, mission.id)) {
      if (import.meta.env.DEV) {
        console.warn(
          `[MissionEngine] Cannot start mission — drone ${droneId} is in state ` +
          `${missionStateController.getState(droneId)}, expected IDLE`,
        );
      }
      return;
    }

    const activeMission: ActiveMission = {
      droneId,
      missionId: mission.id,
      mission,
      phase: MissionPhase.RUNNING,
      startedAt: Date.now(),
      pausedAt: null,
      totalPausedMs: 0,
      completedAt: null,
      lastWaypointIndex: 0,
    };

    this._activeMissions.set(droneId, activeMission);

    // Notify simulation engine
    simulationEngine.notifyMissionStarted(droneId);

    // Delegate to the existing controller — it will advance the state machine
    // from ARMING → TAKEOFF → MISSION_RUNNING on its own.
    droneMissionController.startMission(droneId, mission.id);

    // Emit event
    eventBus.emit(GCSEvent.MISSION_STARTED, {
      missionId: mission.id,
      droneId,
      waypointCount: mission.waypoints.length,
    });

    if (import.meta.env.DEV) {
      console.log(
        `[MissionEngine] Started: ${mission.name} on ${droneId} (${mission.waypoints.length} WPs)`,
      );
    }
  }

  /**
   * Pause the active mission for a drone.
   */
  pauseMission(droneId: string): void {
    const active = this._activeMissions.get(droneId);
    if (!active || active.phase !== MissionPhase.RUNNING) return;

    // ── Mission State Machine: MISSION_RUNNING → PAUSED ──
    if (!missionStateController.transition(droneId, MissionState.PAUSED)) {
      if (import.meta.env.DEV) {
        console.warn(`[MissionEngine] MISSION_RUNNING → PAUSED blocked for ${droneId}`);
      }
      return;
    }

    active.phase = MissionPhase.PAUSED;
    active.pausedAt = Date.now();

    // Delegate to existing controller
    droneMissionController.pauseMission(droneId);

    eventBus.emit(GCSEvent.MISSION_PAUSED, {
      missionId: active.missionId,
      droneId,
    });

    if (import.meta.env.DEV) {
      console.log(`[MissionEngine] Paused: ${droneId}`);
    }
  }

  /**
   * Resume a paused mission.
   */
  resumeMission(droneId: string): void {
    const active = this._activeMissions.get(droneId);
    if (!active || active.phase !== MissionPhase.PAUSED) return;

    // ── Mission State Machine: PAUSED → MISSION_RUNNING ──
    if (!missionStateController.transition(droneId, MissionState.MISSION_RUNNING)) {
      if (import.meta.env.DEV) {
        console.warn(`[MissionEngine] PAUSED → MISSION_RUNNING blocked for ${droneId}`);
      }
      return;
    }

    // Track total paused time
    if (active.pausedAt !== null) {
      active.totalPausedMs += Date.now() - active.pausedAt;
      active.pausedAt = null;
    }

    active.phase = MissionPhase.RUNNING;

    // Delegate to existing controller
    droneMissionController.resumeMission(droneId);

    eventBus.emit(GCSEvent.MISSION_RESUMED, {
      missionId: active.missionId,
      droneId,
    });

    if (import.meta.env.DEV) {
      console.log(`[MissionEngine] Resumed: ${droneId}`);
    }
  }

  /**
   * Abort the active mission for a drone.
   *
   * @param droneId  Drone identifier
   * @param reason   Human-readable abort reason (default: 'User aborted')
   */
  abortMission(droneId: string, reason = 'User aborted'): void {
    const active = this._activeMissions.get(droneId);
    if (!active) return;
    if (active.phase === MissionPhase.COMPLETED || active.phase === MissionPhase.ABORTED) return;

    // ── Mission State Machine: → ABORTED ──
    missionStateController.transition(droneId, MissionState.ABORTED);

    active.phase = MissionPhase.ABORTED;
    active.completedAt = Date.now();

    // Delegate to existing controller
    droneMissionController.abortMission(droneId);

    // Notify simulation engine
    simulationEngine.notifyMissionEnded(droneId);

    eventBus.emit(GCSEvent.MISSION_ABORTED, {
      missionId: active.missionId,
      droneId,
      reason,
    });

    if (import.meta.env.DEV) {
      console.log(`[MissionEngine] Aborted: ${droneId} — ${reason}`);
    }

    // Auto-reset to IDLE after a short delay
    setTimeout(() => {
      if (missionStateController.getState(droneId) === MissionState.ABORTED) {
        missionStateController.transition(droneId, MissionState.IDLE);
      }
    }, 1000);
  }

  /**
   * Mark a mission as completed. Should be called when the underlying
   * DroneMissionController reports completion (via store observation).
   */
  completeMission(droneId: string): void {
    const active = this._activeMissions.get(droneId);
    if (!active) return;
    if (active.phase === MissionPhase.COMPLETED) return;

    // ── Mission State Machine: → COMPLETED ──
    missionStateController.transition(droneId, MissionState.COMPLETED);

    active.phase = MissionPhase.COMPLETED;
    active.completedAt = Date.now();

    const durationMs = active.completedAt - active.startedAt - active.totalPausedMs;

    // Notify simulation engine
    simulationEngine.notifyMissionEnded(droneId);

    eventBus.emit(GCSEvent.MISSION_COMPLETED, {
      missionId: active.missionId,
      droneId,
      durationMs,
    });

    if (import.meta.env.DEV) {
      console.log(
        `[MissionEngine] Completed: ${droneId} in ${(durationMs / 1000).toFixed(1)}s`,
      );
    }

    // Auto-reset to IDLE after a delay
    setTimeout(() => {
      if (missionStateController.getState(droneId) === MissionState.COMPLETED) {
        missionStateController.transition(droneId, MissionState.IDLE);
      }
    }, 2000);
  }

  /**
   * Report waypoint progress. Can be called by external observers
   * watching the mission store or DroneMissionController.
   */
  reportProgress(
    droneId: string,
    currentWpIndex: number,
    segmentProgress: number,
    totalWaypoints: number,
  ): void {
    const active = this._activeMissions.get(droneId);
    if (!active) return;

    // Detect waypoint change
    if (currentWpIndex > active.lastWaypointIndex) {
      eventBus.emit(GCSEvent.MISSION_WAYPOINT_REACHED, {
        missionId: active.missionId,
        droneId,
        waypointIndex: active.lastWaypointIndex,
        waypointId: active.mission.waypoints[active.lastWaypointIndex]?.id ?? '',
      });

      active.lastWaypointIndex = currentWpIndex;
    }

    // Emit progress event
    const overallProgress = totalWaypoints > 0
      ? Math.min((currentWpIndex + segmentProgress) / totalWaypoints, 1)
      : 0;

    eventBus.emit(GCSEvent.MISSION_PROGRESS, {
      missionId: active.missionId,
      droneId,
      currentWpIndex,
      totalWaypoints,
      segmentProgress,
      overallProgress,
    });
  }

  // ── Queries ───────────────────────────────────────────────────────────

  /**
   * Get the current mission state for a drone.
   */
  getMissionState(droneId: string) {
    const active = this._activeMissions.get(droneId);
    if (!active) return null;

    const now = Date.now();
    const activePauseMs = active.pausedAt ? now - active.pausedAt : 0;
    const elapsedMs = now - active.startedAt - active.totalPausedMs - activePauseMs;

    return {
      droneId: active.droneId,
      missionId: active.missionId,
      missionName: active.mission.name,
      phase: active.phase,
      waypointCount: active.mission.waypoints.length,
      currentWaypointIndex: active.lastWaypointIndex,
      startedAt: active.startedAt,
      elapsedMs,
      totalPausedMs: active.totalPausedMs + activePauseMs,
      completedAt: active.completedAt,
    };
  }

  /**
   * Get the current mission phase for a drone.
   */
  getMissionPhase(droneId: string): MissionPhase {
    return this._activeMissions.get(droneId)?.phase ?? MissionPhase.IDLE;
  }

  /**
   * Check if a drone has an active (running or paused) mission.
   */
  hasMission(droneId: string): boolean {
    const active = this._activeMissions.get(droneId);
    if (!active) return false;
    return active.phase === MissionPhase.RUNNING || active.phase === MissionPhase.PAUSED;
  }

  /**
   * Get all drone IDs with active missions.
   */
  getActiveMissionDroneIds(): string[] {
    const ids: string[] = [];
    for (const [id, mission] of this._activeMissions) {
      if (mission.phase === MissionPhase.RUNNING || mission.phase === MissionPhase.PAUSED) {
        ids.push(id);
      }
    }
    return ids;
  }

  /**
   * Get history of missions (including completed/aborted).
   */
  getMissionHistory(): ReadonlyArray<{
    droneId: string;
    missionId: string;
    phase: MissionPhase;
    startedAt: number;
    completedAt: number | null;
  }> {
    return [...this._activeMissions.values()].map((m) => ({
      droneId: m.droneId,
      missionId: m.missionId,
      phase: m.phase,
      startedAt: m.startedAt,
      completedAt: m.completedAt,
    }));
  }

  // ── Diagnostics ───────────────────────────────────────────────────────

  /**
   * Get a diagnostic overview of all mission state.
   */
  getDiagnostics() {
    const missions: Record<string, {
      missionId: string;
      phase: MissionPhase;
      waypointCount: number;
      elapsedMs: number;
    }> = {};

    for (const [id, m] of this._activeMissions) {
      const elapsedMs = m.completedAt
        ? m.completedAt - m.startedAt - m.totalPausedMs
        : Date.now() - m.startedAt - m.totalPausedMs;

      missions[id] = {
        missionId: m.missionId,
        phase: m.phase,
        waypointCount: m.mission.waypoints.length,
        elapsedMs,
      };
    }

    return {
      activeMissionCount: this.getActiveMissionDroneIds().length,
      totalMissions: this._activeMissions.size,
      missions,
    };
  }

  // ── Cleanup ───────────────────────────────────────────────────────────

  /**
   * Clear completed/aborted missions from history.
   */
  clearHistory(): void {
    for (const [id, m] of [...this._activeMissions.entries()]) {
      if (m.phase === MissionPhase.COMPLETED || m.phase === MissionPhase.ABORTED) {
        this._activeMissions.delete(id);
      }
    }
  }

  /**
   * Destroy the engine — abort all active missions and clean up.
   */
  destroy(): void {
    if (this._destroyed) return;
    this._destroyed = true;

    // Abort all active missions
    for (const droneId of this.getActiveMissionDroneIds()) {
      this.abortMission(droneId, 'MissionEngine destroyed');
    }

    this._activeMissions.clear();
  }
}

// ── Singleton ───────────────────────────────────────────────────────────

/**
 * Global MissionEngine — the primary interface for mission operations.
 */
export const missionEngine = new MissionEngine();
