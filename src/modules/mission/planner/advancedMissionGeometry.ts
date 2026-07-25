import { createMissionItem, type MissionCoordinate, type MissionItem, type MissionParams } from '../domain';
import type {
  FenceDefinition,
  FenceVertex,
  GeneratedSurveyGrid,
  SurveyGridMetrics,
  SurveyGridSpec,
  SurveyStartCorner,
} from './advancedMissionTypes';

interface LocalPoint {
  readonly x: number;
  readonly y: number;
}

interface SurveySegment {
  readonly start: MissionCoordinate;
  readonly end: MissionCoordinate;
  readonly acrossM: number;
}

interface GeneratedLineSegment {
  readonly a: LocalPoint;
  readonly b: LocalPoint;
  readonly acrossM: number;
}

interface Projection {
  readonly origin: FenceVertex;
  readonly cosLat: number;
}

const EARTH_RADIUS_M = 6378137;
const MIN_POLYGON_VERTICES = 3;
const EPSILON = 1e-9;

const toRadians = (degrees: number): number => (degrees * Math.PI) / 180;
const toDegrees = (radians: number): number => (radians * 180) / Math.PI;

const assertFiniteNumber = (value: number, name: string): void => {
  if (!Number.isFinite(value)) {
    throw new Error(`${name} must be finite; value=${value}.`);
  }
};

const normalizeLongitudeDelta = (deltaLng: number): number => {
  if (deltaLng > 180) {
    return deltaLng - 360;
  }

  if (deltaLng < -180) {
    return deltaLng + 360;
  }

  return deltaLng;
};

export const assertFenceVertex = (vertex: FenceVertex, label: string): void => {
  assertFiniteNumber(vertex.lat, `${label}.lat`);
  assertFiniteNumber(vertex.lng, `${label}.lng`);

  if (vertex.lat < -90 || vertex.lat > 90) {
    throw new Error(`${label}.lat must be between -90 and 90 degrees; lat=${vertex.lat}.`);
  }

  if (vertex.lng < -180 || vertex.lng > 180) {
    throw new Error(`${label}.lng must be between -180 and 180 degrees; lng=${vertex.lng}.`);
  }
};

export const assertPolygonVertices = (vertices: readonly FenceVertex[], label: string): void => {
  if (vertices.length < MIN_POLYGON_VERTICES) {
    throw new Error(`${label} requires at least ${MIN_POLYGON_VERTICES} vertices; count=${vertices.length}.`);
  }

  vertices.forEach((vertex, index) => assertFenceVertex(vertex, `${label}[${index}]`));
};

const buildProjection = (vertices: readonly FenceVertex[]): Projection => {
  if (vertices.length === 0) {
    throw new Error('Cannot build local projection without vertices.');
  }

  const origin = vertices.reduce(
    (accumulator, vertex) => ({
      lat: accumulator.lat + vertex.lat / vertices.length,
      lng: accumulator.lng + vertex.lng / vertices.length,
    }),
    { lat: 0, lng: 0 },
  );
  const cosLat = Math.cos(toRadians(origin.lat));

  if (Math.abs(cosLat) < EPSILON) {
    throw new Error(`Cannot project vertices near the poles; originLat=${origin.lat}.`);
  }

  return { origin, cosLat };
};

const projectVertex = (vertex: FenceVertex, projection: Projection): LocalPoint => ({
  x: toRadians(normalizeLongitudeDelta(vertex.lng - projection.origin.lng)) * EARTH_RADIUS_M * projection.cosLat,
  y: toRadians(vertex.lat - projection.origin.lat) * EARTH_RADIUS_M,
});

const unprojectPoint = (point: LocalPoint, altitudeM: number, projection: Projection): MissionCoordinate => ({
  lat: projection.origin.lat + toDegrees(point.y / EARTH_RADIUS_M),
  lng: projection.origin.lng + toDegrees(point.x / (EARTH_RADIUS_M * projection.cosLat)),
  alt: altitudeM,
});

const distanceLocal = (a: LocalPoint, b: LocalPoint): number => Math.hypot(a.x - b.x, a.y - b.y);

