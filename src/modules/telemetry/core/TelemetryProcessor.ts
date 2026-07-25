/**
 * TelemetryProcessor.ts
 *
 * ════════════════════════════════════════════════════════════════════════
 * TELEMETRY PROCESSOR — Event-aware wrapper around TelemetryManager
 * ════════════════════════════════════════════════════════════════════════
 *
 * Wraps an existing TelemetryManager instance and publishes telemetry
 * events to the EventBus. This layer adds:
 *
 *   • Event emission for every normalized telemetry frame
 *   • Event emission for derived data updates
 *   • Rate tracking (frames per second)
 *   • Health monitoring (stale data detection)
 *   • No replacement of TelemetryManager — purely additive
 *
 * ── Data flow ────────────────────────────────────────────────────────────
 *
 *   TelemetrySource → TelemetryManager → TelemetryProcessor
 *                                              ↓
 *                                         EventBus emissions
 *                                              ↓
 *                                     DroneManager / UI / Logs
 *
 * ── Usage ────────────────────────────────────────────────────────────────
 *
 *   const processor = new TelemetryProcessor('drone-1', manager);
 *   // Events are now emitted automatically
 *
 *   // Access rate stats
 *   processor.getStats();
 *
 *   // Cleanup
 *   processor.destroy();
 *
 * @author  GCS Engineering
 */

import type { TelemetryManager } from './TelemetryManager';
import { eventBus, GCSEvent } from '../../../shared/events';

// ── Rate tracking ───────────────────────────────────────────────────────

interface TelemetryStats {
  /** Frames received in the current 1-second window. */
  currentFps: number;
  /** Average frames per second over the last 10 windows. */
  averageFps: number;
  /** Total frames processed since construction. */
  totalFrames: number;
  /** Milliseconds since last frame was received. */
  timeSinceLastFrame: number;
  /** True if no data has been received for > 2 seconds. */
  isStale: boolean;
}

// ── Processor ───────────────────────────────────────────────────────────

export class TelemetryProcessor {
  private readonly _droneId: string;
  private readonly _manager: TelemetryManager;

  // ── Subscriptions ──
  private _unsubTelemetry: (() => void) | null = null;
  private _unsubDerived: (() => void) | null = null;

  // ── Rate tracking ──
  private _frameCount = 0;
  private _totalFrames = 0;
  private _lastFrameAt = 0;
  private _fpsHistory: number[] = [];
  private _fpsTimer: ReturnType<typeof setInterval> | null = null;
  private _currentFps = 0;

  // ── State ──
  private _destroyed = false;

  /** Stale threshold in milliseconds. */
  private static readonly STALE_THRESHOLD_MS = 2000;
  /** Maximum FPS history entries for averaging. */
  private static readonly FPS_HISTORY_SIZE = 10;

  constructor(droneId: string, manager: TelemetryManager) {
    this._droneId = droneId;
    this._manager = manager;

    this._attachListeners();
    this._startRateTracking();
  }

  // ── Public API ────────────────────────────────────────────────────────

  /** The drone ID this processor is bound to. */
  get droneId(): string {
    return this._droneId;
  }

  /** The underlying TelemetryManager — for direct access when needed. */
  get manager(): TelemetryManager {
    return this._manager;
  }

  /** Get current telemetry rate statistics. */
  getStats(): TelemetryStats {
    const now = Date.now();
    const timeSinceLastFrame = this._lastFrameAt > 0 ? now - this._lastFrameAt : Infinity;
    const avgFps = this._fpsHistory.length > 0
      ? this._fpsHistory.reduce((a, b) => a + b, 0) / this._fpsHistory.length
      : 0;

    return {
      currentFps: this._currentFps,
      averageFps: Math.round(avgFps * 10) / 10,
      totalFrames: this._totalFrames,
      timeSinceLastFrame,
      isStale: timeSinceLastFrame > TelemetryProcessor.STALE_THRESHOLD_MS,
    };
  }

  /** Clean up — unsubscribe from manager and stop rate tracking. */
  destroy(): void {
    if (this._destroyed) return;
    this._destroyed = true;

    this._unsubTelemetry?.();
    this._unsubDerived?.();
    this._unsubTelemetry = null;
    this._unsubDerived = null;

    if (this._fpsTimer !== null) {
      clearInterval(this._fpsTimer);
      this._fpsTimer = null;
    }
  }

  // ── Internal ──────────────────────────────────────────────────────────

  /**
   * Attach to the TelemetryManager's output callbacks.
   * We subscribe to both normalized telemetry and derived data.
   */
  private _attachListeners(): void {
    // ── Normalized telemetry ──
    this._unsubTelemetry = this._manager.onTelemetry(() => {
      this._frameCount++;
      this._totalFrames++;
      this._lastFrameAt = Date.now();

      eventBus.emit(GCSEvent.TELEMETRY_NORMALIZED, {
        droneId: this._droneId,
        timestamp: Date.now(),
      });
    });

    // ── Derived data ──
    this._unsubDerived = this._manager.onDerived(() => {
      eventBus.emit(GCSEvent.TELEMETRY_DERIVED, {
        droneId: this._droneId,
        timestamp: Date.now(),
      });
    });
  }

  /**
   * Start a 1-second interval that samples frame count for FPS tracking.
   */
  private _startRateTracking(): void {
    this._fpsTimer = setInterval(() => {
      this._currentFps = this._frameCount;
      this._fpsHistory.push(this._currentFps);
      if (this._fpsHistory.length > TelemetryProcessor.FPS_HISTORY_SIZE) {
        this._fpsHistory.shift();
      }
      this._frameCount = 0;
    }, 1000);
  }
}
