import { create } from 'zustand';
import type { AdvancedMapPolygonDraft } from './advancedMapPlacement';

export type AdvancedLayerTool =
  | 'select'
  | 'selectFenceSource'
  | 'selectSurveySource'
  | 'drawFencePolygon'
  | 'drawSurveyPolygon'
  | 'placeRallyPoint';

export interface SelectedAdvancedLayer {
  readonly type: 'fence' | 'rally';
  readonly id: string;
  readonly vertexIndex: number | null;
}

export interface AdvancedLayerUiState {
  readonly activeAdvancedTool: AdvancedLayerTool;
  readonly selectedSourceMissionItemIds: readonly string[];
  readonly selectedAdvancedLayer: SelectedAdvancedLayer | null;
  readonly mapPolygonDraft: AdvancedMapPolygonDraft | null;
  readonly setActiveAdvancedTool: (tool: AdvancedLayerTool) => void;
  readonly setSourceMissionItems: (itemIds: readonly string[]) => void;
  readonly toggleSourceMissionItem: (itemId: string) => void;
  readonly clearSourceMissionItems: () => void;
  readonly selectAdvancedLayer: (selection: SelectedAdvancedLayer | null) => void;
  readonly setMapPolygonDraft: (draft: AdvancedMapPolygonDraft | null) => void;
  readonly resetAdvancedLayerUi: () => void;
}

const uniqueIds = (itemIds: readonly string[]): readonly string[] =>
  itemIds.reduce<string[]>((items, itemId) => (items.includes(itemId) ? items : [...items, itemId]), []);

const toggleId = (itemIds: readonly string[], itemId: string): readonly string[] =>
  itemIds.includes(itemId) ? itemIds.filter((currentId) => currentId !== itemId) : [...itemIds, itemId];

const toolDraftPurpose = (tool: AdvancedLayerTool): AdvancedMapPolygonDraft['purpose'] | null => {
  if (tool === 'drawFencePolygon') {
    return 'fence';
  }

  if (tool === 'drawSurveyPolygon') {
    return 'survey';
  }

  return null;
};

const sourceSelectionToolMatches = (
  currentTool: AdvancedLayerTool,
  nextTool: AdvancedLayerTool,
): boolean =>
  (currentTool === 'selectFenceSource' && nextTool === 'selectFenceSource') ||
  (currentTool === 'selectSurveySource' && nextTool === 'selectSurveySource');

export const useAdvancedLayerUiStore = create<AdvancedLayerUiState>((set) => ({
  activeAdvancedTool: 'select',
  selectedSourceMissionItemIds: [],
  selectedAdvancedLayer: null,
  mapPolygonDraft: null,

  setActiveAdvancedTool: (tool: AdvancedLayerTool): void => {
    set((state) => {
      const nextDraftPurpose = toolDraftPurpose(tool);
      const currentDraftPurpose = state.mapPolygonDraft?.purpose ?? null;
      const nextState: {
        activeAdvancedTool: AdvancedLayerTool;
        selectedAdvancedLayer: SelectedAdvancedLayer | null;
        mapPolygonDraft?: AdvancedMapPolygonDraft | null;
        selectedSourceMissionItemIds?: readonly string[];
      } = {
        activeAdvancedTool: tool,
        selectedAdvancedLayer: null,
      };

      if (nextDraftPurpose === null || currentDraftPurpose !== nextDraftPurpose) {
        if (state.mapPolygonDraft !== null) {
          nextState.mapPolygonDraft = null;
        }
      }

      if (!sourceSelectionToolMatches(state.activeAdvancedTool, tool) && state.selectedSourceMissionItemIds.length > 0) {
        nextState.selectedSourceMissionItemIds = [];
      }

      return nextState;
    });
  },

  setSourceMissionItems: (itemIds: readonly string[]): void => {
    set({
      selectedSourceMissionItemIds: uniqueIds(itemIds),
    });
  },

  toggleSourceMissionItem: (itemId: string): void => {
    set((state) => ({
      selectedSourceMissionItemIds: toggleId(state.selectedSourceMissionItemIds, itemId),
    }));
  },

  clearSourceMissionItems: (): void => {
    set({
      selectedSourceMissionItemIds: [],
    });
  },

  selectAdvancedLayer: (selection: SelectedAdvancedLayer | null): void => {
    set({
      selectedAdvancedLayer: selection,
      activeAdvancedTool: 'select',
    });
  },

  setMapPolygonDraft: (draft: AdvancedMapPolygonDraft | null): void => {
    set({ mapPolygonDraft: draft });
  },

  resetAdvancedLayerUi: (): void => {
    set({
      activeAdvancedTool: 'select',
      selectedSourceMissionItemIds: [],
      selectedAdvancedLayer: null,
      mapPolygonDraft: null,
    });
  },
}));
