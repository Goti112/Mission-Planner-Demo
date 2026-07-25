import { describe, expect, it } from 'vitest';
import type { AdvancedMissionPlan } from '../advancedMissionTypes';
import { appendMapFenceVertex } from '../advancedMapPlacement';

const emptyPlan = (): AdvancedMissionPlan => ({
  fences: [],
  rallyPoints: [],
  surveys: [],
});

describe('advancedMapPlacement', () => {
  it('accumulates vertices without touching the advanced plan', () => {
    const advanced = emptyPlan();

    const first = appendMapFenceVertex({
      advanced,
      draft: null,
      vertex: { lat: 40.416, lng: -3.704 },
      fenceId: 'fence-map-1',
      fenceName: 'Map Fence',
      maxAltitudeM: 120,
    });

    const second = appendMapFenceVertex({
      advanced: first.advanced,
      draft: first.draft,
      vertex: { lat: 40.417, lng: -3.703 },
      fenceId: 'fence-map-2',
      fenceName: 'Map Fence',
      maxAltitudeM: 120,
    });

    const third = appendMapFenceVertex({
      advanced: second.advanced,
      draft: second.draft,
      vertex: { lat: 40.418, lng: -3.705 },
      fenceId: 'fence-map-3',
      fenceName: 'Map Fence',
      maxAltitudeM: 120,
    });

    expect(first.advanced).toBe(advanced);
    expect(second.advanced).toBe(advanced);
    expect(third.advanced).toBe(advanced);
    expect(third.draft).toEqual({
      purpose: 'fence',
      id: 'fence-map-1',
      vertices: [
        { lat: 40.416, lng: -3.704 },
        { lat: 40.417, lng: -3.703 },
        { lat: 40.418, lng: -3.705 },
      ],
    });
    expect(third.selectedLayer).toBeNull();
  });
});
