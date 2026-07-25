import { describe, expect, it } from 'vitest';
import { emptyAdvancedMissionPlan } from '../../modules/mission/planner/advancedMissionTypes';
import { buildPlanRouteAdvancedLayers } from './planRouteAdvancedLayers';

describe('buildPlanRouteAdvancedLayers', () => {
  it('maps survey polygon drafts as survey areas instead of fences', () => {
    const layers = buildPlanRouteAdvancedLayers({
      advanced: emptyAdvancedMissionPlan(),
      mapPolygonDraft: {
        purpose: 'survey',
        id: 'survey-draft-1',
        vertices: [
          { lat: 40.4168, lng: -3.7038 },
          { lat: 40.4172, lng: -3.7032 },
          { lat: 40.4164, lng: -3.7026 },
        ],
      },
      selectedLayer: null,
    });

    expect(layers.fences).toEqual([]);
    expect(layers.surveyAreas).toEqual([
      {
        id: 'survey-draft-1',
        name: 'Map Survey',
        vertices: [
          { lat: 40.4168, lng: -3.7038 },
          { lat: 40.4172, lng: -3.7032 },
          { lat: 40.4164, lng: -3.7026 },
        ],
      },
    ]);
  });
});
