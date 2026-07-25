/**
 * FailsafeManager.ts — Core failsafe evaluation and action execution
 *
 * ════════════════════════════════════════════════════════════════════════
 * FAILSAFE MANAGER — Singleton service (no React dependency)
 * ════════════════════════════════════════════════════════════════════════
 *
 * Responsibilities:
 *   • Evaluate all failsafe rules on each monitoring cycle (~1 Hz).
 *   • Track active failsafes per drone to avoid re-triggering.
 *   • Execute the appropriate action when a new failsafe fires.
 *   • Resolve failsafes when their conditions clear.
 *   • Log every event to the FlightEventLog.
 *   • Expose simulation helpers for dev/test scenarios.
 *
 * ── Integration ───────────────────────────────────────────────────────────
 *
 *   Called by:  useFailsafeMonitor (React hook) at ~1 Hz
 *   Calls into: droneMissionController  — abortMission / pauseMission
 *               useDroneStore           — updateDrone mode
 *               flightEventLog          — logEvent
 *               useFailsafeStore        — addActive / resolveActive
 *
 * ── Rule priority (highest first) ────────────────────────────────────────
 *
 *   1. CRITICAL_BATTERY → LAND    (immediate emergency)
 *   2. SIGNAL_LOST      → RTH     (loss of control link)
 *   3. LOW_BATTERY      → RTH     (preventive RTL)
 *   4. GPS_LOST         → HOVER   (prevent nav errors)
 *   5. GEO_LIMIT        → RTH     (geofence breach)
 *   6. ALTITUDE_LIMIT   → DESCEND (regulatory compliance)
 *
 * ── Simulation support ────────────────────────────────────────────────────
 *
 *   failsafeManager.simulateBatteryDrain('drone-1', 5)  // force 5% battery
 *   failsafeManager.simulateGpsDrop('drone-1', 2)       // force 2 sats
 *   failsafeManager.simulateSignalLoss('drone-1', true) // force signal lost
 *   failsafeManager.clearSimulation('drone-1')          // clear all overrides
 *
 * @author  GCS Engineering
 */

import { useFailsafeStore } from './FailsafeStore'
import type {
  FailsafeInput,
  FailsafeThresholds,
  FailsafeEvent,
  FailsafeCondition,
  FailsafeLevel,
  FailsafeAction,
} from './FailsafeTypes'
import { DEFAULT_THRESHOLDS } from './FailsafeTypes'
import {
  checkSignalLoss,
  checkBatteryLow,
  checkBatteryCritical,
  checkGpsLost,
  checkGeoLimit,
  checkAltitudeLimit,
} from './FailsafeRules'
import { flightEventLog } from '../../modules/mission'
import { droneMissionController } from '../../modules/mission'
import { useDroneStore } from '../../modules/drone'
import { DroneState } from '../../modules/drone'

// ── Unique ID generator ───────────────────────────────────────────────────────

let _seq = 0
function newId(): string {
  return `fs-${Date.now().toString(36)}-${(++_seq).toString(36)}`
}

// ── Rule descriptor ───────────────────────────────────────────────────────────

/** Internal rule definition evaluated on each cycle. */
interface FailsafeRule {
  condition: FailsafeCondition
  level: FailsafeLevel
  action: FailsafeAction
  /** Returns true when the condition is currently present. */
  check: (input: FailsafeInput, homeLat: number, homeLng: number) => boolean
  /** Generates the human-readable alert message. */
  message: (input: FailsafeInput) => string
}

// ── Human-readable labels ────────────────────────────────────────────────────

const ACTION_LOG_LABELS: Record<FailsafeAction, string> = {
  RTH:     'RETURN HOME',
  LAND:    'LAND',
  HOVER:   'HOVER',
  DESCEND: 'DESCEND',
}

// ── FailsafeManager ───────────────────────────────────────────────────────────

export class FailsafeManager {
  private _thresholds: FailsafeThresholds = { ...DEFAULT_THRESHOLDS }

