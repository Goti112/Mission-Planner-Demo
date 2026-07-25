/**
 * ControlSurfaceSingleCanvas.tsx
 *
 * rAF + ResizeObserver wrapper for one control surface column.
 * Uses ControlSurfaceInstrument (singular) — same pattern as ControlSurfacesPanel.
 */

import React, { useEffect, useMemo, useRef } from 'react';
import type { FlightTelemetry } from '../../telemetry';
import { ControlSurfaceInstrument } from '../instruments/ControlSurfaceInstrument';
import type { SurfaceId, ZoneFlags } from '../instruments/ControlSurfaceInstrument';
import type { SnapshotProvider } from '../hooks/useHUDLoop';
import { useHUDResize } from '../hooks/useHUDResize';
import type { CanvasInstrumentPair } from '../hooks/useHUDResize';

export interface ControlSurfaceSingleCanvasProps {
  surface: SurfaceId;
  zones: ZoneFlags;
  telemetry: FlightTelemetry;
  snapshotProvider?: React.RefObject<SnapshotProvider | null>;
  style?: React.CSSProperties;
}

const clamp = (value: number, min: number, max: number): number =>
  value < min ? min : value > max ? max : value;

const applyDeadband = (next: number, prev: number, deadband: number): number =>
  Math.abs(next - prev) < deadband ? prev : next;

const smoothAxis = (
  nextRaw: number,
  prevSmoothed: number,
  dtMs: number,
  min: number,
  max: number,
): number => {
  const deadband = 0.8;
  const tauMs = 120;
  const ratePerSecond = 260;
  const dtSec = dtMs / 1000;
  const alpha = clamp(dtMs / (tauMs + dtMs), 0.08, 0.55);
  const target = applyDeadband(nextRaw, prevSmoothed, deadband);
  const ema = prevSmoothed + (target - prevSmoothed) * alpha;
  const maxDelta = ratePerSecond * dtSec;
  const limited = clamp(ema, prevSmoothed - maxDelta, prevSmoothed + maxDelta);
  return clamp(limited, min, max);
};

const ControlSurfaceSingleCanvas: React.FC<ControlSurfaceSingleCanvasProps> = ({
  surface,
  zones,
  telemetry,
  style,
}) => {
  const containerRef  = useRef<HTMLDivElement>(null);
  const canvasRef     = useRef<HTMLCanvasElement>(null);
  const instrumentRef = useRef<ControlSurfaceInstrument | null>(null);
  const telemetryRef  = useRef<FlightTelemetry>(telemetry);
  const smoothedRef = useRef<FlightTelemetry>(telemetry);
  const rafIdRef      = useRef<number>(0);
  const lastDbgLogRef = useRef<number>(0);
  const lastFrameMsRef = useRef<number>(0);

  // Keep telemetryRef in sync with the prop
  useEffect(() => {
    telemetryRef.current = telemetry;
    if (!smoothedRef.current) {
      smoothedRef.current = telemetry;
    }
  });

  // Instantiate the instrument after canvas mounts and whenever the surface changes
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    instrumentRef.current = new ControlSurfaceInstrument(canvas, surface);
    return () => {
      instrumentRef.current?.destroy();
      instrumentRef.current = null;
    };
  }, [surface]);

  // Sync zones into the instrument whenever they or the surface change
  useEffect(() => {
    const instrument = instrumentRef.current;
    const container = containerRef.current;
    if (!instrument || !container) return;

    instrument.setZones(zones);

    const { width, height } = container.getBoundingClientRect();
    if (width > 0 && height > 0) {
      instrument.resize(width, height);
    }
  }, [surface, zones]);

  // rAF draw loop
  useEffect(() => {
    let active = true;

    const loop = (): void => {
      if (!active) return;

      const instrument = instrumentRef.current;
      if (instrument) {
        // Control surfaces must follow the latest real servo telemetry directly.
        // The PFD snapshotProvider is intentionally delayed/interpolated for
        // attitude/altitude smoothing and can hold stale surface values.
        const snap = telemetryRef.current;
        const nowMs = performance.now();
        const prevFrameMs = lastFrameMsRef.current > 0 ? lastFrameMsRef.current : nowMs - 16;
        const dtMs = clamp(nowMs - prevFrameMs, 8, 80);
        lastFrameMsRef.current = nowMs;
        const prev = smoothedRef.current;
        const next = snap.controlSurfaces;
        const prevCs = prev.controlSurfaces;
        const smoothedControlSurfaces = {
          aileronPct: smoothAxis(next.aileronPct, prevCs.aileronPct, dtMs, -100, 100),
          elevatorPct: smoothAxis(next.elevatorPct, prevCs.elevatorPct, dtMs, -100, 100),
          rudderPct: smoothAxis(next.rudderPct, prevCs.rudderPct, dtMs, -100, 100),
          throttlePct: smoothAxis(next.throttlePct, prevCs.throttlePct, dtMs, 0, 100),
          flapsPct: smoothAxis(next.flapsPct, prevCs.flapsPct, dtMs, 0, 100),
        };
        const smoothedSnap: FlightTelemetry = {
          ...snap,
          controlSurfaces: smoothedControlSurfaces,
        };
        smoothedRef.current = smoothedSnap;
        if (import.meta.env.DEV) {
          if (nowMs - lastDbgLogRef.current > 1500) {
            lastDbgLogRef.current = nowMs;
            console.info('[CANVAS DBG CTRL_SURFACE_SNAPSHOT]', {
              surface,
              controlSurfacesRaw: snap.controlSurfaces,
              controlSurfacesSmoothed: smoothedSnap.controlSurfaces,
              dtMs,
            });
          }
        }
        instrument.draw(smoothedSnap);
      }

      rafIdRef.current = requestAnimationFrame(loop);
    };

    rafIdRef.current = requestAnimationFrame(loop);
    return () => {
      active = false;
      cancelAnimationFrame(rafIdRef.current);
    };
  }, [surface]);

  // Resize observer
  const resizePairs = useMemo<CanvasInstrumentPair[]>(() => [
    {
      canvas:        canvasRef,
      getInstrument: () => instrumentRef.current ?? undefined,
    },
  ], []);

  useHUDResize(resizePairs);

  return (
    <div
      ref={containerRef}
      style={{ width: '100%', height: '100%', background: '#0f172a', overflow: 'hidden', ...style }}
    >
      <canvas
        ref={canvasRef}
        style={{ display: 'block', width: '100%', height: '100%' }}
      />
    </div>
  );
};

export default ControlSurfaceSingleCanvas;
export type { SurfaceId, ZoneFlags };
