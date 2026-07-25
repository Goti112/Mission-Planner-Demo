/**
 * layoutStore.ts — Panel layout management for ROHU GCS
 *
 * Manages the positions of UI panels across layout zones.
 * Persists to localStorage so the user's layout is restored on reload.
 *
 * Architecture notes:
 *   - zone    = WHERE the panel lives (left, right, center, hidden, floating)
 *   - visible = whether the panel is currently shown
 *   - movePanel  → changes zone (sets visible true unless moving to 'hidden')
 *   - togglePanel → toggles visible only (zone unchanged for smooth CSS animation)
 *   - resetLayout → restores factory defaults
 *
 * Forward-compatible with drag-and-drop, resizable splits, and floating windows.
 */
import { create } from 'zustand'
import { persist } from 'zustand/middleware'

// ── Zone types ────────────────────────────────────────────────────────────────

/** Possible zones where a panel can be placed. */
export type LayoutZone =
  | 'left'      // Left sidebar column
  | 'right'     // Right sidebar column
  | 'center'    // Main center area (reserved for map)
  | 'bottom'    // Footer area
  | 'hidden'    // Panel not rendered anywhere
  | 'floating'  // Future: free-floating overlay window

// ── Panel IDs ─────────────────────────────────────────────────────────────────

/** All registerable panel identifiers in the application. */
export type LayoutPanelId =
  | 'pfdPanel'            // PFD + Telemetry — FLIGHT view left column
  | 'missionSidebarPanel' // Mission Planner Sidebar — PLAN view right column

// ── Per-panel layout state ────────────────────────────────────────────────────

export interface PanelLayoutEntry {
  zone: LayoutZone
  visible: boolean
  /** User-overridden panel width in pixels. If undefined, uses registry default. */
  width?: number
}

export type LayoutState = Record<LayoutPanelId, PanelLayoutEntry>

// ── Default layout ────────────────────────────────────────────────────────────

export const DEFAULT_LAYOUT: LayoutState = {
  pfdPanel:            { zone: 'left',  visible: true },
  missionSidebarPanel: { zone: 'right', visible: true },
}

// ── Store interface ───────────────────────────────────────────────────────────

interface LayoutStore {
  panels: LayoutState
  /** Move a panel to a new zone. Moving to 'hidden' hides it. */
  movePanel: (panelId: LayoutPanelId, zone: LayoutZone) => void
  /** Toggle panel visibility — zone stays put to enable CSS animation. */
  togglePanel: (panelId: LayoutPanelId) => void
  /** Set a user-overridden width (used by resizable panels). */
  setPanelWidth: (panelId: LayoutPanelId, width: number) => void
  /** Reset all panels to factory default positions. */
  resetLayout: () => void
}

// ── Store ─────────────────────────────────────────────────────────────────────

export const useLayoutStore = create<LayoutStore>()(
  persist(
    (set) => ({
      panels: { ...DEFAULT_LAYOUT },

      movePanel: (panelId, zone) =>
        set((s) => ({
          panels: {
            ...s.panels,
            [panelId]: {
              ...s.panels[panelId],
              zone,
              visible: zone !== 'hidden',
            },
          },
        })),

      togglePanel: (panelId) =>
        set((s) => ({
          panels: {
            ...s.panels,
            [panelId]: {
              ...s.panels[panelId],
              visible: !s.panels[panelId].visible,
            },
          },
        })),

      setPanelWidth: (panelId, width) =>
        set((s) => ({
          panels: {
            ...s.panels,
            [panelId]: { ...s.panels[panelId], width },
          },
        })),

      resetLayout: () => set({ panels: { ...DEFAULT_LAYOUT } }),
    }),
    {
      name: 'rohu-layout-v1',
      partialize: (s) => ({ panels: s.panels }),
    },
  ),
)
