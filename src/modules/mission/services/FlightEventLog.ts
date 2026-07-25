/**
 * FlightEventLog.ts — Flight Event Log service
 *
 * ════════════════════════════════════════════════════════════════════════
 * CENTRALIZED FLIGHT EVENT LOGGER
 * ════════════════════════════════════════════════════════════════════════
 *
 * Records important UAV flight events in chronological order for:
 *   • Operator situational awareness (FlightLogPanel UI)
 *   • Mission debugging and post-flight analysis
 *   • Customer support and incident review
 *   • Future export to JSON / CSV / flight report
 *
 * ── Architecture ─────────────────────────────────────────────────────────
 *
 *   This service is a pure singleton facade over the Zustand
 *   flightEventStore. It can be called from any core module
 *   (DroneMissionController, NavigationController, health monitoring)
 *   without React hooks — uses getState() for imperative access.
 *
 *   The UI reads directly from the Zustand store (reactive).
 *
 * ── Multi-drone support ───────────────────────────────────────────────────
 *
 *   Events are keyed by droneId. The FlightLogPanel filters by drone.
 *   getEvents(droneId) returns events for a single drone.
 *   getRecentEvents(n) returns the n most recent events across all drones.
 *
 * ── Max capacity ─────────────────────────────────────────────────────────
 *
 *   500 events per drone (enforced in the store). Oldest entries are
 *   automatically discarded when the limit is exceeded.
 *
 * ── Export ───────────────────────────────────────────────────────────────
 *
 *   exportJSON(droneId?) → JSON string (all or per-drone)
 *   exportCSV(droneId?)  → CSV string (all or per-drone)
 *
 * @author  GCS Engineering
 */

import { useFlightEventStore } from '../store/flightEventStore'
import type { FlightEvent } from '../../../types/FlightEvent'

class FlightEventLog {
  // ── Core API ──────────────────────────────────────────────────────────

  /**
   * Record a new flight event.
   *
   * @param droneId  ID of the drone generating the event.
   * @param type     Event category (SCREAMING_SNAKE_CASE, e.g. 'WAYPOINT_REACHED').
   * @param message  Human-readable description for the operator.
   */
  logEvent(droneId: string, type: string, message: string): void {
    useFlightEventStore.getState().logEvent(droneId, type, message)
  }

  /**
   * Get all events for a specific drone (oldest first).
   */
  getEvents(droneId: string): FlightEvent[] {
    return useFlightEventStore.getState().events[droneId] ?? []
  }

  /**
   * Get the N most recent events across all drones (most recent last).
   */
  getRecentEvents(limit: number): FlightEvent[] {
    const all = Object.values(useFlightEventStore.getState().events).flat()
    return all.sort((a, b) => a.timestamp - b.timestamp).slice(-limit)
  }

  /**
   * Get all events across all drones sorted by timestamp (oldest first).
   */
  getAllEvents(): FlightEvent[] {
    const all = Object.values(useFlightEventStore.getState().events).flat()
    return all.sort((a, b) => a.timestamp - b.timestamp)
  }

  // ── Export ────────────────────────────────────────────────────────────

  /**
   * Serialize events as a formatted JSON string.
   * Pass a droneId to export only that drone's events.
   */
  exportJSON(droneId?: string): string {
    const events = droneId ? this.getEvents(droneId) : this.getAllEvents()
    return JSON.stringify(events, null, 2)
  }

  /**
   * Serialize events as a CSV string (UTF-8, RFC 4180 compliant).
   * Pass a droneId to export only that drone's events.
   */
  exportCSV(droneId?: string): string {
    const events = droneId ? this.getEvents(droneId) : this.getAllEvents()
    const header = 'timestamp,droneId,type,message'
    const rows = events.map(
      (e) =>
        `${e.timestamp},${e.droneId},${e.type},"${e.message.replace(/"/g, '""')}"`,
    )
    return [header, ...rows].join('\n')
  }
}

/** Singleton — imported by all subsystems that need to log events. */
export const flightEventLog = new FlightEventLog()
