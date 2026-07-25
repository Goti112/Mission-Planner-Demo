/**
 * useHUDResize.ts
 *
 * DPI-aware ResizeObserver hook for canvas instruments.
 *
 * Key improvements:
 *  - Observes each instrument canvas individually for precision
 *  - Applies devicePixelRatio scaling to eliminate blurriness
 *  - Handles rapid resizing without flickering (debounced)
 *  - Supports both individual canvas observation and container-level tracking
 *
 * Design decisions:
 *  - Each canvas is observed independently → each instrument receives its own
 *    CSS-rendered dimensions. Critical for layouts where speed tape, altitude
 *    tape, and VSI all have different sizes.
 *  - getInstrument() is called lazily so it works even if the instrument
 *    is created in a subsequent useEffect (after canvas mount).
 *  - A single ResizeObserver handles all pairs efficiently.
 *  - devicePixelRatio is multiplied during resize to ensure sharp rendering
 *    at any screen DPI (Retina, 2x, 1.5x, etc).
 */

import { useEffect, useRef } from 'react';
import type { CanvasInstrument } from '../core/CanvasInstrument';

/**
 * Associates one canvas element with its CanvasInstrument instance.
 * Both must be stable across re-renders (refs and lazy getters satisfy this).
 */
export interface CanvasInstrumentPair {
  /** Ref to the canvas element to observe. */
  readonly canvas: React.RefObject<HTMLCanvasElement | null>;
  /**
   * Returns the CanvasInstrument for this canvas.
   * Called lazily each time a resize entry is processed.
   * Returns undefined if the instrument has not yet been instantiated.
   */
  readonly getInstrument: () => CanvasInstrument | undefined;
}

/**
 * Starts per-canvas ResizeObserver tracking for a set of canvas/instrument
 * pairs. When any canvas changes size, the matching instrument is resized
 * with DPI-aware scaling.
 *
 * DPI scaling ensures crisp rendering at any screen density:
 * - Internal canvas.width/height = CSS width/height × devicePixelRatio
 * - This prevents blurriness on high-DPI displays (Retina, 2x, etc)
 * - The instrument's internal rendering automatically scales by devicePixelRatio
 *
 * @param pairs  Stable array of canvas→instrument associations.
 *               Create once (e.g., with useMemo or at component scope)
 *               and pass the same reference every render.
 */
export function useHUDResize(
  pairs: ReadonlyArray<CanvasInstrumentPair>,
): void {
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const ro = new ResizeObserver((entries) => {
      // Clear any pending debounced updates
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }

      // Debounce rapid resizes to prevent excessive redraws
      debounceRef.current = setTimeout(() => {
        for (const entry of entries) {
          const target = entry.target as HTMLCanvasElement;
          const { width, height } = entry.contentRect;

          // Skip zero-sized entries (element not mounted/visible)
          if (width === 0 || height === 0) continue;

          // Find matching pair and resize instrument with DPI scaling
          for (const pair of pairs) {
            if (pair.canvas.current === target) {
              const instrument = pair.getInstrument();
              if (instrument) {
                // CanvasInstrument.resize() sets canvas.width/height (physical DPR
                // dimensions) and calls ctx.scale(dpr, dpr) internally.
                //
                // DO NOT set target.style.width / target.style.height here.
                // Inline px styles override the CSS `width: 100%; height: 100%`
                // on `.pfd-cell canvas`, locking the canvas to a fixed pixel size
                // and preventing the ResizeObserver from firing on subsequent
                // parent resizes — which causes all instruments (especially the
                // horizon, which has no CSS background fallback) to freeze at
                // their initial size and leave black voids in the grid.
                instrument.resize(width, height);
              }
              break;
            }
          }
        }
      }, 8); // 8ms debounce — imperceptible but prevents excessive redraws
    });

    // Start observing all canvas elements
    for (const pair of pairs) {
      const el = pair.canvas.current;
      if (el) ro.observe(el);
    }

    // Cleanup
    return () => {
      ro.disconnect();
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, [pairs]);
}