export const distanceMeters = (a: FenceVertex, b: FenceVertex): number => {
  assertFenceVertex(a, 'a');
  assertFenceVertex(b, 'b');

  const lat1 = toRadians(a.lat);
  const lat2 = toRadians(b.lat);
  const dLat = toRadians(b.lat - a.lat);
  const dLng = toRadians(normalizeLongitudeDelta(b.lng - a.lng));
  const sinLat = Math.sin(dLat / 2);
  const sinLng = Math.sin(dLng / 2);
  const h = sinLat * sinLat + Math.cos(lat1) * Math.cos(lat2) * sinLng * sinLng;

  return 2 * EARTH_RADIUS_M * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
};

export const polygonAreaM2 = (vertices: readonly FenceVertex[]): number => {
  assertPolygonVertices(vertices, 'polygon');

  const projection = buildProjection(vertices);
  const points = vertices.map((vertex) => projectVertex(vertex, projection));
  const twiceArea = points.reduce((sum, point, index) => {
    const next = points[(index + 1) % points.length];

    return sum + point.x * next.y - next.x * point.y;
  }, 0);

  return Math.abs(twiceArea) / 2;
};

export const isPointInsidePolygon = (
  point: FenceVertex,
  polygon: readonly FenceVertex[],
): boolean => {
  assertFenceVertex(point, 'point');
  assertPolygonVertices(polygon, 'polygon');

  const projection = buildProjection([...polygon, point]);
  const localPoint = projectVertex(point, projection);
  const localPolygon = polygon.map((vertex) => projectVertex(vertex, projection));

  return localPolygon.reduce((inside, vertex, index) => {
    const previous = localPolygon[(index + localPolygon.length - 1) % localPolygon.length];
    const crosses =
      vertex.y > localPoint.y !== previous.y > localPoint.y &&
      localPoint.x < ((previous.x - vertex.x) * (localPoint.y - vertex.y)) / (previous.y - vertex.y) + vertex.x;

    return crosses ? !inside : inside;
  }, false);
};

export const isPointAllowedByFence = (
  point: FenceVertex,
  fence: FenceDefinition,
): boolean => {
  assertFenceVertex(point, 'point');

  if (fence.shape === 'circle') {
    assertFenceVertex(fence.center, `fence.${fence.id}.center`);

    if (!Number.isFinite(fence.radiusM) || fence.radiusM <= 0) {
      throw new Error(`Circle fence ${fence.id} radius must be positive; radiusM=${fence.radiusM}.`);
    }

    const insideCircle = distanceMeters(point, fence.center) <= fence.radiusM;

    return fence.boundary === 'inclusion' ? insideCircle : !insideCircle;
  }

  assertPolygonVertices(fence.vertices, `fence.${fence.id}.vertices`);

  const insidePolygon = isPointInsidePolygon(point, fence.vertices);

  return fence.boundary === 'inclusion' ? insidePolygon : !insidePolygon;
};

const segmentDistance = (coordinates: readonly MissionCoordinate[]): number =>
  coordinates.slice(1).reduce(
    (total, coordinate, index) => total + distanceMeters(coordinates[index], coordinate),
    0,
  );

const lineIntersections = (
  polygon: readonly LocalPoint[],
  acrossM: number,
  direction: LocalPoint,
  normal: LocalPoint,
): readonly number[] => {
  const intersections = polygon.reduce<number[]>((items, start, index) => {
    const end = polygon[(index + 1) % polygon.length];
    const startAcross = start.x * normal.x + start.y * normal.y;
    const endAcross = end.x * normal.x + end.y * normal.y;
    const deltaAcross = endAcross - startAcross;

    if (Math.abs(deltaAcross) < EPSILON) {
      return items;
    }

    const t = (acrossM - startAcross) / deltaAcross;

    if (t < -EPSILON || t > 1 + EPSILON) {
      return items;
    }

    const x = start.x + (end.x - start.x) * t;
    const y = start.y + (end.y - start.y) * t;
    const alongM = x * direction.x + y * direction.y;

    return [...items, alongM];
  }, []);
  const unique = intersections
    .sort((a, b) => a - b)
    .filter((value, index, values) => index === 0 || Math.abs(value - values[index - 1]) > 0.01);

  return unique;
};

