import type { MissionCoordinate, MissionItem } from '../domain';
import type {
  FenceBoundaryKind,
  FenceVertex,
  PolygonFence,
  RallyPoint,
  SurveyGridSpec,
} from './advancedMissionTypes';

const MIN_POLYGON_VERTICES = 3;

export class AdvancedLayerDraftError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AdvancedLayerDraftError';
  }
}

export interface BuildFenceDraftFromMissionItemsInput {
  readonly id: string;
  readonly name: string;
  readonly boundary: FenceBoundaryKind;
  readonly minAltitudeM?: number | null;
  readonly maxAltitudeM: number | null;
  readonly items: readonly MissionItem[];
}

export interface BuildFenceDraftFromVerticesInput {
  readonly id: string;
  readonly name: string;
  readonly boundary: FenceBoundaryKind;
  readonly minAltitudeM?: number | null;
  readonly maxAltitudeM: number | null;
  readonly vertices: readonly FenceVertex[];
}

export interface BuildRallyDraftFromCoordinateInput {
  readonly id: string;
  readonly name: string;
  readonly coordinate: MissionCoordinate;
  readonly loiterAltitudeM: number;
  readonly breakAltitudeM: number | null;
  readonly landHeadingDeg: number | null;
}

export interface BuildRallyDraftFromMissionItemInput {
  readonly id: string;
  readonly name: string;
  readonly item: MissionItem;
  readonly loiterAltitudeM: number;
  readonly breakAltitudeM: number | null;
  readonly landHeadingDeg: number | null;
}

export interface BuildSurveyDraftFromMissionItemsInput {
  readonly id: string;
  readonly name: string;
  readonly altitudeM: number;
  readonly angleDeg: number;
  readonly laneSpacingM: number;
  readonly overshootM: number;
  readonly pattern: SurveyGridSpec['pattern'];
  readonly startCorner: SurveyGridSpec['startCorner'];
  readonly cameraTriggerMode: SurveyGridSpec['cameraTriggerMode'];
  readonly cameraTriggerDistanceM: number;
  readonly items: readonly MissionItem[];
}

export interface BuildSurveyDraftFromVerticesInput {
  readonly id: string;
  readonly name: string;
  readonly altitudeM: number;
  readonly angleDeg: number;
  readonly laneSpacingM: number;
  readonly overshootM: number;
  readonly pattern: SurveyGridSpec['pattern'];
  readonly startCorner: SurveyGridSpec['startCorner'];
  readonly cameraTriggerMode: SurveyGridSpec['cameraTriggerMode'];
  readonly cameraTriggerDistanceM: number;
  readonly vertices: readonly FenceVertex[];
}

const assertFiniteNumber = (value: number, label: string): void => {
  if (!Number.isFinite(value)) {
    throw new AdvancedLayerDraftError(`${label} must be finite; value=${value}.`);
  }
};

const assertNullableFiniteNumber = (value: number | null, label: string): void => {
  if (value !== null) {
    assertFiniteNumber(value, label);
  }
};

const assertNonNegativeFiniteNumber = (
  value: number,
  label: string,
  message: string,
): void => {
  assertFiniteNumber(value, label);

  if (value < 0) {
    throw new AdvancedLayerDraftError(message);
  }
};

const assertFenceVertex = (vertex: FenceVertex, label: string): void => {
  assertFiniteNumber(vertex.lat, `${label}.lat`);
  assertFiniteNumber(vertex.lng, `${label}.lng`);

  if (vertex.lat < -90 || vertex.lat > 90) {
    throw new AdvancedLayerDraftError(`${label}.lat must be between -90 and 90 degrees; lat=${vertex.lat}.`);
  }

  if (vertex.lng < -180 || vertex.lng > 180) {
    throw new AdvancedLayerDraftError(`${label}.lng must be between -180 and 180 degrees; lng=${vertex.lng}.`);
  }
};

const assertRallyCoordinate = (coordinate: MissionCoordinate, rallyId: string): void => {
  assertFenceVertex(coordinate, `rally.${rallyId}.coordinate`);
  assertNonNegativeFiniteNumber(
    coordinate.alt,
    `rally.${rallyId}.coordinate.alt`,
    `Rally point ${rallyId} altitude must be greater than or equal to 0; alt=${coordinate.alt}.`,
  );
};

const cloneFenceVertex = (coordinate: MissionCoordinate): FenceVertex => ({
  lat: coordinate.lat,
  lng: coordinate.lng,
});

