import { describe, expect, it } from 'vitest';
import { createMissionItem, type MissionItem } from '../../domain';
import {
  buildFenceDraftFromMissionItems,
  buildFenceDraftFromVertices,
  buildRallyDraftFromCoordinate,
  buildRallyDraftFromMissionItem,
  buildSurveyDraftFromMissionItems,
  buildSurveyDraftFromVertices,
} from '../advancedLayerDrafts';

const missionItem = (
  id: string,
  seq: number,
  lat: number,
  lng: number,
  alt: number,
): MissionItem =>
  createMissionItem({
    id,
    seq,
    command: 'MAV_CMD_NAV_WAYPOINT',
    frame: 'MAV_FRAME_GLOBAL_RELATIVE_ALT_INT',
    current: seq === 0,
    autocontinue: true,
    params: [0, null, null, null, null, null, null],
    coordinate: { lat, lng, alt },
  });

describe('advancedLayerDrafts', () => {
  it('builds an independent polygon fence from selected mission item coordinates', () => {
    const items = [
      missionItem('wp-1', 0, 40.416, -3.704, 60),
      missionItem('wp-2', 1, 40.417, -3.703, 70),
      missionItem('wp-3', 2, 40.418, -3.705, 80),
    ];

    const fence = buildFenceDraftFromMissionItems({
      id: 'fence-1',
      name: 'Selection Fence',
      boundary: 'inclusion',
      maxAltitudeM: 120,
      items,
    });

    expect(fence).toEqual({
      id: 'fence-1',
      name: 'Selection Fence',
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

    expect(fence.vertices[0]).not.toBe(items[0].coordinate);
  });

  it('raises a source-count error when fewer than three coordinates are selected', () => {
    const items = [
      missionItem('wp-1', 0, 40.416, -3.704, 60),
      missionItem('wp-2', 1, 40.417, -3.703, 70),
    ];

    expect(() =>
      buildFenceDraftFromMissionItems({
        id: 'fence-1',
        name: 'Selection Fence',
        boundary: 'inclusion',
        maxAltitudeM: 120,
        items,
      }),
    ).toThrow('Cannot create polygon fence from selected mission items; coordinateCount=2, required=3.');
  });

  it('raises item ids when selected mission items do not have coordinates', () => {
    const missingCoordinate = createMissionItem({
      id: 'delay-1',
      seq: 2,
      command: 'MAV_CMD_NAV_DELAY',
      frame: 'MAV_FRAME_MISSION',
      current: false,
      autocontinue: true,
      params: [5, null, null, null, null, null, null],
      coordinate: null,
    });

    expect(() =>
      buildFenceDraftFromMissionItems({
        id: 'fence-1',
        name: 'Selection Fence',
        boundary: 'inclusion',
        maxAltitudeM: 120,
        items: [
          missionItem('wp-1', 0, 40.416, -3.704, 60),
          missionItem('wp-2', 1, 40.417, -3.703, 70),
          missingCoordinate,
        ],
      }),
    ).toThrow('Cannot create polygon fence because selected mission items have no coordinates: delay-1.');
  });

  it('builds a rally point from a mission item coordinate', () => {
    const item = missionItem('wp-1', 0, 40.416, -3.704, 60);
    const rally = buildRallyDraftFromMissionItem({
      id: 'rally-1',
      name: 'Waypoint Rally',
      item,
      loiterAltitudeM: 80,
      breakAltitudeM: 40,
      landHeadingDeg: null,
    });

    expect(rally).toEqual({
      id: 'rally-1',
      name: 'Waypoint Rally',
      coordinate: { lat: 40.416, lng: -3.704, alt: 60 },
      loiterAltitudeM: 80,
      breakAltitudeM: 40,
      landHeadingDeg: null,
    });
    expect(rally.coordinate).not.toBe(item.coordinate);
  });

  it('builds a rally point from a map coordinate', () => {
    const coordinate = { lat: 40.419, lng: -3.702, alt: 55 };
    const rally = buildRallyDraftFromCoordinate({
      id: 'rally-1',
      name: 'Map Rally',
      coordinate,
      loiterAltitudeM: 85,
      breakAltitudeM: null,
      landHeadingDeg: 270,
    });

    expect(rally.coordinate).toEqual({ lat: 40.419, lng: -3.702, alt: 55 });
    expect(rally.coordinate).not.toBe(coordinate);
    expect(rally.loiterAltitudeM).toBe(85);
    expect(rally.landHeadingDeg).toBe(270);
  });

  it('rejects a rally point with a negative coordinate altitude', () => {
    expect(() =>
      buildRallyDraftFromCoordinate({
        id: 'rally-1',
        name: 'Map Rally',
        coordinate: { lat: 40.419, lng: -3.702, alt: -1 },
        loiterAltitudeM: 85,
        breakAltitudeM: null,
        landHeadingDeg: 270,
      }),
    ).toThrow('Rally point rally-1 altitude must be greater than or equal to 0; alt=-1.');
  });

  it('rejects a rally point with a negative loiter altitude', () => {
    expect(() =>
      buildRallyDraftFromCoordinate({
        id: 'rally-1',
        name: 'Map Rally',
        coordinate: { lat: 40.419, lng: -3.702, alt: 55 },
        loiterAltitudeM: -1,
        breakAltitudeM: null,
        landHeadingDeg: 270,
      }),
    ).toThrow('Rally point rally-1 loiter altitude must be greater than or equal to 0; loiterAltitudeM=-1.');
  });

  it('builds a polygon fence from map draft vertices', () => {
    const vertices = [
      { lat: 40.416, lng: -3.704 },
      { lat: 40.417, lng: -3.703 },
      { lat: 40.418, lng: -3.705 },
    ];

    const fence = buildFenceDraftFromVertices({
      id: 'fence-1',
      name: 'Map Fence',
      boundary: 'inclusion',
      maxAltitudeM: 120,
      vertices,
    });

    expect(fence).toEqual({
      id: 'fence-1',
      name: 'Map Fence',
      shape: 'polygon',
      boundary: 'inclusion',
      vertices,
      minAltitudeM: null,
      maxAltitudeM: 120,
    });
    expect(fence.vertices[0]).not.toBe(vertices[0]);
  });

  it('raises a source-count error when fewer than three map vertices exist', () => {
    expect(() =>
      buildFenceDraftFromVertices({
        id: 'fence-1',
        name: 'Map Fence',
        boundary: 'inclusion',
        maxAltitudeM: 120,
        vertices: [
          { lat: 40.416, lng: -3.704 },
          { lat: 40.417, lng: -3.703 },
        ],
      }),
    ).toThrow('Cannot create polygon fence from map draft; vertexCount=2, required=3.');
  });

  it('builds a survey draft from selected mission item coordinates', () => {
    const items = [
      missionItem('wp-1', 0, 40.416, -3.704, 60),
      missionItem('wp-2', 1, 40.417, -3.703, 70),
      missionItem('wp-3', 2, 40.418, -3.705, 80),
    ];

    const survey = buildSurveyDraftFromMissionItems({
      id: 'survey-1',
      name: 'Selection Survey',
      altitudeM: 80,
      angleDeg: 0,
      laneSpacingM: 30,
      overshootM: 0,
      pattern: 'grid',
      startCorner: 'southWest',
      cameraTriggerMode: 'none',
      cameraTriggerDistanceM: 0,
      items,
    });

    expect(survey).toEqual({
      id: 'survey-1',
      name: 'Selection Survey',
      polygon: [
        { lat: 40.416, lng: -3.704 },
        { lat: 40.417, lng: -3.703 },
        { lat: 40.418, lng: -3.705 },
      ],
      altitudeM: 80,
      angleDeg: 0,
      laneSpacingM: 30,
      overshootM: 0,
      pattern: 'grid',
      startCorner: 'southWest',
      cameraTriggerMode: 'none',
      cameraTriggerDistanceM: 0,
    });
    expect(survey.polygon[0]).not.toBe(items[0].coordinate);
  });

  it('builds a survey draft from map vertices', () => {
    const vertices = [
      { lat: 40.416, lng: -3.704 },
      { lat: 40.417, lng: -3.703 },
      { lat: 40.418, lng: -3.705 },
    ];

    const survey = buildSurveyDraftFromVertices({
      id: 'survey-1',
      name: 'Map Survey',
      altitudeM: 90,
      angleDeg: 15,
      laneSpacingM: 25,
      overshootM: 5,
      pattern: 'crosshatch',
      startCorner: 'northEast',
      cameraTriggerMode: 'distance',
      cameraTriggerDistanceM: 20,
      vertices,
    });

    expect(survey.polygon).toEqual(vertices);
    expect(survey.polygon[0]).not.toBe(vertices[0]);
    expect(survey.pattern).toBe('crosshatch');
    expect(survey.cameraTriggerMode).toBe('distance');
  });

  it('raises item ids when survey source mission items do not have coordinates', () => {
    const missingCoordinate = createMissionItem({
      id: 'delay-1',
      seq: 2,
      command: 'MAV_CMD_NAV_DELAY',
      frame: 'MAV_FRAME_MISSION',
      current: false,
      autocontinue: true,
      params: [5, null, null, null, null, null, null],
      coordinate: null,
    });

    expect(() =>
      buildSurveyDraftFromMissionItems({
        id: 'survey-1',
        name: 'Selection Survey',
        altitudeM: 80,
        angleDeg: 0,
        laneSpacingM: 30,
        overshootM: 0,
        pattern: 'grid',
        startCorner: 'southWest',
        cameraTriggerMode: 'none',
        cameraTriggerDistanceM: 0,
        items: [
          missionItem('wp-1', 0, 40.416, -3.704, 60),
          missionItem('wp-2', 1, 40.417, -3.703, 70),
          missingCoordinate,
        ],
      }),
    ).toThrow('Cannot create survey because selected mission items have no coordinates: delay-1.');
  });

  it('raises a source-count error when fewer than three survey vertices exist', () => {
    expect(() =>
      buildSurveyDraftFromVertices({
        id: 'survey-1',
        name: 'Map Survey',
        altitudeM: 80,
        angleDeg: 0,
        laneSpacingM: 30,
        overshootM: 0,
        pattern: 'grid',
        startCorner: 'southWest',
        cameraTriggerMode: 'none',
        cameraTriggerDistanceM: 0,
        vertices: [
          { lat: 40.416, lng: -3.704 },
          { lat: 40.417, lng: -3.703 },
        ],
      }),
    ).toThrow('Cannot create survey from polygon draft; vertexCount=2, required=3.');
  });
});