const createGridLineSegments = (
  polygon: readonly LocalPoint[],
  angleDeg: number,
  laneSpacingM: number,
  overshootM: number,
): readonly GeneratedLineSegment[] => {
  if (!Number.isFinite(laneSpacingM) || laneSpacingM <= 0) {
    throw new Error(`Survey lane spacing must be positive; laneSpacingM=${laneSpacingM}.`);
  }

  if (!Number.isFinite(overshootM) || overshootM < 0) {
    throw new Error(`Survey overshoot must be greater than or equal to 0; overshootM=${overshootM}.`);
  }

  const bearingRad = toRadians(angleDeg);
  const direction = { x: Math.sin(bearingRad), y: Math.cos(bearingRad) };
  const normal = { x: Math.cos(bearingRad), y: -Math.sin(bearingRad) };
  const acrossValues = polygon.map((point) => point.x * normal.x + point.y * normal.y);
  const minAcross = Math.min(...acrossValues);
  const maxAcross = Math.max(...acrossValues);
  const firstAcross = Math.ceil(minAcross / laneSpacingM) * laneSpacingM;
  const segments: GeneratedLineSegment[] = [];

  for (let acrossM = firstAcross; acrossM <= maxAcross + EPSILON; acrossM += laneSpacingM) {
    const intersections = lineIntersections(polygon, acrossM, direction, normal);

    for (let index = 0; index + 1 < intersections.length; index += 2) {
      const startAlong = intersections[index] - overshootM;
      const endAlong = intersections[index + 1] + overshootM;
      const a = {
        x: direction.x * startAlong + normal.x * acrossM,
        y: direction.y * startAlong + normal.y * acrossM,
      };
      const b = {
        x: direction.x * endAlong + normal.x * acrossM,
        y: direction.y * endAlong + normal.y * acrossM,
      };

      if (distanceLocal(a, b) > EPSILON) {
        segments.push({ a, b, acrossM });
      }
    }
  }

  return segments;
};

const startCornerPoint = (
  polygon: readonly LocalPoint[],
  startCorner: SurveyStartCorner,
): LocalPoint => {
  const xs = polygon.map((point) => point.x);
  const ys = polygon.map((point) => point.y);
  const west = Math.min(...xs);
  const east = Math.max(...xs);
  const south = Math.min(...ys);
  const north = Math.max(...ys);

  switch (startCorner) {
    case 'southWest':
      return { x: west, y: south };
    case 'northWest':
      return { x: west, y: north };
    case 'southEast':
      return { x: east, y: south };
    case 'northEast':
      return { x: east, y: north };
  }
};

const orientSegments = (
  segments: readonly GeneratedLineSegment[],
  target: LocalPoint,
  altitudeM: number,
  projection: Projection,
): readonly SurveySegment[] => {
  const sortedAsc = [...segments].sort((a, b) => a.acrossM - b.acrossM);
  const candidates = [
    { items: sortedAsc, reverseFirst: false },
    { items: sortedAsc, reverseFirst: true },
    { items: [...sortedAsc].reverse(), reverseFirst: false },
    { items: [...sortedAsc].reverse(), reverseFirst: true },
  ];
  const scored = candidates.map((candidate) => {
    const first = candidate.items[0];
    const start = candidate.reverseFirst ? first?.b : first?.a;
    const score = start === undefined ? Number.POSITIVE_INFINITY : distanceLocal(start, target);

    return { candidate, score };
  });
  const winner = scored.reduce((best, item) => (item.score < best.score ? item : best), scored[0]);

  return winner.candidate.items.map((segment, index): SurveySegment => {
    const reverse = index % 2 === (winner.candidate.reverseFirst ? 0 : 1);
    const start = reverse ? segment.b : segment.a;
    const end = reverse ? segment.a : segment.b;

    return {
      start: unprojectPoint(start, altitudeM, projection),
      end: unprojectPoint(end, altitudeM, projection),
      acrossM: segment.acrossM,
    };
  });
};

const orientSegmentsFromCorner = (
  segments: readonly GeneratedLineSegment[],
  polygon: readonly LocalPoint[],
  startCorner: SurveyStartCorner,
  altitudeM: number,
  projection: Projection,
): readonly SurveySegment[] => orientSegments(
  segments,
  startCornerPoint(polygon, startCorner),
  altitudeM,
  projection,
);

const waypointParams = (): MissionParams => [0, null, null, null, null, null, null];

const cameraTriggerParams = (distanceM: number): MissionParams => [distanceM, 0, 0, null, null, null, null];