const cloneFenceDraftVertex = (vertex: FenceVertex): FenceVertex => ({
  lat: vertex.lat,
  lng: vertex.lng,
});

const cloneMissionCoordinate = (coordinate: MissionCoordinate): MissionCoordinate => ({
  lat: coordinate.lat,
  lng: coordinate.lng,
  alt: coordinate.alt,
});

const requireMissionItemCoordinate = (item: MissionItem): MissionCoordinate => {
  if (item.coordinate === null) {
    throw new AdvancedLayerDraftError(`Mission item ${item.id} does not have a coordinate.`);
  }

  return item.coordinate;
};

const buildMissingCoordinateMessage = (items: readonly MissionItem[]): string | null => {
  const ids = items
    .filter((item) => item.coordinate === null)
    .map((item) => item.id);

  if (ids.length === 0) {
    return null;
  }

  return `Cannot create polygon fence because selected mission items have no coordinates: ${ids.join(', ')}.`;
};

const buildMissingSurveyCoordinateMessage = (items: readonly MissionItem[]): string | null => {
  const ids = items
    .filter((item) => item.coordinate === null)
    .map((item) => item.id);

  if (ids.length === 0) {
    return null;
  }

  return `Cannot create survey because selected mission items have no coordinates: ${ids.join(', ')}.`;
};

const assertSurveyMetrics = (input: {
  readonly id: string;
  readonly altitudeM: number;
  readonly angleDeg: number;
  readonly laneSpacingM: number;
  readonly overshootM: number;
  readonly cameraTriggerDistanceM: number;
}): void => {
  assertNonNegativeFiniteNumber(
    input.altitudeM,
    `survey.${input.id}.altitudeM`,
    `Survey ${input.id} altitude must be greater than or equal to 0; altitudeM=${input.altitudeM}.`,
  );
  assertFiniteNumber(input.angleDeg, `survey.${input.id}.angleDeg`);
  assertNonNegativeFiniteNumber(
    input.laneSpacingM,
    `survey.${input.id}.laneSpacingM`,
    `Survey ${input.id} lane spacing must be greater than or equal to 0; laneSpacingM=${input.laneSpacingM}.`,
  );
  assertNonNegativeFiniteNumber(
    input.overshootM,
    `survey.${input.id}.overshootM`,
    `Survey ${input.id} overshoot must be greater than or equal to 0; overshootM=${input.overshootM}.`,
  );
  assertNonNegativeFiniteNumber(
    input.cameraTriggerDistanceM,
    `survey.${input.id}.cameraTriggerDistanceM`,
    `Survey ${input.id} camera trigger distance must be greater than or equal to 0; cameraTriggerDistanceM=${input.cameraTriggerDistanceM}.`,
  );
};

export const buildFenceDraftFromMissionItems = (
  input: BuildFenceDraftFromMissionItemsInput,
): PolygonFence => {
  const missingCoordinateMessage = buildMissingCoordinateMessage(input.items);

  if (missingCoordinateMessage !== null) {
    throw new AdvancedLayerDraftError(missingCoordinateMessage);
  }

  const vertices = input.items.map((item, index): FenceVertex => {
    const coordinate = requireMissionItemCoordinate(item);
    const vertex = cloneFenceVertex(coordinate);

    assertFenceVertex(vertex, `fence.${input.id}.vertices[${index}]`);

    return vertex;
  });

  if (vertices.length < MIN_POLYGON_VERTICES) {
    throw new AdvancedLayerDraftError(
      `Cannot create polygon fence from selected mission items; coordinateCount=${vertices.length}, required=${MIN_POLYGON_VERTICES}.`,
    );
  }

  assertNullableFiniteNumber(input.minAltitudeM ?? null, `fence.${input.id}.minAltitudeM`);
  assertNullableFiniteNumber(input.maxAltitudeM, `fence.${input.id}.maxAltitudeM`);

  return {
    id: input.id,
    name: input.name,
    shape: 'polygon',
    boundary: input.boundary,
    vertices,
    minAltitudeM: input.minAltitudeM ?? null,
    maxAltitudeM: input.maxAltitudeM,
  };
};

