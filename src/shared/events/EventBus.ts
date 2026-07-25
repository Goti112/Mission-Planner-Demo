/**
 * EventBus.ts
 *
 * ════════════════════════════════════════════════════════════════════════
 * TYPED EVENT BUS — Centralized pub/sub for the GCS architecture
 * ════════════════════════════════════════════════════════════════════════
 *
 * A lightweight, strongly-typed event bus that decouples subsystems.
 * Every architectural layer (DroneManager, MissionEngine, MAVLinkBridge,
 * SimulationEngine) publishes events here. UI components and other
 * subsystems subscribe without knowing the publisher.
 *
 * ── Design ──────────────────────────────────────────────────────────────
 *
 *   • Zero dependencies — pure TypeScript
 *   • Type-safe — TypeScript infers payload types from the event map
 *   • Singleton pattern — single bus for the entire application
 *   • Performance — Set-based listener storage, O(1) add/remove
 *   • Debug mode — optional console logging of all events (dev only)
 *   • No enums — uses `as const` objects for `erasableSyntaxOnly: true`
 *
 * ── Usage ────────────────────────────────────────────────────────────────
 *
 *   import { eventBus, GCSEvent } from './EventBus';
 *
 *   // Subscribe
 *   const unsub = eventBus.on(GCSEvent.DRONE_REGISTERED, (payload) => {
 *     console.log('New drone:', payload.droneId);
 *   });
 *
 *   // Publish
 *   eventBus.emit(GCSEvent.DRONE_REGISTERED, { droneId: 'drone-1' });
 *
 *   // One-time listener
 *   eventBus.once(GCSEvent.MISSION_COMPLETED, (payload) => { ... });
 *
 *   // Cleanup
 *   unsub();
 *
 * @author  GCS Engineering
 */

// ── Event Identifiers ───────────────────────────────────────────────────

/**
 * All event identifiers in the GCS system.
 * Uses `as const` object pattern (no TypeScript enums)
 * for compatibility with `erasableSyntaxOnly: true`.
 */
export const GCSEvent = {
  // ── Drone lifecycle ──
  DRONE_REGISTERED:    'drone:registered',
  DRONE_UNREGISTERED:  'drone:unregistered',
  DRONE_SELECTED:      'drone:selected',
  DRONE_STATE_UPDATED: 'drone:stateUpdated',

  // ── Telemetry ──
  TELEMETRY_RAW:       'telemetry:raw',
  TELEMETRY_NORMALIZED:'telemetry:normalized',
  TELEMETRY_DERIVED:   'telemetry:derived',
  TELEMETRY_SOURCE_CHANGED: 'telemetry:sourceChanged',

  // ── Mission lifecycle ──
  MISSION_CREATED:     'mission:created',
  MISSION_STARTED:     'mission:started',
  MISSION_PAUSED:      'mission:paused',
  MISSION_RESUMED:     'mission:resumed',
  MISSION_COMPLETED:   'mission:completed',
  MISSION_ABORTED:     'mission:aborted',
  MISSION_PROGRESS:    'mission:progress',
  MISSION_WAYPOINT_REACHED: 'mission:waypointReached',
  MISSION_STATE_CHANGED: 'mission:stateChanged',

  // ── Connection ──
  CONNECTION_OPENED:   'connection:opened',
  CONNECTION_CLOSED:   'connection:closed',
  CONNECTION_ERROR:    'connection:error',
  CONNECTION_HEARTBEAT:'connection:heartbeat',

  // ── Simulation ──
  SIMULATION_STARTED:  'simulation:started',
  SIMULATION_STOPPED:  'simulation:stopped',
  SIMULATION_MODE_CHANGED: 'simulation:modeChanged',

  // ── System ──
  SYSTEM_ERROR:        'system:error',
  SYSTEM_WARNING:      'system:warning',
} as const;

export type GCSEvent = typeof GCSEvent[keyof typeof GCSEvent];

// ── Event Payloads ──────────────────────────────────────────────────────

/**
 * Payload types for each event. Every event must have an entry here.
 * This map is the single source of truth for event shapes.
 */
export interface GCSEventPayloads {
  // ── Drone lifecycle ──
  [GCSEvent.DRONE_REGISTERED]:   { droneId: string; name: string };
  [GCSEvent.DRONE_UNREGISTERED]: { droneId: string };
  [GCSEvent.DRONE_SELECTED]:     { droneId: string | null; previousId: string | null };
  [GCSEvent.DRONE_STATE_UPDATED]: {
    droneId: string;
    position: { lat: number; lon: number; alt: number };
    attitude: { roll: number; pitch: number; yaw: number };
    velocity: { groundSpeed: number; verticalSpeed: number };
    battery: number;
    mode: string;
    armed: boolean;
  };

  // ── Telemetry ──
  [GCSEvent.TELEMETRY_RAW]:       { droneId: string; timestamp: number; messageCount: number };
  [GCSEvent.TELEMETRY_NORMALIZED]:{ droneId: string; timestamp: number };
  [GCSEvent.TELEMETRY_DERIVED]:   { droneId: string; timestamp: number };
  [GCSEvent.TELEMETRY_SOURCE_CHANGED]: { droneId: string; from: string; to: string };