  /**
   * droneId → [homeLat, homeLng]
   * Captured on the first evaluate() call; used for geo-limit checks.
   * Reset via resetHomePosition() after relocation.
   */
  private readonly _homePositions: Map<string, [number, number]> = new Map()

  /**
   * Rule table evaluated in order (highest priority first).
   * Arrow functions capture `this._thresholds` dynamically.
   */
  private readonly _rules: FailsafeRule[] = [
    // ── 1. CRITICAL_BATTERY — immediate landing ──────────────────────────
    {
      condition: 'CRITICAL_BATTERY',
      level:     'critical',
      action:    'LAND',
      check:     (i) => checkBatteryCritical(i, this._thresholds),
      message:   (i) =>
        `Critical battery: ${i.batteryPercent.toFixed(0)}% — immediate landing`,
    },

    // ── 2. SIGNAL_LOST — return to home ──────────────────────────────────
    {
      condition: 'SIGNAL_LOST',
      level:     'critical',
      action:    'RTH',
      check:     (i) => checkSignalLoss(i, this._thresholds),
      message:   () => 'Signal lost — returning to home',
    },

    // ── 3. LOW_BATTERY — preventive RTL ──────────────────────────────────
    {
      condition: 'LOW_BATTERY',
      level:     'warning',
      action:    'RTH',
      check:     (i) => checkBatteryLow(i, this._thresholds),
      message:   (i) =>
        `Low battery: ${i.batteryPercent.toFixed(0)}% — returning to home`,
    },

    // ── 4. GPS_LOST — avoid navigation errors ────────────────────────────
    {
      condition: 'GPS_LOST',
      level:     'warning',
      action:    'HOVER',
      check:     (i) => checkGpsLost(i, this._thresholds),
      message:   (i) =>
        `GPS weak: ${i.satelliteCount} satellite${i.satelliteCount !== 1 ? 's' : ''} — hovering in place`,
    },

    // ── 5. GEO_LIMIT — geofence breach ───────────────────────────────────
    {
      condition: 'GEO_LIMIT',
      level:     'warning',
      action:    'RTH',
      check:     (i, homeLat, homeLng) =>
        checkGeoLimit(i, this._thresholds, homeLat, homeLng),
      message:   () => 'Geo-fence limit exceeded — returning to home',
    },

    // ── 6. ALTITUDE_LIMIT — regulatory compliance ─────────────────────────
    {
      condition: 'ALTITUDE_LIMIT',
      level:     'warning',
      action:    'DESCEND',
      check:     (i) => checkAltitudeLimit(i, this._thresholds),
      message:   (i) =>
        `Altitude limit exceeded: ${i.altitudeM.toFixed(0)} m — descending`,
    },
  ]

  // ── Configuration API ─────────────────────────────────────────────────────

  /**
   * Override one or more failsafe thresholds.
   * Useful for per-deployment configuration or operator preference.
   */
  setThresholds(overrides: Partial<FailsafeThresholds>): void {
    this._thresholds = { ...this._thresholds, ...overrides }
  }

  /** Read current thresholds (for display in settings UI). */
  getThresholds(): Readonly<FailsafeThresholds> {
    return this._thresholds
  }

  // ── Home position ─────────────────────────────────────────────────────────

  /**
   * Explicitly set the home position for a drone.
   * If not called, home is captured on the first evaluate() call.
   */
  setHomePosition(droneId: string, lat: number, lng: number): void {
    this._homePositions.set(droneId, [lat, lng])
  }

  /**
   * Clear the cached home position for a drone.
   * Call after a drone has relocated or re-armed at a new position.
   */
  resetHomePosition(droneId: string): void {
    this._homePositions.delete(droneId)
  }

  // ── Main evaluation cycle ─────────────────────────────────────────────────

