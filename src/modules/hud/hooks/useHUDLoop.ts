/**
 * useHUDLoop.ts — OPTIMIZED v2
 *
 * ════════════════════════════════════════════════════════════════════════
 * ZERO-ALLOCATION rAF LOOP
 * ════════════════════════════════════════════════════════════════════════
 *
 * Data / render separation:
 *
 *   [TelemetryManager — 50–100 Hz]     [rAF loop — 60 Hz]
 *   MAVLink → normalize → smooth
 *                             └──▶ _snapshot (stored ref)
 *                                       │
 *                         getSnapshot() ┘  ← returns ref, ZERO alloc
 *                                       │
 *                         horizon.draw(snap)
 *                         speed.draw(snap)
 *                         altitude.draw(snap)
 *                         ...
 *
 * GC analysis
 * ───────────
 * Data path (50–100 Hz, NOT in this hook):
 *   TelemetryManager._normalize() + SmoothingEngine.update() together
 *   create ~2 short-lived objects per MAVLink frame.  V8 young-gen GC
 *   handles this with no observable pause (<< 1 ms).
 *
 * Render path (60 Hz, THIS HOOK — ZERO HEAP ALLOCATIONS):
 *   getSnapshot()               → returns stored pointer
 *   drawList[i].draw(snap)      → reads pointer, writes pixels via ctx
 *   requestAnimationFrame(loop) → stores a number in rafIdRef.current
 *   Total per rAF frame:        ZERO heap allocations
 *
 * Why data rate ≠ render rate is correct
 * ───────────────────────────────────────
 * If MAVLink > 60 Hz: some incoming frames are silently skipped.
 * If MAVLink < 60 Hz: the same snapshot is drawn multiple times.
 * Instruments show the last known value — correct avionics behaviour.
 *
 * How to avoid GC spikes — the three rules
 * ─────────────────────────────────────────
 * 1. Never allocate inside the rAF callback (no {}, [], template literals).
 *    Cache font strings in resize(), not in draw().
 *    Use String(Math.round(n)) not n.toFixed(0) — V8 interns integers.
 * 2. Keep the snapshot as a single mutable reference (JS is single-threaded).
 * 3. Instrument draw() precalculates all layout in resize() as class fields.
 *
 * WebGL / Synthetic Vision path (future)
 * ───────────────────────────────────────
 *   const loop = () => {
 *     const snap = manager.getSnapshot();   // 0 alloc
 *     for (let i = 0; i < n; i++) drawList[i].draw(snap);   // Canvas 2D
 *     svRenderer.updateUniforms(snap);   // writes pre-allocated Float32Array
 *     svRenderer.render();               // WebGL drawArrays — 0 JS alloc
 *     rAF(loop);
 *   };
 */

import { useEffect, useRef } from 'react';
import type { SnapshotProvider } from '../../telemetry';
import type { CanvasInstrument } from '../core/CanvasInstrument';
export type { SnapshotProvider } from '../../telemetry';

// ── Instrument map ────────────────────────────────────────────────────────

export type InstrumentMap = {
  horizon?:   CanvasInstrument;
  speed?:     CanvasInstrument;
  altitude?:  CanvasInstrument;
  vsi?:       CanvasInstrument;
  heading?:   CanvasInstrument;
  waypoint?:  CanvasInstrument;
  throttle?:  CanvasInstrument;
};

// ── Hook ─────────────────────────────────────────────────────────────────

/**
 * Starts a single global requestAnimationFrame loop driving all HUD instruments.
 *
 * @param managerRef   Ref to any SnapshotProvider (TelemetryManager or adapter).
 *                     getSnapshot() is called once per frame — zero allocation.
 * @param instruments  Ref to the InstrumentMap (populated after canvas mount).
 *                     Read once at start (and on visibility-resume) to build
 *                     a flat draw list; NOT accessed per frame.
 */
export function useHUDLoop(
  managerRef:  React.RefObject<SnapshotProvider | null>,
  instruments: React.RefObject<InstrumentMap>,
): void {
  const rafIdRef = useRef<number>(0);

  useEffect(() => {
    let active = true;

    // ── Pre-build draw list ───────────────────────────────────────────
    // Flat array avoids per-frame property-name lookups on InstrumentMap.
    // Render order: back (horizon) → front (overlays).
    let drawList: CanvasInstrument[] = [];
    let drawListLen = 0;

    const buildDrawList = (): void => {
      const inst = instruments.current;
      drawList = [];
      if (inst.horizon)  drawList.push(inst.horizon);
      if (inst.speed)    drawList.push(inst.speed);
      if (inst.altitude) drawList.push(inst.altitude);
      if (inst.vsi)      drawList.push(inst.vsi);
      if (inst.heading)  drawList.push(inst.heading);
      if (inst.waypoint) drawList.push(inst.waypoint);
      if (inst.throttle) drawList.push(inst.throttle);
      drawListLen = drawList.length;
    };

    buildDrawList();

    // ── rAF callback — ZERO-ALLOCATION ZONE ──────────────────────────
    // Nothing inside this function may allocate on the heap.
    // Review every change against this contract.
    const loop = (): void => {
      if (!active) return;

      const manager = managerRef.current;
      if (manager !== null && manager !== undefined) {
        // Prefer extrapolated snapshot (PFDInterpolationBuffer or FF).
        // Falls back to raw snapshot if not available (e.g. test adapters).
        const snap = manager.getExtrapolatedSnapshot
          ? manager.getExtrapolatedSnapshot(performance.now())
          : manager.getSnapshot();

        for (let i = 0; i < drawListLen; i++) {
          drawList[i].draw(snap);
        }
      }

      rafIdRef.current = requestAnimationFrame(loop);
    };

    // ── Tab visibility optimisation ───────────────────────────────────
    const onVisibility = (): void => {
      if (document.hidden) {
        active = false;
        cancelAnimationFrame(rafIdRef.current);
      } else {
        active = true;
        buildDrawList(); // re-resolve instruments that may have changed
        rafIdRef.current = requestAnimationFrame(loop);
      }
    };

    document.addEventListener('visibilitychange', onVisibility);
    rafIdRef.current = requestAnimationFrame(loop);

    return (): void => {
      active = false;
      cancelAnimationFrame(rafIdRef.current);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [instruments, managerRef]);
}
