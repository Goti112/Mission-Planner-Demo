/**
 * flightEventStore.ts — Zustand store for the Flight Event Log
 *
 * Reactive storage for FlightEvent records, organized per drone.
 * Capped at MAX_PER_DRONE events per drone (oldest removed first).
 *
 * Source of truth for the FlightLogPanel UI.
 * Updated by the mission FlightEventLog service.
 */

import { create } from 'zustand'
import type { FlightEvent } from '../../../types/FlightEvent'
import { MAX_EVENTS_PER_DRONE } from '../../../shared/config/constants'

/** Maximum events retained per drone before old ones are pruned. */
const MAX_PER_DRONE = MAX_EVENTS_PER_DRONE

interface FlightEventState {
  /** droneId → ordered event array (oldest first). */
  events: Record<string, FlightEvent[]>

  /** Record a new event for a drone. Prunes oldest when limit is exceeded. */
  logEvent: (droneId: string, type: string, message: string) => void

  /** Delete all events for a given drone. */
  clearDrone: (droneId: string) => void

  /** Delete all events for all drones. */
  clearAll: () => void
}

export const useFlightEventStore = create<FlightEventState>((set) => ({
  events: {},

  logEvent(droneId, type, message) {
    const event: FlightEvent = { timestamp: Date.now(), droneId, type, message }
    set((state) => {
      const prev = state.events[droneId] ?? []
      const next = [...prev, event]
      return {
        events: {
          ...state.events,
          [droneId]:
            next.length > MAX_PER_DRONE
              ? next.slice(next.length - MAX_PER_DRONE)
              : next,
        },
      }
    })
  },

  clearDrone(droneId) {
    set((state) => {
      const { [droneId]: _removed, ...rest } = state.events
      return { events: rest }
    })
  },

  clearAll() {
    set({ events: {} })
  },
}))
