/**
 * panelRegistry.ts — Central panel metadata for the ROHU GCS layout system.
 *
 * Each panel declares its id, label, default zone, allowed zones, and
 * sizing constraints. The layout engine and layout controls widget use
 * this registry to constrain movement and display appropriate UI.
 *
 * To add a new panel:
 *   1. Add its id to LayoutPanelId in layoutStore.ts
 *   2. Add its metadata entry here
 *   3. Add a renderer function in the relevant route (App.tsx or PlanRoute.tsx)
 */
import type { LayoutPanelId, LayoutZone } from '../store/layoutStore'

// ── Panel metadata type ───────────────────────────────────────────────────────

export interface PanelMeta {
  /** Panel identifier — must match LayoutPanelId */
  id: LayoutPanelId
  /** Human-readable label shown in the layout controls widget */
  label: string
  /** Zone the panel occupies by default */
  defaultZone: LayoutZone
  /** Zones the panel is allowed to move to (constrain the UI) */
  allowedZones: LayoutZone[]
  /** Whether the panel width can be user-resized (future feature) */
  resizable: boolean
  /** Whether the panel can be moved between zones via the layout controls */
  movable: boolean
  /** Default panel width in pixels */
  defaultWidth: number
  /** Minimum allowed width in pixels */
  minWidth: number
}

// ── Registry ──────────────────────────────────────────────────────────────────

export const PANEL_REGISTRY: Record<LayoutPanelId, PanelMeta> = {
  pfdPanel: {
    id: 'pfdPanel',
    label: 'PFD & Telemetría',
    defaultZone: 'left',
    allowedZones: ['left', 'right', 'hidden'],
    resizable: true,
    movable: true,
    defaultWidth: 440,
    minWidth: 340,
  },

  missionSidebarPanel: {
    id: 'missionSidebarPanel',
    label: 'Planificador de Misión',
    defaultZone: 'right',
    allowedZones: ['left', 'right', 'hidden'],
    resizable: false,
    movable: true,
    defaultWidth: 360,
    minWidth: 260,
  },
}

export const PANEL_IDS = Object.keys(PANEL_REGISTRY) as LayoutPanelId[]