const createSurveyMissionItems = (
  spec: SurveyGridSpec,
  waypoints: readonly MissionCoordinate[],
): readonly MissionItem[] => {
  const triggerItems =
    spec.cameraTriggerMode === 'distance' && spec.cameraTriggerDistanceM !== null
      ? [
          createMissionItem({
            id: `${spec.id}-camera-trigger`,
            seq: 0,
            command: 'MAV_CMD_DO_SET_CAM_TRIGG_DIST',
            frame: 'MAV_FRAME_MISSION',
            current: false,
            autocontinue: true,
            params: cameraTriggerParams(spec.cameraTriggerDistanceM),
            coordinate: null,
          }),
        ]
      : [];

  return [
    ...triggerItems,
    ...waypoints.map((coordinate, index) =>
      createMissionItem({
        id: `${spec.id}-wp-${(index + 1).toString()}`,
        seq: triggerItems.length + index,
        command: 'MAV_CMD_NAV_WAYPOINT',
        frame: 'MAV_FRAME_GLOBAL_RELATIVE_ALT_INT',
        current: triggerItems.length + index === 0,
        autocontinue: true,
        params: waypointParams(),
        coordinate,
      }),
    ),
  ];
};

const createSurveyMetrics = (
  spec: SurveyGridSpec,
  waypoints: readonly MissionCoordinate[],
  laneCount: number,
): SurveyGridMetrics => {
  const pathDistanceM = segmentDistance(waypoints);
  const estimatedPhotoCount =
    spec.cameraTriggerMode === 'distance' && spec.cameraTriggerDistanceM !== null && spec.cameraTriggerDistanceM > 0
      ? Math.ceil(pathDistanceM / spec.cameraTriggerDistanceM)
      : 0;

  return {
    areaM2: polygonAreaM2(spec.polygon),
    laneCount,
    waypointCount: waypoints.length,
    pathDistanceM,
    estimatedPhotoCount,
  };
};

const validateSurveySpec = (spec: SurveyGridSpec): void => {
  assertPolygonVertices(spec.polygon, `survey.${spec.id}.polygon`);
  assertFiniteNumber(spec.altitudeM, `survey.${spec.id}.altitudeM`);
  assertFiniteNumber(spec.angleDeg, `survey.${spec.id}.angleDeg`);

  if (spec.altitudeM < 0) {
    throw new Error(`Survey ${spec.id} altitude must be greater than or equal to 0; altitudeM=${spec.altitudeM}.`);
  }

  if (spec.cameraTriggerMode === 'distance') {
    if (spec.cameraTriggerDistanceM === null || spec.cameraTriggerDistanceM <= 0) {
      throw new Error(
        `Survey ${spec.id} camera trigger distance must be positive when distance trigger is enabled.`,
      );
    }
  }
};

export const generateSurveyGrid = (spec: SurveyGridSpec): GeneratedSurveyGrid => {
  validateSurveySpec(spec);

  const projection = buildProjection(spec.polygon);
  const polygon = spec.polygon.map((vertex) => projectVertex(vertex, projection));
  const primarySegments = createGridLineSegments(polygon, spec.angleDeg, spec.laneSpacingM, spec.overshootM);
  const secondarySegments =
    spec.pattern === 'crosshatch'
      ? createGridLineSegments(polygon, spec.angleDeg + 90, spec.laneSpacingM, spec.overshootM)
      : [];
  const allSegments = [...primarySegments, ...secondarySegments];

  if (allSegments.length === 0) {
    throw new Error(`Survey ${spec.id} generated no flight lines.`);
  }

  const primaryOrderedSegments = orientSegmentsFromCorner(
    primarySegments,
    polygon,
    spec.startCorner,
    spec.altitudeM,
    projection,
  );
  const secondaryTarget =
    primaryOrderedSegments.length === 0
      ? startCornerPoint(polygon, spec.startCorner)
      : projectVertex(primaryOrderedSegments[primaryOrderedSegments.length - 1].end, projection);
  const secondaryOrderedSegments = orientSegments(
    secondarySegments,
    secondaryTarget,
    spec.altitudeM,
    projection,
  );
  const orderedSegments = [...primaryOrderedSegments, ...secondaryOrderedSegments];
  const waypoints = orderedSegments.flatMap((segment) => [segment.start, segment.end]);
  const missionItems = createSurveyMissionItems(spec, waypoints);
  const metrics = createSurveyMetrics(spec, waypoints, allSegments.length);

  return {
    spec,
    waypoints,
    missionItems,
    metrics,
  };
};
