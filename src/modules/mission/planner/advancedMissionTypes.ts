import type { MissionCoordinate, MissionItem } from '../domain';

export type AdvancedPlanLayer = 'mission' | 'fence' | 'rally' | 'survey';

export type FenceBoundaryKind = 'inclusion' | 'exclusion';
export type FenceShapeKind = 'polygon' | 'circle';

export interface FenceVertex {
  readonly lat: number;
  readonly lng: number;
}

export interface FenceBase {
  readonly id: string;
  readonly name: string;
  readonly boundary: FenceBoundaryKind;
}

export interface PolygonFence extends FenceBase {
  readonly shape: 'polygon';
  readonly vertices: readonly FenceVertex[];
  readonly minAltitudeM: number | null;
  readonly maxAltitudeM: number | null;
}

export interface CircleFence extends FenceBase {
  readonly shape: 'circle';
  readonly center: FenceVertex;
  readonly radiusM: number;
  readonly minAltitudeM: number | null;
  readonly maxAltitudeM: number | null;
}

export type FenceDefinition = PolygonFence | CircleFence;

export interface RallyPoint {
  readonly id: string;
  readonly name: string;
  readonly coordinate: MissionCoordinate;
  readonly loiterAltitudeM: number;
  readonly breakAltitudeM: number | null;
  readonly landHeadingDeg: number | null;
}

export type SurveyPatternKind = 'grid' | 'crosshatch';
export type SurveyCameraTriggerMode = 'none' | 'distance';
export type SurveyStartCorner = 'southWest' | 'northWest' | 'southEast' | 'northEast';

export interface SurveyGridSpec {
  readonly id: string;
  readonly name: string;
  readonly polygon: readonly FenceVertex[];
  readonly altitudeM: number;
  readonly angleDeg: number;
  readonly laneSpacingM: number;
  readonly overshootM: number;
  readonly pattern: SurveyPatternKind;
  readonly startCorner: SurveyStartCorner;
  readonly cameraTriggerMode: SurveyCameraTriggerMode;
  readonly cameraTriggerDistanceM: number | null;
}

export interface SurveyGridMetrics {
  readonly areaM2: number;
  readonly laneCount: number;
  readonly waypointCount: number;
  readonly pathDistanceM: number;
  readonly estimatedPhotoCount: number;
}

export interface GeneratedSurveyGrid {
  readonly spec: SurveyGridSpec;
  readonly waypoints: readonly MissionCoordinate[];
  readonly missionItems: readonly MissionItem[];
  readonly metrics: SurveyGridMetrics;
}

export interface AdvancedMissionPlan {
  readonly fences: readonly FenceDefinition[];
  readonly rallyPoints: readonly RallyPoint[];
  readonly surveys: readonly SurveyGridSpec[];
}

export interface AdvancedMissionUploadItem {
  readonly frame: number;
  readonly command: number;
  readonly params: readonly [number, number, number, number, number, number, number];
  readonly sourceId: string;
  readonly sourceType: 'fence' | 'rally';
}

export const emptyAdvancedMissionPlan = (): AdvancedMissionPlan => ({
  fences: [],
  rallyPoints: [],
  surveys: [],
});
