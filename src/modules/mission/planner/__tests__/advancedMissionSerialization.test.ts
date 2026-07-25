import { describe, expect, it } from 'vitest';
import type { AdvancedMissionPlan } from '../advancedMissionTypes';
import {
  buildAdvancedMissionUploadItems,
  exportAdvancedPlanToJson,
  exportAdvancedPlanToQgcWpl,
  importAdvancedPlanFromJson,
  importAdvancedPlanFromQgcWpl,
} from '../advancedMissionSerialization';

const advancedPlan = (): AdvancedMissionPlan => ({
  fences: [
    {
      id: 'fence-poly',
      name: 'Site Boundary',
      shape: 'polygon',
      boundary: 'inclusion',
      vertices: [
        { lat: 40.416, lng: -3.704 },
        { lat: 40.416, lng: -3.702 },
        { lat: 40.418, lng: -3.702 },
      ],
      minAltitudeM: null,
      maxAltitudeM: 120,
    },
    {
      id: 'fence-circle',
      name: 'No Fly',
      shape: 'circle',
      boundary: 'exclusion',
      center: { lat: 40.417, lng: -3.703 },
      radiusM: 35,
      minAltitudeM: null,
      maxAltitudeM: null,
    },
  ],
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

describe('advancedMissionSerialization', () => {
  it('exports advanced plan as validated JSON', () => {
    const exported = exportAdvancedPlanToJson(advancedPlan());
    const imported = importAdvancedPlanFromJson(exported);

    expect(imported.fences).toHaveLength(2);
    expect(imported.rallyPoints).toHaveLength(1);
  });

  it('maps fences and rally points to upload commands', () => {
    const uploadItems = buildAdvancedMissionUploadItems(advancedPlan());

    expect(uploadItems.map((item) => item.command)).toEqual([5001, 5001, 5001, 5004, 5100]);
    expect(uploadItems[0].params[0]).toBe(3);
    expect(uploadItems[3].params[0]).toBe(35);
  });

  it('round trips supported QGC WPL fence and rally rows', () => {
    const exported = exportAdvancedPlanToQgcWpl(advancedPlan());
    const imported = importAdvancedPlanFromQgcWpl(exported);

    expect(exported.startsWith('QGC WPL 110')).toBe(true);
    expect(imported.fences).toHaveLength(2);
    expect(imported.rallyPoints).toHaveLength(1);
    expect(imported.fences[0]).toMatchObject({
      shape: 'polygon',
      boundary: 'inclusion',
    });
    expect(imported.fences[1]).toMatchObject({
      shape: 'circle',
      boundary: 'exclusion',
    });
  });
});
