import { describe, expect, it } from 'vitest';
import type { SurveyGridSpec } from '../advancedMissionTypes';
import {
  generateSurveyGrid,
  isPointAllowedByFence,
  polygonAreaM2,
} from '../advancedMissionGeometry';

const square = [
  { lat: 40.416, lng: -3.704 },
  { lat: 40.416, lng: -3.702 },
  { lat: 40.418, lng: -3.702 },
  { lat: 40.418, lng: -3.704 },
];

const gridSpec = (pattern: SurveyGridSpec['pattern']): SurveyGridSpec => ({
  id: `survey-${pattern}`,
  name: `Survey ${pattern}`,
  polygon: square,
  altitudeM: 60,
  angleDeg: 0,
  laneSpacingM: 45,
  overshootM: 10,
  pattern,
  startCorner: 'southWest',
  cameraTriggerMode: 'distance',
  cameraTriggerDistanceM: 30,
});

describe('advancedMissionGeometry', () => {
  it('calculates polygon area and fence containment', () => {
    const area = polygonAreaM2(square);

    expect(area).toBeGreaterThan(35_000);
    expect(area).toBeLessThan(40_000);
    expect(
      isPointAllowedByFence(
        { lat: 40.417, lng: -3.703 },
        {
          id: 'fence-1',
          name: 'Keep in',
          shape: 'polygon',
          boundary: 'inclusion',
          vertices: square,
          minAltitudeM: null,
          maxAltitudeM: 120,
        },
      ),
    ).toBe(true);
    expect(
      isPointAllowedByFence(
        { lat: 40.419, lng: -3.703 },
        {
          id: 'fence-1',
          name: 'Keep in',
          shape: 'polygon',
          boundary: 'inclusion',
          vertices: square,
          minAltitudeM: null,
          maxAltitudeM: 120,
        },
      ),
    ).toBe(false);
  });

  it('generates survey waypoints and camera trigger command', () => {
    const generated = generateSurveyGrid(gridSpec('grid'));

    expect(generated.metrics.laneCount).toBeGreaterThan(2);
    expect(generated.metrics.waypointCount).toBe(generated.waypoints.length);
    expect(generated.metrics.estimatedPhotoCount).toBeGreaterThan(0);
    expect(generated.missionItems[0].command).toBe('MAV_CMD_DO_SET_CAM_TRIGG_DIST');
    expect(generated.missionItems[1].command).toBe('MAV_CMD_NAV_WAYPOINT');
    expect(generated.waypoints.every((waypoint) => waypoint.alt === 60)).toBe(true);
  });

  it('generates more lines for crosshatch than a single grid', () => {
    const grid = generateSurveyGrid(gridSpec('grid'));
    const crosshatch = generateSurveyGrid(gridSpec('crosshatch'));

    expect(crosshatch.metrics.laneCount).toBeGreaterThan(grid.metrics.laneCount);
    expect(crosshatch.waypoints.length).toBeGreaterThan(grid.waypoints.length);
  });
});