  // ── Mission lifecycle ──
  [GCSEvent.MISSION_CREATED]:     { missionId: string; droneId: string; waypointCount: number };
  [GCSEvent.MISSION_STARTED]:     { missionId: string; droneId: string; waypointCount: number };
  [GCSEvent.MISSION_PAUSED]:      { missionId: string; droneId: string };
  [GCSEvent.MISSION_RESUMED]:     { missionId: string; droneId: string };
  [GCSEvent.MISSION_COMPLETED]:   { missionId: string; droneId: string; durationMs: number };
  [GCSEvent.MISSION_ABORTED]:     { missionId: string; droneId: string; reason: string };
  [GCSEvent.MISSION_PROGRESS]:    {
    missionId: string;
    droneId: string;
    currentWpIndex: number;
    totalWaypoints: number;
    segmentProgress: number;
    overallProgress: number;
  };
  [GCSEvent.MISSION_WAYPOINT_REACHED]: {
    missionId: string;
    droneId: string;
    waypointIndex: number;
    waypointId: string;
  };
  [GCSEvent.MISSION_STATE_CHANGED]: {
    droneId: string;
    from: string;
    to: string;
    missionId: string | null;
    timestamp: number;
  };

  // ── Connection ──
  [GCSEvent.CONNECTION_OPENED]:   { droneId: string; transport: string; url: string };
  [GCSEvent.CONNECTION_CLOSED]:   { droneId: string; reason: string };
  [GCSEvent.CONNECTION_ERROR]:    { droneId: string; error: string; recoverable: boolean };
  [GCSEvent.CONNECTION_HEARTBEAT]:{ droneId: string; latencyMs: number };

  // ── Simulation ──
  [GCSEvent.SIMULATION_STARTED]:  { droneId: string; rateHz: number };
  [GCSEvent.SIMULATION_STOPPED]:  { droneId: string };
  [GCSEvent.SIMULATION_MODE_CHANGED]: { droneId: string; mode: string };

  // ── System ──
  [GCSEvent.SYSTEM_ERROR]:        { source: string; message: string; stack?: string };
  [GCSEvent.SYSTEM_WARNING]:      { source: string; message: string };
}

// ── Listener type ───────────────────────────────────────────────────────

type EventCallback<E extends GCSEvent> = (payload: GCSEventPayloads[E]) => void;
type EventListenerRegistry = {
  [E in GCSEvent]?: Set<EventCallback<E>>;
};
type Unsubscribe = () => void;

// ── EventBus Class ──────────────────────────────────────────────────────

export class EventBus {
  /** Map of event type → Set of listener callbacks. */
  private _listeners: EventListenerRegistry = {};

  /** When true, all events are logged to console (dev diagnostics). */
  private _debug: boolean;

  /** Cumulative event counter for diagnostics. */
  private _eventCount = 0;

  /** Timestamp of construction — for uptime tracking. */
  private readonly _createdAt: number = Date.now();

  constructor(debug = false) {
    this._debug = debug;
  }

  // ── Public API ────────────────────────────────────────────────────────

  /**
   * Subscribe to an event type. Returns an unsubscribe function.
   *
   * @param event    The event identifier (from GCSEvent)
   * @param callback Handler that receives the typed payload
   * @returns        Unsubscribe function — call to remove this listener
   */
  on<E extends GCSEvent>(event: E, callback: EventCallback<E>): Unsubscribe {
    let listeners = this._listeners[event] as Set<EventCallback<E>> | undefined;
    if (listeners === undefined) {
      listeners = new Set();
      this._listeners[event] = listeners as EventListenerRegistry[E];
    }
    listeners.add(callback);
    const currentListeners = listeners;

    return () => {
      currentListeners.delete(callback);
      if (currentListeners.size === 0) {
        delete this._listeners[event];
      }
    };
  }

  /**
   * Subscribe to an event — callback fires at most once, then auto-unsubscribes.
   */
  once<E extends GCSEvent>(event: E, callback: EventCallback<E>): Unsubscribe {
    const unsub = this.on(event, (payload) => {
      unsub();
      callback(payload);
    });
    return unsub;
  }

  /**
   * Emit an event with its typed payload. All listeners fire synchronously
   * in insertion order.
   *
   * @param event   The event identifier
   * @param payload The event data (must match GCSEventPayloads[event])
   */
  emit<E extends GCSEvent>(event: E, payload: GCSEventPayloads[E]): void {
    this._eventCount++;

    if (this._debug && import.meta.env.DEV) {
      console.debug(`[EventBus] ${event}`, payload);
    }

    const listeners = this._listeners[event] as Set<EventCallback<E>> | undefined;
    if (listeners === undefined || listeners.size === 0) return;

    // Iterate over a snapshot to allow listeners to unsubscribe themselves
    for (const cb of [...listeners]) {
      try {
        cb(payload);
      } catch (err) {
        console.error(`[EventBus] Error in listener for "${event}":`, err);
      }
    }
  }

  /**
   * Remove all listeners for a specific event, or all listeners entirely.
   */
  off(event?: GCSEvent): void {
    if (event) {
      delete this._listeners[event];
    } else {
      this._listeners = {};
    }
  }

  /**
   * Check how many listeners are registered for a specific event.
   */
  listenerCount(event: GCSEvent): number {
    return this._listeners[event]?.size ?? 0;
  }

  /**
   * Total number of events emitted since construction.
   */
  get totalEventsEmitted(): number {
    return this._eventCount;
  }

  /**
   * Uptime in milliseconds since this EventBus was created.
   */
  get uptimeMs(): number {
    return Date.now() - this._createdAt;
  }

  /**
   * Enable or disable debug logging of all events.
   */
  setDebug(enabled: boolean): void {
    this._debug = enabled;
  }

  /**
   * Destroy the event bus — remove all listeners.
   */
  destroy(): void {
    this._listeners = {};
    this._eventCount = 0;
  }
}

// ── Singleton ───────────────────────────────────────────────────────────

/**
 * Global event bus instance — shared by all GCS subsystems.
 * Debug mode is auto-enabled in development builds.
 */
export const eventBus = new EventBus(
  typeof import.meta !== 'undefined' && import.meta.env?.DEV === true
);