  /**
   * Evaluate all failsafe rules for one drone.
   *
   * MUST be called at a regular interval (~1 Hz) by useFailsafeMonitor.
   * Pure synchronous — safe to call from React effects.
   *
   * For each rule:
   *   • If condition is NEW (not previously active) → fire action + log.
   *   • If condition RESOLVED (was active, now gone) → resolve + log.
   *   • If condition UNCHANGED → no-op.
   *
   * Simulation overrides from FailsafeStore are applied before evaluation,
   * allowing dev/test injection without touching real telemetry.
   *
   * @param input  Current telemetry snapshot for this drone.
   */
  evaluate(input: FailsafeInput): void {
    // Capture home position on first call
    if (!this._homePositions.has(input.droneId)) {
      this._homePositions.set(input.droneId, [input.lat, input.lng])
    }
    const [homeLat, homeLng] = this._homePositions.get(input.droneId)!

    // Apply simulation overrides
    const storeState = useFailsafeStore.getState()
    const simInput: FailsafeInput = {
      ...input,
      batteryPercent: storeState._simBatteryOverride[input.droneId] ?? input.batteryPercent,
      satelliteCount: storeState._simGpsOverride[input.droneId]     ?? input.satelliteCount,
      connected:      storeState._simSignalLoss[input.droneId]
        ? false
        : input.connected,
    }

    for (const rule of this._rules) {
      const key       = `${input.droneId}:${rule.condition}`
      const wasActive = !!storeState.active[key]
      const isNow     = rule.check(simInput, homeLat, homeLng)

      if (isNow && !wasActive) {
        // ── NEW FAILSAFE — fire action ──────────────────────────────────
        const event: FailsafeEvent = {
          id:          newId(),
          droneId:     input.droneId,
          condition:   rule.condition,
          level:       rule.level,
          action:      rule.action,
          message:     rule.message(simInput),
          triggeredAt: Date.now(),
          active:      true,
        }

        useFailsafeStore.getState().addActive(event)
        this._executeAction(input.droneId, rule.action)
        flightEventLog.logEvent(
          input.droneId,
          `FAILSAFE_${rule.condition}`,
          `FAILSAFE: ${rule.condition} → ${ACTION_LOG_LABELS[rule.action]} — ${event.message}`,
        )

        if (import.meta.env.DEV) {
          console.warn(
            `[FailsafeManager] ${input.droneId} FAILSAFE fired:`,
            rule.condition, '→', rule.action,
          )
        }
      } else if (!isNow && wasActive) {
        // ── CONDITION CLEARED — resolve failsafe ────────────────────────
        useFailsafeStore.getState().resolveActive(key, Date.now())
        flightEventLog.logEvent(
          input.droneId,
          'FAILSAFE_RESOLVED',
          `FAILSAFE resolved: ${rule.condition} — normal operation resumed`,
        )

        if (import.meta.env.DEV) {
          console.info(`[FailsafeManager] ${input.droneId} FAILSAFE resolved: ${rule.condition}`)
        }
      }
      // else: condition unchanged → no-op
    }
  }

  // ── Action execution ──────────────────────────────────────────────────────

