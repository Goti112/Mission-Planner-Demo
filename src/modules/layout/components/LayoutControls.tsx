/**
 * LayoutControls.tsx — Panel side-swap button.
 *
 * Replaces the previous dropdown widget with a single-click toggle:
 *   - If the panel is on the LEFT  → clicking moves it to the RIGHT.
 *   - If the panel is on the RIGHT → clicking moves it to the LEFT.
 *
 * The button is positioned in the center zone (absolute) and mirrors
 * the side of the current panel so it always sits just below the
 * corresponding "<" / ">" collapse handle.
 *
 * Works entirely through layoutStore — no dependency on individual panels.
 */
import React from 'react'
import { useLayoutStore } from '../store/layoutStore'
import type { LayoutPanelId, LayoutZone } from '../store/layoutStore'
import { PANEL_REGISTRY } from './panelRegistry'
import './LayoutControls.css'

// ── Props ─────────────────────────────────────────────────────────────────────

interface LayoutControlsProps {
  /** Panel IDs that have renderers in the current view (subset of all panels). */
  availablePanels: LayoutPanelId[]
}

// ── Component ─────────────────────────────────────────────────────────────────

export const LayoutControls: React.FC<LayoutControlsProps> = ({ availablePanels }) => {
  const panels    = useLayoutStore((s) => s.panels)
  const movePanel = useLayoutStore((s) => s.movePanel)

  // Take the first movable panel available in this view.
  const panelId = availablePanels.find((id) => PANEL_REGISTRY[id]?.movable)
  if (!panelId) return null

  const currentZone: LayoutZone = panels[panelId]?.zone ?? 'left'
  const isOnLeft                = currentZone !== 'right'
  const targetZone: LayoutZone  = isOnLeft ? 'right' : 'left'

  const label = isOnLeft ? 'Mover panel a la derecha' : 'Mover panel a la izquierda'

  return (
    <div className={`layout-ctrl layout-ctrl--${isOnLeft ? 'left' : 'right'}`}>
      <button
        className="layout-ctrl__toggle"
        onClick={() => movePanel(panelId, targetZone)}
        title={label}
        aria-label={label}
      >
        {/*
          Icon: vertical bar (the panel) + arrow indicating destination side.
          When on left  → arrow points RIGHT  (panel will move right).
          When on right → arrow points LEFT   (panel will move left).
        */}
        {isOnLeft ? (
          /* Panel on left — arrow pointing right */
          <svg width="15" height="15" viewBox="0 0 15 15" fill="currentColor" aria-hidden="true">
            <rect x="1" y="1" width="3.5" height="13" rx="1" />
            <path
              d="M7 4.5 L10.5 7.5 L7 10.5"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
              fill="none"
            />
          </svg>
        ) : (
          /* Panel on right — arrow pointing left */
          <svg width="15" height="15" viewBox="0 0 15 15" fill="currentColor" aria-hidden="true">
            <rect x="10.5" y="1" width="3.5" height="13" rx="1" />
            <path
              d="M8 4.5 L4.5 7.5 L8 10.5"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
              fill="none"
            />
          </svg>
        )}
      </button>
    </div>
  )
}
