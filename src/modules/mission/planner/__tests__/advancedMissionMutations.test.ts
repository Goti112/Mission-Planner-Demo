import { describe, expect, it } from 'vitest';
import type { AdvancedMissionPlan, PolygonFence } from '../advancedMissionTypes';
import {
  AdvancedMissionMutationError,
  insertPolygonFenceVertex,
  removePolygonFenceVertex,
  updatePolygonFenceVertex,
  updateRallyPointCoordinate,
} from '../advancedMissionMutations';

const fence = (): PolygonFence => ({
  id: 'fence-1',
  name: 'Site Fence',
  shape: 'polygon',
  boundary: 'inclusion',
  vertices: [
    { lat: 40.416, lng: -3.704 },
    { lat: 40.417, lng: -3.703 },
    { lat: 40.418, lng: -3.705 },
  ],
  minAltitudeM: null,
  maxAltitudeM: 120,
});

const fourVertexFence = (): PolygonFence => ({
  ...fence(),
  vertices: [
    { lat: 40.416, lng: -3.704 },
    { lat: 40.417, lng: -3.703 },
    { lat: 40.418, lng: -3.705 },
    { lat: 40.419, lng: -3.706 },
  ],
});

const plan = (): AdvancedMissionPlan => ({
  fences: [fence()],
  rallyPoints: [
    {
      id: 'rally-1',
      name: 'North Rally',
      coordinate: { lat: 40.419, lng: -3.705, alt: 60 },
      loiterAltitudeM: 80,
      breakAltitudeM: 40,
      landHeadingDeg: null,
    },
  ],
  surveys: [],
});

const fourVertexPlan = (): AdvancedMissionPlan => ({
  ...plan(),
  fences: [fourVertexFence()],
});

describe('advancedMissionMutations layer editing', () => {
  it('updates a polygon fence vertex without mutating the input plan', () => {
    const original = plan();
    const updated = updatePolygonFenceVertex(original, 'fence-1', 1, { lat: 40.42, lng: -3.701 });

    expect(updated.fences[0]).toMatchObject({
      id: 'fence-1',
      shape: 'polygon',
      vertices: [
        { lat: 40.416, lng: -3.704 },
        { lat: 40.42, lng: -3.701 },
        { lat: 40.418, lng: -3.705 },
      ],
    });
    expect(original.fences[0]).toEqual(fence());
  });

  it('inserts a polygon fence vertex after the requested index', () => {
    const updated = insertPolygonFenceVertex(plan(), 'fence-1', 0, { lat: 40.4165, lng: -3.7035 });

    expect(updated.fences[0]?.shape).toBe('polygon');
    expect(updated.fences[0]?.shape === 'polygon' ? updated.fences[0].vertices : []).toEqual([
      { lat: 40.416, lng: -3.704 },
      { lat: 40.4165, lng: -3.7035 },
      { lat: 40.417, lng: -3.703 },
      { lat: 40.418, lng: -3.705 },
    ]);
  });

  it('removes a polygon fence vertex while preserving the minimum polygon size', () => {
    const original = plan();

    expect(() => removePolygonFenceVertex(original, 'fence-1', 0)).toThrow(
      'Cannot remove vertex 0 from polygon fence fence-1 because a polygon fence requires at least 3 vertices.',
    );
  });

  it('removes a polygon fence vertex from polygons with more than three vertices without mutating the input plan', () => {
    const original = fourVertexPlan();
    const updated = removePolygonFenceVertex(original, 'fence-1', 1);

    expect(updated.fences[0]?.shape).toBe('polygon');
    expect(updated.fences[0]?.shape === 'polygon' ? updated.fences[0].vertices : []).toEqual([
      { lat: 40.416, lng: -3.704 },
      { lat: 40.418, lng: -3.705 },
      { lat: 40.419, lng: -3.706 },
    ]);
    expect(original.fences[0]).toEqual(fourVertexFence());
  });

  it('raises mutation errors for invalid polygon fence vertices', () => {
    expect(() => updatePolygonFenceVertex(plan(), 'fence-1', 1, { lat: 91, lng: -3.701 })).toThrowError(
      AdvancedMissionMutationError,
    );
  });

  it('updates a rally coordinate without changing rally settings', () => {
    const updated = updateRallyPointCoordinate(plan(), 'rally-1', { lat: 40.421, lng: -3.706, alt: 75 });
    const rallyPoint = updated.rallyPoints[0];

    expect(rallyPoint.coordinate).toEqual({ lat: 40.421, lng: -3.706, alt: 75 });
    expect(rallyPoint.loiterAltitudeM).toBe(80);
    expect(rallyPoint.breakAltitudeM).toBe(40);
  });

  it('raises mutation errors for invalid rally coordinate vertices', () => {
    expect(() => updateRallyPointCoordinate(plan(), 'rally-1', { lat: 40.421, lng: 181, alt: 75 })).toThrowError(
      AdvancedMissionMutationError,
    );
  });
});