export const buildFenceDraftFromVertices = (
  input: BuildFenceDraftFromVerticesInput,
): PolygonFence => {
  const vertices = input.vertices.map((vertex, index): FenceVertex => {
    const clonedVertex = cloneFenceDraftVertex(vertex);

    assertFenceVertex(clonedVertex, `fence.${input.id}.vertices[${index}]`);

    return clonedVertex;
  });

  if (vertices.length < MIN_POLYGON_VERTICES) {
    throw new AdvancedLayerDraftError(
      `Cannot create polygon fence from map draft; vertexCount=${vertices.length}, required=${MIN_POLYGON_VERTICES}.`,
    );
  }

  assertNullableFiniteNumber(input.minAltitudeM ?? null, `fence.${input.id}.minAltitudeM`);
  assertNullableFiniteNumber(input.maxAltitudeM, `fence.${input.id}.maxAltitudeM`);

  return {
    id: input.id,
    name: input.name,
    shape: 'polygon',
    boundary: input.boundary,
    vertices,
    minAltitudeM: input.minAltitudeM ?? null,
    maxAltitudeM: input.maxAltitudeM,
  };
};

export const buildRallyDraftFromCoordinate = (
  input: BuildRallyDraftFromCoordinateInput,
): RallyPoint => {
  const coordinate = cloneMissionCoordinate(input.coordinate);

  assertRallyCoordinate(coordinate, input.id);
  assertNonNegativeFiniteNumber(
    input.loiterAltitudeM,
    `rally.${input.id}.loiterAltitudeM`,
    `Rally point ${input.id} loiter altitude must be greater than or equal to 0; loiterAltitudeM=${input.loiterAltitudeM}.`,
  );
  assertNullableFiniteNumber(input.breakAltitudeM, `rally.${input.id}.breakAltitudeM`);
  assertNullableFiniteNumber(input.landHeadingDeg, `rally.${input.id}.landHeadingDeg`);

  return {
    id: input.id,
    name: input.name,
    coordinate,
    loiterAltitudeM: input.loiterAltitudeM,
    breakAltitudeM: input.breakAltitudeM,
    landHeadingDeg: input.landHeadingDeg,
  };
};

export const buildRallyDraftFromMissionItem = (
  input: BuildRallyDraftFromMissionItemInput,
): RallyPoint => {
  if (input.item.coordinate === null) {
    throw new AdvancedLayerDraftError(
      `Cannot create rally point because selected mission item has no coordinate: ${input.item.id}.`,
    );
  }

  return buildRallyDraftFromCoordinate({
    id: input.id,
    name: input.name,
    coordinate: input.item.coordinate,
    loiterAltitudeM: input.loiterAltitudeM,
    breakAltitudeM: input.breakAltitudeM,
    landHeadingDeg: input.landHeadingDeg,
  });
};

export const buildSurveyDraftFromVertices = (
  input: BuildSurveyDraftFromVerticesInput,
): SurveyGridSpec => {
  const polygon = input.vertices.map((vertex, index): FenceVertex => {
    const clonedVertex = cloneFenceDraftVertex(vertex);

    assertFenceVertex(clonedVertex, `survey.${input.id}.polygon[${index}]`);

    return clonedVertex;
  });

  if (polygon.length < MIN_POLYGON_VERTICES) {
    throw new AdvancedLayerDraftError(
      `Cannot create survey from polygon draft; vertexCount=${polygon.length}, required=${MIN_POLYGON_VERTICES}.`,
    );
  }

  assertSurveyMetrics(input);

  return {
    id: input.id,
    name: input.name,
    polygon,
    altitudeM: input.altitudeM,
    angleDeg: input.angleDeg,
    laneSpacingM: input.laneSpacingM,
    overshootM: input.overshootM,
    pattern: input.pattern,
    startCorner: input.startCorner,
    cameraTriggerMode: input.cameraTriggerMode,
    cameraTriggerDistanceM: input.cameraTriggerDistanceM,
  };
};

export const buildSurveyDraftFromMissionItems = (
  input: BuildSurveyDraftFromMissionItemsInput,
): SurveyGridSpec => {
  const missingCoordinateMessage = buildMissingSurveyCoordinateMessage(input.items);

  if (missingCoordinateMessage !== null) {
    throw new AdvancedLayerDraftError(missingCoordinateMessage);
  }

  const vertices = input.items.map((item): FenceVertex => {
    const coordinate = requireMissionItemCoordinate(item);

    return cloneFenceVertex(coordinate);
  });

  return buildSurveyDraftFromVertices({
    id: input.id,
    name: input.name,
    altitudeM: input.altitudeM,
    angleDeg: input.angleDeg,
    laneSpacingM: input.laneSpacingM,
    overshootM: input.overshootM,
    pattern: input.pattern,
    startCorner: input.startCorner,
    cameraTriggerMode: input.cameraTriggerMode,
    cameraTriggerDistanceM: input.cameraTriggerDistanceM,
    vertices,
  });
};
