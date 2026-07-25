/**
 * DraggablePFDPanel.tsx
 *
 * Wrapper around PrimaryFlightDisplay that can be:
 *
 *   DOCKED  — lives inside the left sidebar normally with a thin grab bar on top.
 *   FLOATING — detaches to a fixed overlay panel anywhere on screen via React Portal.
 *              User can drag it by the handle bar and resize via the bottom-right corner.
 *              Double-click the handle OR click ⊡ to re-dock.
 *
 * No new data sources — accepts the same props as PrimaryFlightDisplay and
 * passes them straight through.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { GripVertical, Minimize2 } from 'lucide-react';

import PrimaryFlightDisplay from './PrimaryFlightDisplay';
import type { FlightTelemetry } from '../../telemetry';
import type { SnapshotProvider } from '../hooks/useHUDLoop';

import './DraggablePFDPanel.css';

// ── Constants ─────────────────────────────────────────────────────────────

/** Default floating panel dimensions (pixels). */
const DEFAULT_W = 500;
const DEFAULT_H = 380;

// ── Types ─────────────────────────────────────────────────────────────────

interface DragState {
  type: 'move' | 'resize';
  startX: number;
  startY: number;
  origX: number;
  origY: number;
  origW: number;
  origH: number;
}

// ── Props ─────────────────────────────────────────────────────────────────

export interface DraggablePFDPanelProps {
  telemetry: FlightTelemetry;
  snapshotProvider?: React.RefObject<SnapshotProvider | null>;
}

// ── Component ─────────────────────────────────────────────────────────────

const DraggablePFDPanel: React.FC<DraggablePFDPanelProps> = ({
  telemetry,
  snapshotProvider,
}) => {
  const [floating, setFloating]   = useState(false);
  const [pos,      setPos]        = useState({ x: 448, y: 64 });
  const [size,     setSize]       = useState({ w: DEFAULT_W, h: DEFAULT_H });

  const dockedRef  = useRef<HTMLDivElement>(null);
  const dragRef    = useRef<DragState | null>(null);

  // ── Global mouse move / up ──────────────────────────────────────────
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      const ds = dragRef.current;
      if (!ds) return;
      const dx = e.clientX - ds.startX;
      const dy = e.clientY - ds.startY;
      if (ds.type === 'move') {
        setPos({ x: ds.origX + dx, y: ds.origY + dy });
      } else {
        setSize({
          w: Math.max(360, ds.origW + dx),
          h: Math.max(270, ds.origH + dy),
        });
      }
    };
    const onUp = () => { dragRef.current = null; };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup',  onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup',  onUp);
    };
  }, []);

  // ── Begin drag — either undock+drag or continue dragging ───────────
  const beginDrag = useCallback((e: React.MouseEvent, type: 'move' | 'resize') => {
    const target = e.target as HTMLElement;
    // Don't start a move drag if we clicked on a button, link, or interactive element
    if (type === 'move' && target.closest('button, a, input, select, textarea, .dpfd-action-btn, .dpfd-resize')) {
      return;
    }

    e.preventDefault();
    e.stopPropagation();

    let startPos = pos;

    if (!floating && type === 'move') {
      // Capture screen position of the docked element before undocking
      const rect = dockedRef.current?.getBoundingClientRect();
      startPos = {
        x: rect ? rect.left : 448,
        y: rect ? rect.top  : 64,
      };
      setPos(startPos);
      // Always reset to default dimensions when unanchoring so the user gets
      // a predictable panel size regardless of any previous resize session.
      setSize({ w: DEFAULT_W, h: DEFAULT_H });
      setFloating(true);
    }

    dragRef.current = {
      type,
      startX: e.clientX,
      startY: e.clientY,
      origX:  startPos.x,
      origY:  startPos.y,
      origW:  size.w,
      origH:  size.h,
    };
  }, [floating, pos, size]);

  const dock = useCallback(() => setFloating(false), []);

  // ── Floating panel (rendered in document.body via React Portal) ─────
  const floatingPanel = floating && createPortal(
    <div
      className="dpfd-floating"
      style={{ left: pos.x, top: pos.y, width: size.w, height: size.h }}
      onMouseDown={e => beginDrag(e, 'move')}
    >
      {/* Drag handle — top bar */}
      <div
        className="dpfd-handle--floating"
        onDoubleClick={dock}
        title="Arrastra para mover · Doble clic para anclar"
      >
        <span className="dpfd-handle-icon"><GripVertical size={14} /></span>
        <span className="dpfd-handle-label">PFD</span>

        <div className="dpfd-float-actions">
          {/* Dock back button */}
          <button
            className="dpfd-action-btn"
            onClick={dock}
            title="Anclar al panel lateral"
          >
            <Minimize2 size={13} />
          </button>
        </div>
      </div>

      {/* PFD canvas content */}
      <div className="dpfd-content">
        <PrimaryFlightDisplay
          telemetry={telemetry}
          snapshotProvider={snapshotProvider}
        />
      </div>

      {/* Resize handle — bottom-right corner */}
      <div
        className="dpfd-resize"
        onMouseDown={e => beginDrag(e, 'resize')}
        title="Redimensionar"
      />
    </div>,
    document.body,
  );

  // ── Docked view (renders in left column) ───────────────────────────
  if (!floating) {
    return (
      <>
        <div className="dpfd-docked" ref={dockedRef} onMouseDown={e => beginDrag(e, 'move')}>
          {/* Grab handle */}
          <div
            className="dpfd-handle--docked"
            title="Arrastra para sacar el PFD del panel"
          >
            <span className="dpfd-handle-icon"><GripVertical size={14} /></span>
            <span className="dpfd-handle-label">PFD</span>
            <span className="dpfd-hint">arrastra para mover</span>
          </div>

          {/* PFD canvas — sidebar proportions */}
          <PrimaryFlightDisplay
            telemetry={telemetry}
            snapshotProvider={snapshotProvider}
          />
        </div>

        {/* Portal slot is null when docked, but keep it in tree */}
        {floatingPanel}
      </>
    );
  }

  // ── Floating placeholder in left column ────────────────────────────
  return (
    <>
      <div className="dpfd-placeholder">
        <span className="dpfd-placeholder-label">PFD flotante</span>
        <button className="dpfd-placeholder-btn" onClick={dock}>
          Anclar aquí
        </button>
      </div>

      {floatingPanel}
    </>
  );
};

export default DraggablePFDPanel;
