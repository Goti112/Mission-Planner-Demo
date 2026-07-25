import { beforeEach, describe, expect, it } from 'vitest';
import { useAdvancedLayerUiStore } from '../advancedLayerUiStore';

describe('advancedLayerUiStore', () => {
  beforeEach(() => {
    useAdvancedLayerUiStore.getState().resetAdvancedLayerUi();
  });

  it('toggles source mission items without duplicates', () => {
    useAdvancedLayerUiStore.getState().toggleSourceMissionItem('wp-1');
    useAdvancedLayerUiStore.getState().toggleSourceMissionItem('wp-2');
    useAdvancedLayerUiStore.getState().toggleSourceMissionItem('wp-1');

    expect(useAdvancedLayerUiStore.getState().selectedSourceMissionItemIds).toEqual(['wp-2']);
  });

  it('sets fence drawing tool and clears selected advanced layer', () => {
    useAdvancedLayerUiStore.getState().selectAdvancedLayer({
      type: 'rally',
      id: 'rally-1',
      vertexIndex: null,
    });

    useAdvancedLayerUiStore.getState().setActiveAdvancedTool('drawFencePolygon');

    expect(useAdvancedLayerUiStore.getState().activeAdvancedTool).toBe('drawFencePolygon');
    expect(useAdvancedLayerUiStore.getState().selectedAdvancedLayer).toBeNull();
  });

  it('selects a polygon fence vertex', () => {
    useAdvancedLayerUiStore.getState().selectAdvancedLayer({
      type: 'fence',
      id: 'fence-1',
      vertexIndex: 2,
    });

    expect(useAdvancedLayerUiStore.getState().selectedAdvancedLayer).toEqual({
      type: 'fence',
      id: 'fence-1',
      vertexIndex: 2,
    });
  });

  it('stores and clears a map polygon draft', () => {
    const draft = {
      purpose: 'fence' as const,
      id: 'draft-1',
      vertices: [{ lat: 40.416, lng: -3.704 }],
    };

    useAdvancedLayerUiStore.getState().setMapPolygonDraft(draft);

    expect(useAdvancedLayerUiStore.getState().mapPolygonDraft).toEqual(draft);

    useAdvancedLayerUiStore.getState().setMapPolygonDraft(null);

    expect(useAdvancedLayerUiStore.getState().mapPolygonDraft).toBeNull();
  });

  it('clears map draft when leaving drawFencePolygon', () => {
    useAdvancedLayerUiStore.getState().setActiveAdvancedTool('drawFencePolygon');
    useAdvancedLayerUiStore.getState().setMapPolygonDraft({
      purpose: 'fence' as const,
      id: 'draft-1',
      vertices: [{ lat: 0, lng: 0 }],
    });

    useAdvancedLayerUiStore.getState().setActiveAdvancedTool('select');

    expect(useAdvancedLayerUiStore.getState().mapPolygonDraft).toBeNull();
  });

  it('preserves map draft when reasserting drawFencePolygon', () => {
    const draft = {
      purpose: 'fence' as const,
      id: 'draft-1',
      vertices: [{ lat: 0, lng: 0 }],
    };

    useAdvancedLayerUiStore.getState().setActiveAdvancedTool('drawFencePolygon');
    useAdvancedLayerUiStore.getState().setMapPolygonDraft(draft);
    useAdvancedLayerUiStore.getState().setActiveAdvancedTool('drawFencePolygon');

    expect(useAdvancedLayerUiStore.getState().mapPolygonDraft).toEqual(draft);
  });

  it('preserves survey map draft when reasserting drawSurveyPolygon', () => {
    const draft = {
      purpose: 'survey' as const,
      id: 'survey-draft-1',
      vertices: [{ lat: 40.416, lng: -3.704 }],
    };

    useAdvancedLayerUiStore.getState().setActiveAdvancedTool('drawSurveyPolygon');
    useAdvancedLayerUiStore.getState().setMapPolygonDraft(draft);
    useAdvancedLayerUiStore.getState().setActiveAdvancedTool('drawSurveyPolygon');

    expect(useAdvancedLayerUiStore.getState().mapPolygonDraft).toEqual(draft);
  });

  it('clears fence map draft when switching to survey polygon drawing', () => {
    useAdvancedLayerUiStore.getState().setActiveAdvancedTool('drawFencePolygon');
    useAdvancedLayerUiStore.getState().setMapPolygonDraft({
      purpose: 'fence' as const,
      id: 'fence-draft-1',
      vertices: [{ lat: 40.416, lng: -3.704 }],
    });

    useAdvancedLayerUiStore.getState().setActiveAdvancedTool('drawSurveyPolygon');

    expect(useAdvancedLayerUiStore.getState().mapPolygonDraft).toBeNull();
  });

  it('clears selected waypoint draft when leaving selectFenceSource', () => {
    useAdvancedLayerUiStore.getState().setActiveAdvancedTool('selectFenceSource');
    useAdvancedLayerUiStore.getState().toggleSourceMissionItem('wp-1');

    useAdvancedLayerUiStore.getState().setActiveAdvancedTool('drawFencePolygon');

    expect(useAdvancedLayerUiStore.getState().selectedSourceMissionItemIds).toEqual([]);
  });

  it('preserves survey source waypoint selection while reasserting selectSurveySource', () => {
    useAdvancedLayerUiStore.getState().setActiveAdvancedTool('selectSurveySource');
    useAdvancedLayerUiStore.getState().toggleSourceMissionItem('wp-1');
    useAdvancedLayerUiStore.getState().setActiveAdvancedTool('selectSurveySource');

    expect(useAdvancedLayerUiStore.getState().selectedSourceMissionItemIds).toEqual(['wp-1']);
  });

  it('clears fence source waypoint selection when switching to survey source selection', () => {
    useAdvancedLayerUiStore.getState().setActiveAdvancedTool('selectFenceSource');
    useAdvancedLayerUiStore.getState().toggleSourceMissionItem('wp-1');

    useAdvancedLayerUiStore.getState().setActiveAdvancedTool('selectSurveySource');

    expect(useAdvancedLayerUiStore.getState().selectedSourceMissionItemIds).toEqual([]);
  });

  it('resetAdvancedLayerUi clears all draft state', () => {
    useAdvancedLayerUiStore.getState().setActiveAdvancedTool('drawFencePolygon');
    useAdvancedLayerUiStore.getState().setMapPolygonDraft({
      purpose: 'fence' as const,
      id: 'draft-1',
      vertices: [{ lat: 0, lng: 0 }],
    });
    useAdvancedLayerUiStore.getState().toggleSourceMissionItem('wp-1');

    useAdvancedLayerUiStore.getState().resetAdvancedLayerUi();

    expect(useAdvancedLayerUiStore.getState().activeAdvancedTool).toBe('select');
    expect(useAdvancedLayerUiStore.getState().mapPolygonDraft).toBeNull();
    expect(useAdvancedLayerUiStore.getState().selectedSourceMissionItemIds).toEqual([]);
  });
});
