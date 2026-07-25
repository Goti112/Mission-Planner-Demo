/* ═══════════════════════════════════════════════════════════════
   missionProgressStore — Reactive per-drone mission progress
   ═══════════════════════════════════════════════════════════════

   Lightweight Zustand store that holds MissionProgress snapshots.
   Written by DroneMissionController at PROGRESS_STORE_INTERVAL (10 Hz).
   Read by TelemetryPanelAdvanced, MissionSummary, GCSNavBar.

   Kept separate from missionStore to avoid polluting the mission
   definition type and to enable O(1) selective re-renders via
   per-droneId selectors.
   ═══════════════════════════════════════════════════════════════ */

import { create } from 'zustand';
import type { MissionProgress } from '../core/MissionProgress';

interface MissionProgressState {
  /** Keyed by droneId. Only drones with an active mission have an entry. */
  progress: Record<string, MissionProgress>;

  /** Write or overwrite progress for a drone. */
  updateProgress: (droneId: string, data: MissionProgress) => void;

  /** Remove progress entry when a drone's mission ends. */
  clearProgress: (droneId: string) => void;

  /** Remove all entries (e.g. on full reset). */
  clearAll: () => void;
}

export const useMissionProgressStore = create<MissionProgressState>((set) => ({
  progress: {},

  updateProgress: (droneId, data) =>
    set((state) => ({
      progress: { ...state.progress, [droneId]: data },
    })),

  clearProgress: (droneId) =>
    set((state) => {
      const next = { ...state.progress };
      delete next[droneId];
      return { progress: next };
    }),

  clearAll: () => set({ progress: {} }),
}));
