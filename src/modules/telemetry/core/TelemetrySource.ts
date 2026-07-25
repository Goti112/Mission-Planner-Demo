/**
 * TelemetrySource.ts
 *
 * ════════════════════════════════════════════════════════════════════════
 * INTERFACE CONTRACT FOR ALL TELEMETRY SOURCES
 * ════════════════════════════════════════════════════════════════════════
 *
 * Every data source — simulation, MAVLink serial, MAVLink UDP, ROS2 bridge,
 * replay file — implements this interface.
 *
 * TelemetryManager depends only on this interface, never on a concrete source.
 * This allows hot-swapping sources at runtime without restarting the HUD.
 *
 * ── Data flow ────────────────────────────────────────────────────────────
 *
 *   ┌─────────────────────────┐
 *   │  TelemetrySource (impl) │
 *   │  - serial / UDP / sim   │
 *   └────────────┬────────────┘
 *                │ onData → TelemetryRawData
 *                ▼
 *   ┌────────────────────────┐
 *   │   TelemetryManager     │   normalize ─▶ smooth ─▶ derive ─▶ publish
 *   └────────────────────────┘
 *
 * ── Lifecycle ────────────────────────────────────────────────────────────
 *
 *   1. Construct:  new ConcreteSource(config)
 *   2. Subscribe:  source.onData(cb)   — register before start()
 *   3. Start:      source.start()      — opens connection / begins emitting
 *   4. ...running...
 *   5. Stop:       source.stop()       — closes connection / cancels timer
 *
 * After stop() the source must emit no more data callbacks.
 * Re-calling start() after stop() must work without re-instantiating.
 *
 * ── Threading note ───────────────────────────────────────────────────────
 * All callbacks fire on the main thread (no Workers here).
 * The callback must be non-blocking; heavy computation belongs in the manager.
 *
 * ── Error contract ───────────────────────────────────────────────────────
 * onError callbacks receive Error objects.
 * The source continues operating after a recoverable error.
 * A fatal error triggers onError and then automatically calls stop().
 */

import type { TelemetryRawData } from './FlightTelemetryModel';

const describeUnknownError = (error: unknown): string => {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
};

const createListenerError = (context: string, error: unknown): Error =>
  new Error(`${context}: ${describeUnknownError(error)}`);

// ── Source status ─────────────────────────────────────────────────────────

export const SourceStatus = {
  IDLE:        'IDLE',         // constructed, not yet started
  CONNECTING:  'CONNECTING',   // start() called, not yet receiving data
  ACTIVE:      'ACTIVE',       // receiving data normally
  DEGRADED:    'DEGRADED',     // receiving data but with errors / gaps
  STOPPED:     'STOPPED',      // stop() was called
  ERROR:       'ERROR',        // fatal error — requires restart
} as const;
export type SourceStatus = typeof SourceStatus[keyof typeof SourceStatus];

// ── Source metadata ───────────────────────────────────────────────────────

export interface SourceInfo {
  /** Human-readable identifier shown in GCS status bar. */
  name:       string;
  /** Transport type for diagnostics. */
  transport:  'simulation' | 'mavlink-serial' | 'mavlink-udp' | 'mavlink-tcp' | 'replay' | 'custom';
  /** Optional description of the current configuration. */
  description?: string;
}

// ── Main interface ────────────────────────────────────────────────────────

export interface TelemetrySource {
  /** Metadata about this source implementation. */
  readonly info: SourceInfo;

  /** Current lifecycle status of the source. */
  readonly status: SourceStatus;

  /**
   * Register a callback invoked for every incoming raw telemetry packet.
   *
   * Multiple listeners are supported.
   * Calling onData after start() is allowed but some initial packets may be missed.
   *
   * @returns  Unsubscribe function — call it to remove this specific listener.
   */
  onData(callback: (data: TelemetryRawData) => void): () => void;

  /**
   * Register a callback invoked when a non-fatal error occurs.
   * The source attempts to recover automatically.
   */
  onError(callback: (error: Error) => void): () => void;

  /**
   * Register a callback invoked when the source status changes.
   * Useful for status bar indicators in the GCS.
   */
  onStatusChange(callback: (status: SourceStatus) => void): () => void;

  /**
   * Open the connection and begin emitting TelemetryRawData.
   * Idempotent: calling start() on an already-ACTIVE source is a no-op.
   */
  start(): void;

  /**
   * Stop emitting data and release all resources (timers, sockets, etc.).
   * After stop(), no more data callbacks will fire.
   * Calling stop() on a STOPPED or IDLE source is a no-op.
   */
  stop(): void;
}

// ── Abstract base class ───────────────────────────────────────────────────
// Manages listener lists and status transitions so concrete subclasses
// only need to implement start() / stop() and call _emit() / _setStatus().

export abstract class BaseTelemetrySource implements TelemetrySource {
  abstract readonly info: SourceInfo;

  private _status: SourceStatus = SourceStatus.IDLE;
  private _dataListeners:   Set<(data: TelemetryRawData) => void>   = new Set();
  private _errorListeners:  Set<(error: Error) => void>              = new Set();
  private _statusListeners: Set<(status: SourceStatus) => void>      = new Set();

  get status(): SourceStatus {
    return this._status;
  }

  onData(callback: (data: TelemetryRawData) => void): () => void {
    this._dataListeners.add(callback);
    return () => this._dataListeners.delete(callback);
  }

  onError(callback: (error: Error) => void): () => void {
    this._errorListeners.add(callback);
    return () => this._errorListeners.delete(callback);
  }

  onStatusChange(callback: (status: SourceStatus) => void): () => void {
    this._statusListeners.add(callback);
    return () => this._statusListeners.delete(callback);
  }

  abstract start(): void;
  abstract stop(): void;

  // ── Protected helpers for subclasses ────────────────────────────────

  /** Emit a raw telemetry packet to all registered listeners. */
  protected _emit(data: TelemetryRawData): void {
    for (const cb of [...this._dataListeners]) {
      try {
        cb(data);
      } catch (error) {
        this._emitError(createListenerError('TelemetrySource data listener failed', error));
      }
    }
  }

  /** Emit an error to all registered error listeners. */
  protected _emitError(error: Error): void {
    for (const cb of [...this._errorListeners]) {
      try {
        cb(error);
      } catch (listenerError) {
        console.error('[TelemetrySource] Error listener failed', {
          error: describeUnknownError(listenerError),
          sourceError: error.message,
        });
      }
    }
  }

  /** Transition to a new status and notify listeners. */
  protected _setStatus(status: SourceStatus): void {
    if (this._status === status) return;
    this._status = status;
    for (const cb of [...this._statusListeners]) {
      try {
        cb(status);
      } catch (error) {
        this._emitError(createListenerError('TelemetrySource status listener failed', error));
      }
    }
  }

  /** Remove all listeners. Call in stop() to prevent leaks. */
  protected _clearListeners(): void {
    this._dataListeners.clear();
    this._errorListeners.clear();
    this._statusListeners.clear();
  }
}
