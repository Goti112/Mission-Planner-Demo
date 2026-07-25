/**
 * HUDDebugOverlay.tsx
 *
 * Overlay de diagnóstico para el HUD de vuelo.
 * Muestra métricas de rendimiento en tiempo real:
 *   - FPS real del rAF loop
 *   - Δt entre snapshots (frecuencia de telemetría efectiva)
 *   - Lag E2E: timestamp MAVLink → render frame actual
 *   - Modo del interpolador: LERP / PREDICT / HOLD
 *
 * Uso: activar con prop `showDebugOverlay` en FlightHUD.
 * Solo para desarrollo/diagnóstico.
 */

import React, { useEffect, useRef, useState } from 'react';
import type { FlightTelemetry } from '../../telemetry';

export interface HUDDebugStats {
  /** FPS medido como promedio de los últimos 30 frames del rAF. */
  fps: number;
  /** Δt entre los últimos dos snapshots de telemetría (ms). 0 = sin cambio en este frame. */
  snapshotDeltaMs: number;
  /** Lag E2E: diferencia entre Date.now() y el timestamp del snapshot (ms). */
  e2eLatencyMs: number;
  /**
   * Modo actual del interpolador (heurístico):
   * - LERP    : interpolando normalmente entre A y B
   * - PREDICT : dead-reckoning (packet overdue, dentro del cap)
   * - HOLD    : último snapshot confirmado (sin actualizar)
   * - BOOT    : sin datos todavía
   */
  interpMode: 'LERP' | 'PREDICT' | 'HOLD' | 'BOOT';
}

interface HUDDebugOverlayProps {
  /** Función que devuelve el último snapshot de telemetría. Llamada cada frame. */
  getSnapshot: () => Readonly<FlightTelemetry>;
}

const FPS_WINDOW = 30;

export const HUDDebugOverlay: React.FC<HUDDebugOverlayProps> = ({ getSnapshot }) => {
  const [stats, setStats] = useState<HUDDebugStats>({
    fps: 0,
    snapshotDeltaMs: 0,
    e2eLatencyMs: 0,
    interpMode: 'BOOT',
  });

  const frameTimes      = useRef<number[]>([]);
  const lastSnapTs      = useRef<number>(0);
  const lastSnapTimestamp = useRef<number>(0);
  const rafRef          = useRef<number>(0);

  useEffect(() => {
    let active = true;

    const loop = (now: number): void => {
      if (!active) return;

      // ── FPS ────────────────────────────────────────────────────────
      frameTimes.current.push(now);
      if (frameTimes.current.length > FPS_WINDOW) frameTimes.current.shift();
      let fps = 0;
      if (frameTimes.current.length >= 2) {
        const span = frameTimes.current[frameTimes.current.length - 1] - frameTimes.current[0];
        fps = Math.round(((frameTimes.current.length - 1) / span) * 1000);
      }

      // ── Snapshot delta + E2E latency ────────────────────────────────
      const snap    = getSnapshot();
      const wallNow = Date.now();

      let snapshotDeltaMs = 0;
      if (lastSnapTimestamp.current !== snap.timestamp) {
        snapshotDeltaMs = lastSnapTs.current > 0 ? wallNow - lastSnapTs.current : 0;
        lastSnapTs.current        = wallNow;
        lastSnapTimestamp.current = snap.timestamp;
      }

      const e2eLatencyMs = snap.timestamp > 0
        ? Math.max(0, wallNow - snap.timestamp)
        : 0;

      // ── Interpolator mode (heuristic) ────────────────────────────────
      let interpMode: HUDDebugStats['interpMode'] = 'BOOT';
      if (snap.timestamp > 0) {
        if (snapshotDeltaMs > 0) {
          interpMode = 'LERP';
        } else if (e2eLatencyMs > 0 && e2eLatencyMs <= 200) {
          interpMode = 'PREDICT';
        } else if (e2eLatencyMs > 200) {
          interpMode = 'HOLD';
        }
      }

      setStats({
        fps,
        snapshotDeltaMs: Math.round(snapshotDeltaMs),
        e2eLatencyMs:    Math.round(e2eLatencyMs),
        interpMode,
      });

      rafRef.current = requestAnimationFrame(loop);
    };

    rafRef.current = requestAnimationFrame(loop);
    return () => {
      active = false;
      cancelAnimationFrame(rafRef.current);
    };
  }, [getSnapshot]);

  const modeColor: Record<HUDDebugStats['interpMode'], string> = {
    LERP:    '#00ff88',
    PREDICT: '#ffcc00',
    HOLD:    '#ff6600',
    BOOT:    '#888888',
  };

  return (
    <div
      style={{
        position:      'absolute',
        top:           8,
        right:         8,
        background:    'rgba(0,0,0,0.75)',
        color:         '#ffffff',
        fontFamily:    'monospace',
        fontSize:      12.1,
        padding:       '6px 10px',
        borderRadius:  4,
        lineHeight:    1.6,
        pointerEvents: 'none',
        zIndex:        9999,
        minWidth:      180,
      }}
    >
      <div style={{ color: '#aaaaaa', marginBottom: 4, fontSize: 11, letterSpacing: 1 }}>
        HUD DEBUG
      </div>
      <div>
        <span style={{ color: '#aaaaaa' }}>FPS    </span>
        <span style={{ color: stats.fps >= 55 ? '#00ff88' : stats.fps >= 30 ? '#ffcc00' : '#ff4444' }}>
          {stats.fps}
        </span>
      </div>
      <div>
        <span style={{ color: '#aaaaaa' }}>ΔSnap  </span>
        <span>{stats.snapshotDeltaMs > 0 ? `${stats.snapshotDeltaMs} ms` : '—'}</span>
      </div>
      <div>
        <span style={{ color: '#aaaaaa' }}>E2E    </span>
        <span style={{ color: stats.e2eLatencyMs < 100 ? '#00ff88' : stats.e2eLatencyMs < 300 ? '#ffcc00' : '#ff4444' }}>
          {stats.e2eLatencyMs > 0 ? `${stats.e2eLatencyMs} ms` : '—'}
        </span>
      </div>
      <div>
        <span style={{ color: '#aaaaaa' }}>INTERP </span>
        <span style={{ color: modeColor[stats.interpMode] }}>{stats.interpMode}</span>
      </div>
    </div>
  );
};
