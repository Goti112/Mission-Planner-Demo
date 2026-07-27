/**
 * uiStore.ts — Centralised UI panel state for MISSION GCS
 *
 * Controls which overlay panels are open and the drone-selector dropdown.
 * Also manages top-level view switching (FLIGHT ↔ PLAN).
 * No logic, no side effects — pure UI state.
 */
import { create } from 'zustand';
import type { CoordinateFormat } from '../../utils/coordinateFormat';

export type PanelId =
  | 'inicio'
  | 'controls';

/** Top-level application views — matches professional GCS architecture */
export type AppView = 'FLIGHT' | 'PLAN' | 'REPLAY';

/** Map visual style — single source of truth shared by Mapbox (2D) and Cesium (3D). */
export type MapStyle = 'streets' | 'satellite' | 'hybrid' | 'dark';

/**
 * Camera mode for the 3D view.
 *
 * - FREE         — Default Cesium camera interaction (pan / rotate / zoom).
 * - AUTO_CENTER  — Returns to the active drone after operator inactivity.
 * - FPV          — First-person-view locked to the drone's orientation (heading/pitch/roll).
 */
export type CameraMode = 'FREE' | 'AUTO_CENTER' | 'FPV';

export interface SharedMapCenter {
  lat: number;
  lng: number;
}

export interface Map2DViewState extends SharedMapCenter {
  zoom: number;
  bearing: number;
  pitch: number;
}

export interface Map3DViewState extends SharedMapCenter {
  height: number;
  heading: number;
  pitch: number;
  roll: number;
}

interface UIState {
  /** Top-level view: FLIGHT (monitor) or PLAN (mission editing). */
  currentView: AppView;
  setCurrentView: (view: AppView) => void;

  /** Current map visual style — shared between Mapbox 2D and Cesium 3D views. */
  mapStyle: MapStyle;
  setMapStyle: (style: MapStyle) => void;

  /** Shared latitude/longitude display mode used by flight telemetry surfaces. */
  coordinateFormat: CoordinateFormat;
  setCoordinateFormat: (format: CoordinateFormat) => void;

  /** Which full panel (drawer / bottom-sheet) is currently open. Null = none. */
  openPanel: PanelId | null;
  /** Open a specific panel (closes any previously open one). */
  setOpenPanel: (id: PanelId | null) => void;
  /** Toggle: if the given panel is already open, close it; otherwise open it. */
  togglePanel: (id: PanelId) => void;
  /** Whether the connection settings modal is open. */
  settingsOpen: boolean;
  setSettingsOpen: (v: boolean) => void;
  /** Whether the 2D map should auto-follow the active drone. */
  autoCenter: boolean;
  setAutoCenter: (v: boolean) => void;
  /** Shared AutoCenter pause deadline, used by 2D and 3D camera controllers. */
  autoCenterPauseUntilMs: number | null;
  setAutoCenterPauseUntilMs: (pauseUntilMs: number | null) => void;
  /** Camera mode for 3D view — FREE / AUTO_CENTER / FPV. */
  cameraMode: CameraMode;
  setCameraMode: (mode: CameraMode) => void;
  /** Whether the 3D globe view is active. */
  show3D: boolean;
  setShow3D: (v: boolean) => void;
  /** Whether 3D buildings are shown in Cesium 3D map styles. */
  show3DBuildings: boolean;
  setShow3DBuildings: (v: boolean) => void;
  /** Whether the FPV panel is visible in the left sidebar. */
  fpvVisible: boolean;
  setFpvVisible: (v: boolean) => void;
  toggleFpvVisible: () => void;
  /** Whether the Real Camera feed is visible. */
  realCamVisible: boolean;
  setRealCamVisible: (v: boolean) => void;
  toggleRealCamVisible: () => void;

  /** Shared geo center used to keep 2D and 3D views aligned. */
  sharedMapCenter: SharedMapCenter;
  setSharedMapCenter: (center: SharedMapCenter) => void;
  /** Last interactive 2D map camera state. */
  map2DView: Map2DViewState | null;
  setMap2DView: (view: Map2DViewState) => void;
  /** Last interactive 3D camera state. */
  map3DView: Map3DViewState | null;
  setMap3DView: (view: Map3DViewState) => void;
}

export const useUIStore = create<UIState>((set) => ({
  currentView: 'FLIGHT',
  setCurrentView: (view) => set({ currentView: view }),

  mapStyle: 'streets',
  setMapStyle: (style) => set({ mapStyle: style }),
  coordinateFormat: 'geo',
  setCoordinateFormat: (format) => set({ coordinateFormat: format }),

  openPanel: null,
  setOpenPanel: (id) => set({ openPanel: id }),
  togglePanel: (id) => set((s) => ({ openPanel: s.openPanel === id ? null : id })),
  settingsOpen: false,
  setSettingsOpen: (v) => set({ settingsOpen: v }),
  autoCenter: false,
  setAutoCenter: (v) => set({
    autoCenter: v,
    cameraMode: v ? 'AUTO_CENTER' : 'FREE',
    autoCenterPauseUntilMs: null,
  }),
  autoCenterPauseUntilMs: null,
  setAutoCenterPauseUntilMs: (pauseUntilMs) => set({ autoCenterPauseUntilMs: pauseUntilMs }),
  cameraMode: 'FREE',
  setCameraMode: (mode) => set({
    cameraMode: mode,
    // Keep autoCenter in sync: AUTO_CENTER mode → true, others → false
    autoCenter: mode === 'AUTO_CENTER',
    autoCenterPauseUntilMs: null,
  }),
  show3D: false,
  setShow3D: (v) => set({ show3D: v }),
  show3DBuildings: true,
  setShow3DBuildings: (v) => set({ show3DBuildings: v }),
  fpvVisible: false,
  setFpvVisible: (v) => set({ fpvVisible: v }),
  toggleFpvVisible: () => set((s) => ({ fpvVisible: !s.fpvVisible })),
  realCamVisible: false,
  setRealCamVisible: (v) => set({ realCamVisible: v }),
  toggleRealCamVisible: () => set((s) => ({ realCamVisible: !s.realCamVisible })),

  sharedMapCenter: { lat: 40.4168, lng: -3.7038 },
  setSharedMapCenter: (center) => set({ sharedMapCenter: center }),
  map2DView: null,
  setMap2DView: (view) => set({ map2DView: view }),
  map3DView: null,
  setMap3DView: (view) => set({ map3DView: view }),
}));
