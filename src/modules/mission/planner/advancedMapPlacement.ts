import type {
  AdvancedMissionPlan,
  FenceVertex,
} from './advancedMissionTypes';
import type { SelectedAdvancedLayer } from './advancedLayerUiStore';

export type AdvancedMapPolygonDraftPurpose = 'fence' | 'survey';

export interface AdvancedMapPolygonDraft {
  readonly purpose: AdvancedMapPolygonDraftPurpose;
  readonly id: string;
  readonly vertices: readonly FenceVertex[];
}

export interface AdvancedMapPolygonPlacementInput {
  readonly advanced: AdvancedMissionPlan;
  readonly draft: AdvancedMapPolygonDraft | null;
  readonly purpose: AdvancedMapPolygonDraftPurpose;
  readonly vertex: FenceVertex;
  readonly id: string;
}

export interface AdvancedMapFencePlacementInput {
  readonly advanced: AdvancedMissionPlan;
  readonly draft: AdvancedMapPolygonDraft | null;
  readonly vertex: FenceVertex;
  readonly fenceId: string;
  readonly fenceName: string;
  readonly maxAltitudeM: number | null;
}

export interface AdvancedMapPlacementResult {
  readonly advanced: AdvancedMissionPlan;
  readonly draft: AdvancedMapPolygonDraft;
  readonly selectedLayer: SelectedAdvancedLayer | null;
}

const appendDraftVertex = (
  draft: AdvancedMapPolygonDraft | null,
  purpose: AdvancedMapPolygonDraftPurpose,
  id: string,
  vertex: FenceVertex,
): AdvancedMapPolygonDraft => {
  if (draft !== null && draft.purpose === purpose) {
    return {
      ...draft,
      vertices: [...draft.vertices, vertex],
    };
  }

  return {
    purpose,
    id,
    vertices: [vertex],
  };
};

export const appendMapPolygonVertex = (
  input: AdvancedMapPolygonPlacementInput,
): AdvancedMapPlacementResult => {
  const draft = appendDraftVertex(input.draft, input.purpose, input.id, input.vertex);

  return {
    advanced: input.advanced,
    draft,
    selectedLayer: null,
  };
};

export const appendMapFenceVertex = (
  input: AdvancedMapFencePlacementInput,
): AdvancedMapPlacementResult =>
  appendMapPolygonVertex({
    advanced: input.advanced,
    draft: input.draft,
    purpose: 'fence',
    vertex: input.vertex,
    id: input.fenceId,
  });
