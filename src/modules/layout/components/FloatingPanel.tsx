/**
 * FloatingPanel.tsx — Generic animated overlay panel
 *
 * Supports two layout modes:
 *   side="left"   → Full-height drawer slides in from the left edge
 *   side="bottom" → Sheet slides up from the bottom (covers ~50% height)
 *
 * Behaviour:
 *   - Backdrop overlay with subtle blur behind the panel.
 *   - Clicking the backdrop closes the panel (calls onClose).
 *   - ESC key closes the panel.
 *   - 250ms CSS transitions — rAF-safe (no JS animation timers).
 *   - Renders in a React portal so it never disrupts canvas z-stacking.
 *   - Does NOT unmount on close → preserves child component state.
 *     Visibility is controlled via CSS translate + opacity.
 *
 * Usage:
 *   <FloatingPanel side="left" open={open} onClose={() => setOpen(false)} title="Misiones">
 *     <MissionPanel ... />
 *   </FloatingPanel>
 */

import React, { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import './FloatingPanel.css';

export interface FloatingPanelProps {
  side: 'left' | 'bottom' | 'right';
  open: boolean;
  onClose: () => void;
  title: string;
  /** Width for left/right drawers (CSS value, default 380px) */
  width?: string;
  /** Height for bottom sheet (CSS value, default 52vh) */
  height?: string;
  children: React.ReactNode;
}

export const FloatingPanel: React.FC<FloatingPanelProps> = ({
  side,
  open,
  onClose,
  title,
  width  = '380px',
  height = '52vh',
  children,
}) => {
  const panelRef = useRef<HTMLDivElement>(null);

  // ESC key closes the panel
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onClose]);

  // Trap focus inside when open (accessibility)
  useEffect(() => {
    if (open) panelRef.current?.focus();
  }, [open]);

  const panelStyle: React.CSSProperties =
    side === 'left' || side === 'right'
      ? { width, height: '100%' }
      : { width: '100%', height };

  return createPortal(
    <div
      className={`fp-root fp-root--${side} ${open ? 'fp-root--open' : ''}`}
      aria-hidden={!open}
    >
      {/* Backdrop */}
      <div className="fp-backdrop" onClick={onClose} />

      {/* Panel */}
      <div
        ref={panelRef}
        className={`fp-panel fp-panel--${side}`}
        style={panelStyle}
        tabIndex={-1}
        role="dialog"
        aria-label={title}
      >
        {/* Header */}
        <div className="fp-header">
          <span className="fp-title">{title}</span>
          <button className="fp-close" onClick={onClose} aria-label="Cerrar panel">
            <X size={16} />
          </button>
        </div>

        {/* Scrollable content */}
        <div className="fp-body">
          {children}
        </div>
      </div>
    </div>,
    document.body,
  );
};

export default FloatingPanel;