  /**
   * Dispatch the failsafe action to the appropriate controllers.
   *
   * RTH  → abort active mission + set mode RTL
   * LAND → abort active mission + set mode LAND
   * HOVER → pause mission if running + set mode LOITER
   * DESCEND → set mode GUIDED (GCS altitude command in real system)
   *
   * In simulation: mode changes are reflected in the drone store and
   * displayed in the navbar/panel, but physical movement depends on
   * the mission controller state.
   */
  private _executeAction(droneId: string, action: FailsafeAction): void {
    const entity    = droneMissionController.getEntity(droneId)
    const missionId = droneMissionController.getAssignedMission(droneId)

    const isMissionActive =
      entity !== undefined &&
      entity.state !== DroneState.IDLE &&
      entity.state !== DroneState.ABORTED &&
      entity.state !== DroneState.COMPLETED

    switch (action) {
      case 'RTH': {
        // Abort ongoing mission and command RTL
        if (missionId && isMissionActive) {
          droneMissionController.abortMission(droneId)
        }
        useDroneStore.getState().updateDrone(droneId, { mode: 'RTL' })
        break
      }

      case 'LAND': {
        // Abort ongoing mission and command immediate landing
        if (missionId && isMissionActive) {
          droneMissionController.abortMission(droneId)
        }
        useDroneStore.getState().updateDrone(droneId, { mode: 'LAND' })
        break
      }

      case 'HOVER': {
        // Pause mission (if EN_ROUTE) and hold position in LOITER
        if (entity && entity.state === DroneState.EN_ROUTE) {
          droneMissionController.pauseMission(droneId)
        }
        useDroneStore.getState().updateDrone(droneId, { mode: 'LOITER' })
        break
      }

      case 'DESCEND': {
        // In a real system this would send a MAVLink SET_POSITION_TARGET command
        // reducing the altitude setpoint to the limit.
        // In simulation: set GUIDED mode to indicate GCS is taking altitude control.
        useDroneStore.getState().updateDrone(droneId, { mode: 'GUIDED' })
        break
      }
    }
  }

  // ── Simulation API ────────────────────────────────────────────────────────

  /**
   * Simulate a battery drain for testing LOW_BATTERY or CRITICAL_BATTERY.
   *
   * @param droneId  Target drone.
   * @param pct      Forced battery %. Pass null to clear the override.
   *
   * Example:
   *   failsafeManager.simulateBatteryDrain('drone-1', 5)   // → CRITICAL_BATTERY
   *   failsafeManager.simulateBatteryDrain('drone-1', null) // clear
   */
  simulateBatteryDrain(droneId: string, pct: number | null): void {
    useFailsafeStore.getState().setSimBattery(droneId, pct)
  }

  /**
   * Simulate a GPS drop for testing GPS_LOST.
   *
   * @param droneId  Target drone.
   * @param sats     Forced satellite count. Pass null to clear.
   *
   * Example:
   *   failsafeManager.simulateGpsDrop('drone-1', 2)   // → GPS_LOST (< 6 sats)
   *   failsafeManager.simulateGpsDrop('drone-1', null) // clear
   */
  simulateGpsDrop(droneId: string, sats: number | null): void {
    useFailsafeStore.getState().setSimGps(droneId, sats)
  }

  /**
   * Simulate a signal loss for testing SIGNAL_LOST.
   *
   * @param droneId  Target drone.
   * @param lost     True to force signal loss; false to restore.
   *
   * Example:
   *   failsafeManager.simulateSignalLoss('drone-1', true)  // → SIGNAL_LOST
   *   failsafeManager.simulateSignalLoss('drone-1', false)  // clear
   */
  simulateSignalLoss(droneId: string, lost: boolean): void {
    useFailsafeStore.getState().setSimSignalLoss(droneId, lost)
  }

  /**
   * Clear all simulation overrides for a drone.
   * Call this after a test scenario to restore normal monitoring.
   */
  clearSimulation(droneId: string): void {
    useFailsafeStore.getState().setSimBattery(droneId, null)
    useFailsafeStore.getState().setSimGps(droneId, null)
    useFailsafeStore.getState().setSimSignalLoss(droneId, false)
  }
}

// ── Singleton export ──────────────────────────────────────────────────────────

/**
 * Singleton FailsafeManager instance.
 *
 * Call evaluate() from useFailsafeMonitor at ~1 Hz.
 * Access simulation helpers from DevTools console for testing.
 *
 * Dev console usage:
 *   window.failsafeManager = failsafeManager  (auto-assigned in DEV mode via main.tsx)
 *   failsafeManager.simulateBatteryDrain('drone-1', 5)
 */
export const failsafeManager = new FailsafeManager()

// Expose to DevTools in development
if (import.meta.env.DEV) {
  ;(window as unknown as Record<string, unknown>).failsafeManager = failsafeManager
}
