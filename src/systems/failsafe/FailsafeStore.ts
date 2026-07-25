/**
 * FailsafeStore.ts — Global failsafe state (Zustand)
 *
 * ════════════════════════════════════════════════════════════════════════
 * FAILSAFE STORE — Reactive state for failsafe alerts and history
 * ════════════════════════════════════════════════════════════════════════
 *
 * Holds:
 *   active   — currently active failsafe events per drone+condition.
 *              Keyed by `${droneId}:${condition}` for O(1) lookup.
 *   history  — bounded circular log of all events (active + resolved).
 *              Used by FlightLogPanel and post-flight analysis.
 *
 * Simulation overrides:
 *   _simBatteryOverride — force a battery % for testing LOW_BATTERY / CRITICAL_BATTERY.
 *   _simGpsOverride     — force a satellite count for testing GPS_LOST.
 *   _simSignalLoss      — force signal loss for testing SIGNAL_LOST.
 *
 *   These are applied inside FailsafeManager.evaluate() before rule evaluation.
 *   Access from DevTools console via:
 *     useFailsafeStore.getState().setSimBattery('drone-1', 5)
 *     failsafeManager.simulateBatteryDrain('drone-1', 5)
 *
 * Capacity:
 *   History is bounded to MAX_HISTORY = 200 entries (oldest discarded).
 *
 * @author  GCS Engineering
 */

import { create } from 'zustand'
import type { FailsafeEvent } from './FailsafeTypes'

// ── Constants ─────────────────────────────────────────────────────────────────

const MAX_HISTORY = 200

// ── Store interface ───────────────────────────────────────────────────────────

interface FailsafeStoreState {
  // ── State ──────────────────────────────────────────────────────────────────

  /** Active failsafe events keyed by `${droneId}:${condition}`. */
  active: Record<string, FailsafeEvent>

  /** Full chronological history (active + resolved), bounded to MAX_HISTORY. */
  history: FailsafeEvent[]

  /** Simulation: battery percent override per droneId. */
  _simBatteryOverride: Record<string, number>

  /** Simulation: satellite count override per droneId. */
  _simGpsOverride: Record<string, number>

  /** Simulation: forced signal loss per droneId. */
  _simSignalLoss: Record<string, boolean>

  // ── Actions ────────────────────────────────────────────────────────────────

  /** Register a newly triggered failsafe. */
  addActive: (event: FailsafeEvent) => void

  /** Mark an active failsafe as resolved. */
  resolveActive: (key: string, resolvedAt: number) => void

  /** Remove all active failsafes for a specific drone. */
  clearDrone: (droneId: string) => void

  /** Reset the entire store (all active + history). */
  clearAll: () => void

  // ── Simulation helpers ────────────────────────────────────────────────────

  /** Override battery percent for a drone. Pass null to clear. */
  setSimBattery: (droneId: string, pct: number | null) => void

  /** Override satellite count for a drone. Pass null to clear. */
  setSimGps: (droneId: string, sats: number | null) => void

  /** Force signal loss state for a drone. */
  setSimSignalLoss: (droneId: string, lost: boolean) => void
}

// ── Store implementation ──────────────────────────────────────────────────────

export const useFailsafeStore = create<FailsafeStoreState>((set) => ({
  active:              {},
  history:             [],
  _simBatteryOverride: {},
  _simGpsOverride:     {},
  _simSignalLoss:      {},

  addActive: (event) => set((s) => {
    const key = `${event.droneId}:${event.condition}`
    const history = [...s.history, event].slice(-MAX_HISTORY)
    return {
      active:  { ...s.active, [key]: event },
      history,
    }
  }),

  resolveActive: (key, resolvedAt) => set((s) => {
    const existing = s.active[key]
    if (!existing) return s

    const resolved: FailsafeEvent = { ...existing, active: false, resolvedAt }

    // Remove from active
    const remaining = { ...s.active }
    delete remaining[key]

    // Update history entry (replace active record with resolved)
    const history = [
      ...s.history.filter((h) => h.id !== existing.id),
      resolved,
    ].slice(-MAX_HISTORY)

    return { active: remaining, history }
  }),

  clearDrone: (droneId) => set((s) => {
    const active: Record<string, FailsafeEvent> = {}
    for (const [k, v] of Object.entries(s.active)) {
      if (v.droneId !== droneId) active[k] = v
    }
    return { active }
  }),

  clearAll: () => set({ active: {}, history: [] }),

  setSimBattery: (droneId, pct) => set((s) => {
    const overrides = { ...s._simBatteryOverride }
    if (pct === null) delete overrides[droneId]
    else overrides[droneId] = pct
    return { _simBatteryOverride: overrides }
  }),

  setSimGps: (droneId, sats) => set((s) => {
    const overrides = { ...s._simGpsOverride }
    if (sats === null) delete overrides[droneId]
    else overrides[droneId] = sats
    return { _simGpsOverride: overrides }
  }),

  setSimSignalLoss: (droneId, lost) => set((s) => ({
    _simSignalLoss: { ...s._simSignalLoss, [droneId]: lost },
  })),
}))
