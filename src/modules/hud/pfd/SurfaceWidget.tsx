/**
 * SurfaceWidget.tsx
 *
 * Floating draggable widget for one detached surface column.
 * Uses Pointer Events API for drag. Dispatches move() via context.
 */

import React, { useCallback, useRef, useState } from 'react';
import { X } from 'lucide-react';
import ControlSurfaceSingleCanvas from './ControlSurfaceSingleCanvas';
import { useDetachedSurfacesContext } from '../../../shared/contexts/DetachedSurfacesContext';
import type { SurfaceId, ZoneFlags } from '../instruments/ControlSurfaceInstrument';
import type { FlightTelemetry } from '../../telemetry';
import type { SnapshotProvider } from '../hooks/useHUDLoop';
import './SurfaceWidget.css';

const COLORS: Record<SurfaceId, string> = {
  ail: '#22d3ee', elv: '#f97316', rdr: '#a78bfa', thr: '#4ade80', flp: '#fbbf24',
};

const LABELS: Record<SurfaceId, string> = {
  ail: 'AIL', elv: 'ELV', rdr: 'RDR', thr: 'THR', flp: 'FLAPS',
};

export interface SurfaceWidgetProps {
  surface:           SurfaceId;
  x:                 number;
  y:                 number;
  width:             number;
  height:            number;
  layout:            'vertical' | 'horizontal' | 'grid';
  zones:             ZoneFlags;
  telemetry:         FlightTelemetry;
  snapshotProvider?: React.RefObject<SnapshotProvider | null>;
}

const SurfaceWidget: React.FC<SurfaceWidgetProps> = ({
  surface, x, y, width, height, layout, zones, telemetry, snapshotProvider,
}) => {
  const { reattach, move, setZones, setLayout } = useDetachedSurfacesContext();
  const [dragging, setDragging] = useState(false);
  const [resizing] = useState(false);
  const dragOriginRef = useRef<{ px: number; py: number; ox: number; oy: number } | null>(null);
// ── Drag handling (pointer events) ─────────────────────────────────────

  const onPointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    // Only left button
    if (e.button !== 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    setDragging(true);
    dragOriginRef.current = { px: e.clientX, py: e.clientY, ox: x, oy: y };
  }, [x, y]);

  const onPointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragOriginRef.current) return;
    const { px, py, ox, oy } = dragOriginRef.current;
    const nx = ox + (e.clientX - px);
    const ny = oy + (e.clientY - py);
    // Clamp to viewport
    const clampedX = Math.max(0, Math.min(nx, window.innerWidth  - width));
    const clampedY = Math.max(0, Math.min(ny, window.innerHeight - height));
    move(surface, clampedX, clampedY);
  }, [height, move, surface, width]);

  const onPointerUp = useCallback((_e: React.PointerEvent<HTMLDivElement>) => {
    dragOriginRef.current = null;
    setDragging(false);
  }, []);

  // ── Zone toggles ────────────────────────────────────────────────────────

  const toggleZone = useCallback((zone: keyof ZoneFlags) => {
    setZones(surface, { ...zones, [zone]: !zones[zone] });
  }, [setZones, surface, zones]);

  const color = COLORS[surface];

  return (
    <div
      className={`sw-widget${dragging ? ' sw-widget--dragging' : ''}${resizing ? ' sw-widget--resizing' : ''}`}
      style={{ left: x, top: y, width, height, '--sw-color': color } as React.CSSProperties}
    >
      {/* Header — drag handle */}
      <div
        className="sw-header"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        <span className="sw-dot" />
        <span className="sw-title">{LABELS[surface]}</span>
        <button
          className="sw-close"
          onClick={() => reattach(surface)}
          aria-label={`Reattach ${LABELS[surface]}`}
          onPointerDown={e => e.stopPropagation()}
        >
          <X size={9} />
        </button>
      </div>

      {/* Canvas */}
      <div className="sw-canvas-zone">
        <ControlSurfaceSingleCanvas
          surface={surface}
          zones={zones}
          telemetry={telemetry}
          snapshotProvider={snapshotProvider}
          style={{ height: '100%' }}
        />
      </div>

      {/* Zone toggles */}
      <div className="sw-zones">
        <button
          className={`sw-zone-btn${layout === 'vertical' ? ' sw-zone-btn--active' : ''}`}
          onClick={() => setLayout(surface, 'vertical')}
          aria-pressed={layout === 'vertical'}
          aria-label="Preset vertical"
        >
          V
        </button>
        <button
          className={`sw-zone-btn${layout === 'horizontal' ? ' sw-zone-btn--active' : ''}`}
          onClick={() => setLayout(surface, 'horizontal')}
          aria-pressed={layout === 'horizontal'}
          aria-label="Preset horizontal"
        >
          H
        </button>
        <button
          className={`sw-zone-btn${layout === 'grid' ? ' sw-zone-btn--active' : ''}`}
          onClick={() => setLayout(surface, 'grid')}
          aria-pressed={layout === 'grid'}
          aria-label="Preset grid"
        >
          G
        </button>
        {(['icon', 'arc', 'val'] as (keyof ZoneFlags)[]).map(zone => (
          <button
            key={zone}
            className={`sw-zone-btn${zones[zone] ? ' sw-zone-btn--active' : ''}`}
            onClick={() => toggleZone(zone)}
            aria-pressed={zones[zone]}
            aria-label={`Toggle ${zone} zone`}
          >
            {zone}
          </button>
        ))}
      </div>

    </div>
  );
};

export default SurfaceWidget;
