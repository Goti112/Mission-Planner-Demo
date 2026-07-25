/**
 * DraggableControlSurfacesPanel.tsx
 *
 * Floating/dockable shell for ControlSurfacesPanel.
 * Supports: full-panel drag, 8-handle resize, orientation modes (Auto/H/V/Grid),
 * edge anchoring, manual docking, and localStorage persistence.
 *
 * Reuses DraggablePFDPanel.css for base shell styles.
 * Extends with DraggableControlSurfacesPanel.css for panel-specific styles.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { GripVertical, LayoutGrid, Minimize2, PanelBottom, PanelLeft, Rows3 } from 'lucide-react';

import ControlSurfacesPanel from './ControlSurfacesPanel';
import type { FlightTelemetry } from '../../telemetry';
import type { SnapshotProvider } from '../hooks/useHUDLoop';
import {
  CONTROL_PANEL_DEFAULT_RECT,
  clampControlPanelPosition,
  clampControlPanelSize,
  detectControlPanelAnchor,
  getViewportSize,
  loadControlPanelState,
  resolveControlPanelLayout,
  saveControlPanelState,
  snapControlPanelRect,
  type ControlPanelAnchor,
  type ControlPanelOrientationMode,
  type ControlPanelRect,
} from './controlSurfacesPanelLayout';

import './DraggablePFDPanel.css';
import './DraggableControlSurfacesPanel.css';

// ── Types ─────────────────────────────────────────────────────────────────

type PanelDragType =
  | 'move'
  | 'resize-n' | 'resize-e' | 'resize-s' | 'resize-w'
  | 'resize-ne' | 'resize-se' | 'resize-sw' | 'resize-nw';

interface DragState {
  type: PanelDragType;
  startX: number;
  startY: number;
  origRect: ControlPanelRect;
}

// ── Props ─────────────────────────────────────────────────────────────────

export interface DraggableControlSurfacesPanelProps {
  telemetry: FlightTelemetry;
  snapshotProvider?: React.RefObject<SnapshotProvider | null>;
}

// ── Component ─────────────────────────────────────────────────────────────

const DraggableControlSurfacesPanel: React.FC<DraggableControlSurfacesPanelProps> = ({
  telemetry,
  snapshotProvider,
}) => {
  const [panelState, setPanelState] = useState(loadControlPanelState);

  const layout = resolveControlPanelLayout(
    panelState.mode,
    panelState.anchor,
    { width: panelState.width, height: panelState.height },
  );

  const dockedRef = useRef<HTMLDivElement>(null);
  const dragRef   = useRef<DragState | null>(null);

  // ── Persist state ───────────────────────────────────────────────────
  useEffect(() => {
    saveControlPanelState(panelState);
  }, [panelState]);

  // ── Normalize rect helper ───────────────────────────────────────────
  const normalizePanelRect = useCallback((
    rect: ControlPanelRect,
    mode: ControlPanelOrientationMode,
    anchor: ControlPanelAnchor,
  ): ControlPanelRect => {
    const viewport     = getViewportSize();
    const resolved     = resolveControlPanelLayout(mode, anchor, { width: rect.width, height: rect.height });
    const nextSize     = clampControlPanelSize({ width: rect.width, height: rect.height }, resolved, viewport);
    const nextPosition = clampControlPanelPosition({ x: rect.x, y: rect.y }, nextSize, viewport);
    return { ...nextPosition, ...nextSize };
  }, []);

  // ── Global mouse move / up ──────────────────────────────────────────
  useEffect(() => {
    const onMove = (e: MouseEvent): void => {
      const ds = dragRef.current;
      if (!ds) return;

      const dx = e.clientX - ds.startX;
      const dy = e.clientY - ds.startY;

      if (ds.type === 'move') {
        setPanelState(prev => {
          const viewport = getViewportSize();
          const candidate: ControlPanelRect = {
            x:      ds.origRect.x + dx,
            y:      ds.origRect.y + dy,
            width:  ds.origRect.width,
            height: ds.origRect.height,
          };
          const detectedAnchor = detectControlPanelAnchor(candidate, viewport);
          const snapped        = snapControlPanelRect(candidate, detectedAnchor, viewport);
          return { ...prev, ...snapped, anchor: detectedAnchor };
        });
      } else {
        setPanelState(prev => {
          let { x, y, width, height } = ds.origRect;
          const viewport = getViewportSize();

          if (ds.type.includes('e')) { width  = Math.max(220, ds.origRect.width  + dx); }
          if (ds.type.includes('s')) { height = Math.max(180, ds.origRect.height + dy); }
          if (ds.type.includes('w')) {
            const newW = Math.max(220, ds.origRect.width - dx);
            x     = ds.origRect.x + (ds.origRect.width - newW);
            width = newW;
          }
          if (ds.type.includes('n')) {
            const newH = Math.max(180, ds.origRect.height - dy);
            y      = ds.origRect.y + (ds.origRect.height - newH);
            height = newH;
          }

          const resolved = resolveControlPanelLayout(prev.mode, prev.anchor, { width, height });
          const nextSize = clampControlPanelSize({ width, height }, resolved, viewport);
          const nextPos  = clampControlPanelPosition({ x, y }, nextSize, viewport);
          return { ...prev, ...nextPos, ...nextSize };
        });
      }
    };

    const onUp = (): void => { dragRef.current = null; };

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup',   onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup',   onUp);
    };
  }, [normalizePanelRect]);

  // ── Begin drag ──────────────────────────────────────────────────────
  const beginDrag = useCallback((e: React.MouseEvent, type: PanelDragType): void => {
    const target = e.target as HTMLElement;
    if (
      type === 'move' &&
      target.closest('button, a, input, select, textarea, .dpfd-action-btn, .dcsp-resize-handle, .dcsp-mode-control')
    ) {
      return;
    }

    e.preventDefault();
    e.stopPropagation();

    let origRect: ControlPanelRect = {
      x:      panelState.x,
      y:      panelState.y,
      width:  panelState.width,
      height: panelState.height,
    };

    if (!panelState.floating && type === 'move') {
      const domRect = dockedRef.current?.getBoundingClientRect();
      origRect = {
        x:      domRect ? domRect.left : CONTROL_PANEL_DEFAULT_RECT.x,
        y:      domRect ? domRect.top  : CONTROL_PANEL_DEFAULT_RECT.y,
        width:  CONTROL_PANEL_DEFAULT_RECT.width,
        height: CONTROL_PANEL_DEFAULT_RECT.height,
      };
      setPanelState(prev => ({ ...prev, floating: true, ...origRect, anchor: 'none' }));
    }

    dragRef.current = {
      type,
      startX: e.clientX,
      startY: e.clientY,
      origRect,
    };
  }, [panelState]);

  // ── Panel actions ────────────────────────────────────────────────────
  const dock = useCallback((): void => {
    setPanelState(prev => ({ ...prev, floating: false, anchor: 'none' }));
  }, []);

  const setMode = useCallback((mode: ControlPanelOrientationMode): void => {
    setPanelState(prev => {
      const normalized = normalizePanelRect(
        { x: prev.x, y: prev.y, width: prev.width, height: prev.height },
        mode,
        prev.anchor,
      );
      return { ...prev, mode, ...normalized };
    });
  }, [normalizePanelRect]);

  const clearAnchor = useCallback((): void => {
    setPanelState(prev => ({ ...prev, anchor: 'none' }));
  }, []);

  // ── Floating panel ──────────────────────────────────────────────────
  const floatingPanel = panelState.floating && createPortal(
    <div
      className={`dpfd-floating dcsp-floating dcsp-floating--${layout} dcsp-floating--anchor-${panelState.anchor}`}
      style={{ left: panelState.x, top: panelState.y, width: panelState.width, height: panelState.height }}
      onMouseDown={e => beginDrag(e, 'move')}
    >
      <div
        className="dpfd-handle--floating"
        onDoubleClick={dock}
        title="Arrastra para mover · Doble clic para anclar"
      >
        <span className="dpfd-handle-icon"><GripVertical size={14} /></span>
        <span className="dpfd-handle-label">Control Surfaces</span>

        <div className="dpfd-float-actions">
          <div className="dcsp-mode-control" onMouseDown={e => e.stopPropagation()}>
            <button
              className={`dcsp-mode-btn${panelState.mode === 'auto' ? ' dcsp-mode-btn--active' : ''}`}
              onClick={() => setMode('auto')}
              title="Modo automático"
              aria-pressed={panelState.mode === 'auto'}
            >
              Auto
            </button>
            <button
              className={`dcsp-mode-btn${panelState.mode === 'horizontal' ? ' dcsp-mode-btn--active' : ''}`}
              onClick={() => setMode('horizontal')}
              title="Layout horizontal"
              aria-pressed={panelState.mode === 'horizontal'}
            >
              <Rows3 size={12} />
            </button>
            <button
              className={`dcsp-mode-btn${panelState.mode === 'vertical' ? ' dcsp-mode-btn--active' : ''}`}
              onClick={() => setMode('vertical')}
              title="Layout vertical"
              aria-pressed={panelState.mode === 'vertical'}
            >
              <PanelLeft size={12} />
            </button>
            <button
              className={`dcsp-mode-btn${panelState.mode === 'grid' ? ' dcsp-mode-btn--active' : ''}`}
              onClick={() => setMode('grid')}
              title="Layout grid"
              aria-pressed={panelState.mode === 'grid'}
            >
              <LayoutGrid size={12} />
            </button>
          </div>

          {panelState.anchor !== 'none' && (
            <button
              className="dcsp-anchor-pill dpfd-action-btn"
              onClick={clearAnchor}
              title={`Anclado a ${panelState.anchor} — clic para liberar`}
            >
              {panelState.anchor === 'left'   && <PanelLeft   size={11} />}
              {panelState.anchor === 'right'  && <PanelLeft   size={11} style={{ transform: 'scaleX(-1)' }} />}
              {panelState.anchor === 'top'    && <PanelBottom size={11} style={{ transform: 'scaleY(-1)' }} />}
              {panelState.anchor === 'bottom' && <PanelBottom size={11} />}
              <span>{panelState.anchor}</span>
            </button>
          )}

          <button
            className="dpfd-action-btn"
            onClick={dock}
            title="Anclar al panel lateral"
          >
            <Minimize2 size={13} />
          </button>
        </div>
      </div>

      <div className="dpfd-content">
        <ControlSurfacesPanel
          telemetry={telemetry}
          snapshotProvider={snapshotProvider}
          layout={layout}
        />
      </div>

      {(['n', 'e', 's', 'w', 'ne', 'se', 'sw', 'nw'] as const).map(handle => (
        <div
          key={handle}
          className={`dcsp-resize-handle dcsp-resize-handle--${handle}`}
          onMouseDown={e => { e.stopPropagation(); beginDrag(e, `resize-${handle}` as PanelDragType); }}
          title="Redimensionar"
        />
      ))}
    </div>,
    document.body,
  );

  // ── Docked view ─────────────────────────────────────────────────────
  if (!panelState.floating) {
    return (
      <>
        <div className="dpfd-docked" ref={dockedRef} onMouseDown={e => beginDrag(e, 'move')}>
          <div
            className="dpfd-handle--docked"
            title="Arrastra para sacar el panel"
          >
            <span className="dpfd-handle-icon"><GripVertical size={14} /></span>
            <span className="dpfd-handle-label">Control Surfaces</span>
            <span className="dpfd-hint">arrastra para mover</span>
          </div>

          <ControlSurfacesPanel
            telemetry={telemetry}
            snapshotProvider={snapshotProvider}
            layout="horizontal"
          />
        </div>

        {floatingPanel}
      </>
    );
  }

  // ── Floating placeholder in left column ─────────────────────────────
  return (
    <>
      <div className="dpfd-placeholder">
        <span className="dpfd-placeholder-label">Control Surfaces flotante</span>
        <button className="dpfd-placeholder-btn" onClick={dock}>
          Anclar aquí
        </button>
      </div>

      {floatingPanel}
    </>
  );
};

export default DraggableControlSurfacesPanel;
