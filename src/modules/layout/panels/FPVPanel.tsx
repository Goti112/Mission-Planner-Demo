import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Minimize2, GripVertical } from 'lucide-react';
import { LazyCesiumGlobe } from '../../map';
import './FPVPanel.css';

const DEFAULT_W = 400;
const DEFAULT_H = 300;

interface DragState {
  type: 'move' | 'resize';
  startX: number;
  startY: number;
  origX: number;
  origY: number;
  origW: number;
  origH: number;
}

interface FPVPanelProps {
  onClose: () => void;
}

export const FPVPanel: React.FC<FPVPanelProps> = ({ onClose }) => {
  const [floating, setFloating] = useState(false);
  const [pos, setPos] = useState({ x: 100, y: 100 });
  const [size, setSize] = useState({ w: DEFAULT_W, h: DEFAULT_H });

  const containerRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<DragState | null>(null);

  // Begin drag: either undock+drag or continue dragging
  const handleBeginDrag = useCallback((e: React.MouseEvent, type: 'move' | 'resize') => {
    e.preventDefault();
    e.stopPropagation();

    let startPos = pos;

    if (!floating && type === 'move') {
      const rect = containerRef.current?.getBoundingClientRect();
      startPos = {
        x: rect ? rect.left : 100,
        y: rect ? rect.top : 100,
      };
      setPos(startPos);
      setSize({ w: DEFAULT_W, h: DEFAULT_H });
      setFloating(true);
    }

    dragRef.current = {
      type,
      startX: e.clientX,
      startY: e.clientY,
      origX: startPos.x,
      origY: startPos.y,
      origW: size.w,
      origH: size.h,
    };
  }, [floating, pos, size]);

  // Native listener to bypass Cesium event consumption
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const onMouseDown = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (target.closest('button, a, input, select, textarea, .fpv-resize')) {
        return;
      }

      handleBeginDrag(e as unknown as React.MouseEvent, 'move');
    };

    container.addEventListener('mousedown', onMouseDown, { capture: true });
    return () => container.removeEventListener('mousedown', onMouseDown, { capture: true });
  }, [handleBeginDrag]);

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
          w: Math.max(280, ds.origW + dx),
          h: Math.max(210, ds.origH + dy),
        });
      }
    };

    const onUp = () => {
      dragRef.current = null;
    };

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, []);

  const dock = useCallback(() => setFloating(false), []);

  const renderContent = () => (
    <>
      <div
        className="fpv-panel-header"
        onDoubleClick={floating ? dock : undefined}
        title={floating ? 'Arrastra para mover · Doble clic para anclar' : 'Arrastra para hacer flotante'}
        style={{ cursor: 'grab' }}
      >
        <div className="fpv-panel-title">
          <GripVertical size={13} style={{ marginRight: -2, opacity: 0.6 }} />
          <div className="fpv-rec-dot" />
          Cámara virtual
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {!floating && <span className="fpv-hint">arrastra para mover</span>}
          <div style={{ display: 'flex', gap: '4px' }}>
            {floating && (
              <button
                className="fpv-close-btn"
                onClick={(e) => {
                  e.stopPropagation();
                  dock();
                }}
                title="Anclar al panel lateral"
                aria-label="Anclar al panel lateral"
              >
                <Minimize2 size={13} />
              </button>
            )}
            <button
              className="fpv-close-btn"
              onClick={(e) => {
                e.stopPropagation();
                onClose();
              }}
              title="Cerrar FPV"
              aria-label="Cerrar FPV"
            >
              <X size={14} />
            </button>
          </div>
        </div>
      </div>

      <div className="fpv-panel-content">
        <LazyCesiumGlobe
          addingWaypoint={false}
          showBuildings={false}
          forceCameraMode="FPV"
          viewerRole="fpv"
        />
      </div>

      {floating && (
        <div
          className="fpv-resize"
          onMouseDown={(e) => handleBeginDrag(e, 'resize')}
          title="Redimensionar"
        />
      )}
    </>
  );

  const floatingPanel = floating && createPortal(
    <div
      ref={containerRef}
      className="fpv-panel-container fpv-floating"
      style={{ left: pos.x, top: pos.y, width: size.w, height: size.h }}
    >
      {renderContent()}
    </div>,
    document.body,
  );

  if (!floating) {
    return (
      <>
        <div className="fpv-panel-container" ref={containerRef}>
          {renderContent()}
        </div>
        {floatingPanel}
      </>
    );
  }

  return (
    <>
      <div className="fpv-placeholder">
        <span className="fpv-placeholder-label">FPV flotante</span>
        <button className="fpv-placeholder-btn" onClick={dock}>
          Anclar aquí
        </button>
      </div>

      {floatingPanel}
    </>
  );
};

export default FPVPanel;
