/**
 * LayoutEngine.tsx — Dynamic zone-based panel layout for ROHU GCS.
 *
 * Responsibilities:
 *   - Read panel positions from layoutStore
 *   - Render panels into their assigned zones (left / center / right)
 *   - Handle panel visibility animations (CSS width-collapse for sidebars)
 *   - Apply per-panel sizing from the panel registry
 *
 * Individual panel components are passed as render functions via the
 * `panels` prop — the engine does not import or instantiate them directly.
 * This keeps panels decoupled from the layout system.
 *
 * Zones rendered by this engine:
 *   left   — collapsible sidebar (animated width transition)
 *   center — main content area (map / 3D), always visible, fills remaining space
 *   right  — collapsible sidebar (mirrors left zone behaviour)
 *
 * Future extensions (drag-and-drop, floating windows, resizable splits)
 * should be added here without modifying individual panel components.
 */
import React from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useLayoutStore } from '../store/layoutStore'
import type { LayoutPanelId } from '../store/layoutStore'
import { PANEL_REGISTRY } from './panelRegistry'
import { LayoutControls } from './LayoutControls'
import './LayoutEngine.css'

// ── Types ─────────────────────────────────────────────────────────────────────

/** Panel render functions keyed by panel ID. */
export type PanelSlots = Partial<Record<LayoutPanelId, () => React.ReactNode>>

interface LayoutEngineProps {
  /** Render functions for panels active in the current view. */
  panels: PanelSlots
  /** The always-visible center content (map / 3D view). */
  center: React.ReactNode
  /** Whether to show the floating layout controls widget (default: true). */
  showLayoutControls?: boolean
}

// ── Component ─────────────────────────────────────────────────────────────────

export const LayoutEngine: React.FC<LayoutEngineProps> = ({
  panels,
  center,
  showLayoutControls = true,
}) => {
  const panelLayouts = useLayoutStore((s) => s.panels)
  const togglePanel  = useLayoutStore((s) => s.togglePanel)

  // Panel IDs that have renderers registered in this view.
  const panelIds = Object.keys(panels) as LayoutPanelId[]

  // ── Left zone ────────────────────────────────────────────────────────────
  const leftPanelId = panelIds.find((id) => panelLayouts[id]?.zone === 'left')
  const leftVisible = leftPanelId ? panelLayouts[leftPanelId].visible : false
  const leftMeta    = leftPanelId ? PANEL_REGISTRY[leftPanelId] : undefined
  const leftWidth   = leftPanelId
    ? (panelLayouts[leftPanelId].width ?? leftMeta?.defaultWidth ?? 440)
    : 440

  // ── Right zone ────────────────────────────────────────────────────────────
  const rightPanelId = panelIds.find((id) => panelLayouts[id]?.zone === 'right')
  const rightVisible = rightPanelId ? panelLayouts[rightPanelId].visible : false
  const rightMeta    = rightPanelId ? PANEL_REGISTRY[rightPanelId] : undefined
  const rightWidth   = rightPanelId
    ? (panelLayouts[rightPanelId].width ?? panelLayouts[rightPanelId].width ?? rightMeta?.defaultWidth ?? 440)
    : 440

  return (
    <div className="layout-engine">
      {/* ── Left zone — animated instrument sidebar ───────────────────── */}
      <div
        className={`layout-zone layout-zone--left ${
          leftVisible ? 'layout-zone--visible' : 'layout-zone--hidden'
        }`}
        style={{
          '--lz-width':     `${leftWidth}px`,
          '--lz-max-width': `${leftWidth}px`,
          '--lz-min-width': `${leftMeta?.minWidth ?? 340}px`,
        } as React.CSSProperties}
      >
        {leftPanelId && panels[leftPanelId] && panels[leftPanelId]!()}
      </div>

      {/* ── Center zone — always fills remaining space ────────────────── */}
      <div className="layout-zone layout-zone--center">
        {center}

        {/* ── Zone Toggle Handles ── */}
        {leftPanelId && (
          <button
            className={`layout-zone__toggle layout-zone__toggle--left ${leftVisible ? 'is-active' : ''}`}
            onClick={() => togglePanel(leftPanelId)}
            title={leftVisible ? 'Ocultar panel izquierdo' : 'Mostrar panel izquierdo'}
          >
            {leftVisible ? <ChevronLeft size={16} /> : <ChevronRight size={16} />}
          </button>
        )}

        {rightPanelId && (
          <button
            className={`layout-zone__toggle layout-zone__toggle--right ${rightVisible ? 'is-active' : ''}`}
            onClick={() => togglePanel(rightPanelId)}
            title={rightVisible ? 'Ocultar panel derecho' : 'Mostrar panel derecho'}
          >
            {rightVisible ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
          </button>
        )}

        {showLayoutControls && (
          <LayoutControls availablePanels={panelIds} />
        )}
      </div>

      {/* ── Right zone — animated sidebar, mirrors left zone ─────────── */}
      <div
        className={`layout-zone layout-zone--right ${
          rightVisible ? 'layout-zone--visible' : 'layout-zone--hidden'
        }`}
        style={{
          '--lz-width':     `${rightWidth}px`,
          '--lz-max-width': `${rightWidth}px`,
          '--lz-min-width': `${rightMeta?.minWidth ?? 260}px`,
        } as React.CSSProperties}
      >
        {rightPanelId && panels[rightPanelId] && panels[rightPanelId]!()}
      </div>
    </div>
  );
}
