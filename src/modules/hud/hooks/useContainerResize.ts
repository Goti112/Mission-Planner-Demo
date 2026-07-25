/**
 * useContainerResize.ts
 *
 * Advanced ResizeObserver hook for tracking parent container dimensions.
 * Used to notify the PFD of layout changes in floating or viewport modes.
 *
 * Benefits:
 * - Detects when the floating panel changes size
 * - Coordinates ResponseObserver between child canvas elements
 * - Prevents Black Bars: ensures grid fills entire container
 * - Handles rapid window resizing smoothly
 *
 * Usage:
 *   const containerRef = useRef<HTMLDivElement>(null);
 *   const [containerSize, setContainerSize] = useState({ w: 0, h: 0 });
 *   useContainerResize(containerRef, (width, height) => {
 *     setContainerSize({ w: width, h: height });
 *   });
 */

import { useEffect, useRef } from 'react';

/**
 * Callback fired when container size changes.
 * @param width  CSS width of container in pixels
 * @param height CSS height of container in pixels
 */
export type ContainerResizeCallback = (width: number, height: number) => void;

/**
 * Observes a container element and calls the callback when its size changes.
 * Debounces rapid changes to prevent excessive callbacks.
 *
 * @param containerRef React ref to the container element
 * @param onResize     Callback invoked with (width, height) on resize
 */
export function useContainerResize(
  containerRef: React.RefObject<HTMLElement | null>,
  onResize: ContainerResizeCallback,
): void {
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const ro = new ResizeObserver((entries) => {
      if (debounceRef.current) clearTimeout(debounceRef.current);

      debounceRef.current = setTimeout(() => {
        for (const entry of entries) {
          const { width, height } = entry.contentRect;
          if (width > 0 && height > 0) {
            onResize(width, height);
          }
        }
      }, 6); // 6ms debounce for smooth resizing
    });

    ro.observe(container);

    return () => {
      ro.disconnect();
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [containerRef, onResize]);
}

/**
 * Get the ideal grid column layout for a given container width.
 * Adjusts tape column widths based on available space to maintain readability.
 *
 * @param width Container width in pixels
 * @returns CSS grid-template-columns string
 */
export function getResponsiveGridColumns(width: number): string {
  if (width < 400) {
    // Extra tight: very narrow columns
    return '50px 1fr 50px 44px';
  } else if (width < 500) {
    // Tight: sidebar proportions
    return '60px 1fr 60px 54px';
  } else if (width < 700) {
    // Medium: balanced
    return '75px 1fr 75px 64px';
  } else if (width < 1000) {
    // Large: floating window
    return '90px 1fr 90px 76px';
  } else {
    // Extra large: full viewport
    return '110px 1fr 110px 82px';
  }
}

/**
 * Get the ideal grid row layout for a given container height.
 * Adjusts heading tape and main instrument heights for readability.
 *
 * @param height Container height in pixels
 * @returns CSS grid-template-rows string
 */
export function getResponsiveGridRows(height: number): string {
  if (height < 300) {
    // Extra tight: minimal heading
    return '24px 1fr';
  } else if (height < 400) {
    // Tight: standard heading
    return '32px 1fr';
  } else if (height < 600) {
    // Medium: larger heading
    return '40px 1fr';
  } else {
    // Large: full viewport heading
    return '54px 1fr';
  }
}
