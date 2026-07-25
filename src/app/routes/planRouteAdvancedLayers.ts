import type { AdvancedLayerMapData } from '../../modules/map/components/mission/rendering/MissionRenderConfig';
import type { AdvancedMapPolygonDraft, AdvancedMissionPlan, SelectedAdvancedLayer } from '../../modules/mission';

export interface BuildPlanRouteAdvancedLayersInput {
  readonly advanced: AdvancedMissionPlan;
  readonly mapPolygonDraft: AdvancedMapPolygonDraft | null;
  readonly selectedLayer: SelectedAdvancedLayer | null;
}

export const buildPlanRouteAdvancedLayers = (
  input: BuildPlanRouteAdvancedLayersInput,
): AdvancedLayerMapData => {
  const fences = input.advanced.fences.map((fence) => {
    if (fence.shape === 'polygon') {
      return {
        id: fence.id,
        name: fence.name,
        boundary: fence.boundary,
        shape: fence.shape,
        vertices: fence.vertices,
      };
    }

    return {
      id: fence.id,
      name: fence.name,
      boundary: fence.boundary,
      shape: fence.shape,
      center: fence.center,
      radiusM: fence.radiusM,
    };
  });

  const fenceDrafts =
    input.mapPolygonDraft !== null &&
    input.mapPolygonDraft.purpose === 'fence' &&
    !input.advanced.fences.some((fence) => fence.id === input.mapPolygonDraft?.id)
      ? [
          {
            id: input.mapPolygonDraft.id,
            name: 'Map Fence',
            boundary: 'inclusion' as const,
            shape: 'polygon' as const,
            vertices: input.mapPolygonDraft.vertices,
          },
        ]
      : [];
  const surveyDrafts =
    input.mapPolygonDraft !== null &&
    input.mapPolygonDraft.purpose === 'survey' &&
    !input.advanced.surveys.some((survey) => survey.id === input.mapPolygonDraft?.id)
      ? [
          {
            id: input.mapPolygonDraft.id,
            name: 'Map Survey',
            vertices: input.mapPolygonDraft.vertices,
          },
        ]
      : [];

  return {
    fences: [...fences, ...fenceDrafts],
    rallyPoints: input.advanced.rallyPoints.map((rallyPoint) => ({
      id: rallyPoint.id,
      name: rallyPoint.name,
      lat: rallyPoint.coordinate.lat,
      lng: rallyPoint.coordinate.lng,
      altitudeM: rallyPoint.coordinate.alt,
    })),
    surveyAreas: [
      ...input.advanced.surveys.map((survey) => ({
        id: survey.id,
        name: survey.name,
        vertices: survey.polygon,
      })),
      ...surveyDrafts,
    ],
    selectedLayer: input.selectedLayer,
  };
};
