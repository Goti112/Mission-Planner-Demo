/**
 * ControlSurfacesPanel.tsx
 *
 * Standalone React wrapper around ControlSurfacesInstrument.
 * Manages its own rAF loop and ResizeObserver.
 *
 * Uses snapshotProvider (zero-copy read) when available, falls back to the
 * telemetry prop (React state path, one-frame latency).
 */

import React, { useEffect, useMemo, useRef } from 'react';

import type { FlightTelemetry } from '../../telemetry';
import { ControlSurfacesInstrument } from '../instruments/ControlSurfacesInstrument';
import type { SnapshotProvider } from '../hooks/useHUDLoop';
import { useHUDResize } from '../hooks/useHUDResize';
import type { CanvasInstrumentPair } from '../hooks/useHUDResize';
import type { ControlPanelResolvedLayout } from './controlSurfacesPanelLayout';

// ── Props ─────────────────────────────────────────────────────────────────

export interface ControlSurfacesPanelProps {
  /** Normalized telemetry (React state path — fallback). */
  telemetry: FlightTelemetry;
  /**
   * Optional zero-copy snapshot source (TelemetryManager ref).
   * When provided, the rAF loop reads directly from the manager,
   * eliminating one React commit delay.
   */
  snapshotProvider?: React.RefObject<SnapshotProvider | null>;
  /** Canvas drawing layout. Defaults to horizontal when omitted. */
  layout?: ControlPanelResolvedLayout;
}

// ── Component ─────────────────────────────────────────────────────────────

const ControlSurfacesPanel: React.FC<ControlSurfacesPanelProps> = ({
  telemetry,
  snapshotProvider,
  layout = 'horizontal',
}) => {
  const canvasRef     = useRef<HTMLCanvasElement>(null);
  const instrumentRef = useRef<ControlSurfacesInstrument | null>(null);
  const telemetryRef  = useRef<FlightTelemetry>(telemetry);
  const rafIdRef      = useRef<number>(0);

  // Keep telemetryRef in sync with the prop (no stale-closure issues in rAF)
  useEffect(() => {
    telemetryRef.current = telemetry;
  });

  // Instantiate the instrument once after canvas mounts
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    instrumentRef.current = new ControlSurfacesInstrument(canvas);
    return () => {
      instrumentRef.current?.destroy();
      instrumentRef.current = null;
    };
  }, []);

  // Sync layout changes into the instrument
  useEffect(() => {
    instrumentRef.current?.setLayout(layout);
  }, [layout]);

  // rAF draw loop
  useEffect(() => {
    let active = true;

    const loop = (): void => {
      if (!active) return;

      const instrument = instrumentRef.current;
      if (instrument) {
        const snap = snapshotProvider?.current?.getExtrapolatedSnapshot
          ? snapshotProvider.current.getExtrapolatedSnapshot(performance.now())
          : snapshotProvider?.current?.getSnapshot() ?? telemetryRef.current;
        instrument.draw(snap);
      }

      rafIdRef.current = requestAnimationFrame(loop);
    };

    rafIdRef.current = requestAnimationFrame(loop);
    return () => {
      active = false;
      cancelAnimationFrame(rafIdRef.current);
    };
  }, [snapshotProvider]);

  // Resize observer
  const resizePairs = useMemo<CanvasInstrumentPair[]>(() => [
    {
      canvas:        canvasRef,
      getInstrument: () => instrumentRef.current ?? undefined,
    },
  ], []);

  useHUDResize(resizePairs);

  return (
    <div style={{ width: '100%', height: '100%', background: '#0f172a', overflow: 'hidden' }}>
      <canvas
        ref={canvasRef}
        style={{ display: 'block', width: '100%', height: '100%' }}
      />
    </div>
  );
};

export default ControlSurfacesPanel;
