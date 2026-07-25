import type {
  AdvancedMissionPlan,
  AdvancedMissionUploadItem,
  CircleFence,
  FenceDefinition,
  PolygonFence,
  RallyPoint,
} from './advancedMissionTypes';
import { emptyAdvancedMissionPlan } from './advancedMissionTypes';
import {
  addFence,
  addRallyPoint,
  addSurvey,
} from './advancedMissionMutations';

interface QgcRow {
  readonly seq: number;
  readonly current: number;
  readonly frame: number;
  readonly command: number;
  readonly p1: number;
  readonly p2: number;
  readonly p3: number;
  readonly p4: number;
  readonly lat: number;
  readonly lng: number;
  readonly alt: number;
  readonly autocontinue: number;
}

const MAV_FRAME_GLOBAL = 0;
const MAV_CMD_NAV_FENCE_RETURN_POINT = 5000;
const MAV_CMD_NAV_FENCE_POLYGON_VERTEX_INCLUSION = 5001;
const MAV_CMD_NAV_FENCE_POLYGON_VERTEX_EXCLUSION = 5002;
const MAV_CMD_NAV_FENCE_CIRCLE_INCLUSION = 5003;
const MAV_CMD_NAV_FENCE_CIRCLE_EXCLUSION = 5004;
const MAV_CMD_NAV_RALLY_POINT = 5100;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const readRecord = (value: unknown, label: string): Record<string, unknown> => {
  if (!isRecord(value)) {
    throw new Error(`${label} must be an object.`);
  }

  return value;
};

const readString = (record: Record<string, unknown>, key: string, label: string): string => {
  const value = record[key];

  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`${label}.${key} must be a non-empty string.`);
  }

  return value;
};

const readNumber = (record: Record<string, unknown>, key: string, label: string): number => {
  const value = record[key];

  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`${label}.${key} must be a finite number.`);
  }

  return value;
};

const readNullableNumber = (record: Record<string, unknown>, key: string, label: string): number | null => {
  const value = record[key];

  if (value === null) {
    return null;
  }

  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`${label}.${key} must be a finite number or null.`);
  }

  return value;
};

const readArray = (record: Record<string, unknown>, key: string, label: string): readonly unknown[] => {
  const value = record[key];

  if (!Array.isArray(value)) {
    throw new Error(`${label}.${key} must be an array.`);
  }

  return value;
};

const readFenceVertex = (value: unknown, label: string): { readonly lat: number; readonly lng: number } => {
  const record = readRecord(value, label);

  return {
    lat: readNumber(record, 'lat', label),
    lng: readNumber(record, 'lng', label),
  };
};

const readFenceBoundary = (record: Record<string, unknown>, label: string): FenceDefinition['boundary'] => {
  const boundary = readString(record, 'boundary', label);

  if (boundary !== 'inclusion' && boundary !== 'exclusion') {
    throw new Error(`${label}.boundary must be inclusion or exclusion; boundary=${boundary}.`);
  }

  return boundary;
};

const readFence = (value: unknown, label: string): FenceDefinition => {
  const record = readRecord(value, label);
  const shape = readString(record, 'shape', label);
  const base = {
    id: readString(record, 'id', label),
    name: readString(record, 'name', label),
    boundary: readFenceBoundary(record, label),
  };

  if (shape === 'polygon') {
    return {
      ...base,
      shape,
      vertices: readArray(record, 'vertices', label).map((vertex, index) =>
        readFenceVertex(vertex, `${label}.vertices[${index}]`),
      ),
      minAltitudeM: readNullableNumber(record, 'minAltitudeM', label),
      maxAltitudeM: readNullableNumber(record, 'maxAltitudeM', label),
    };
  }

  if (shape === 'circle') {
    return {
      ...base,
      shape,
      center: readFenceVertex(record.center, `${label}.center`),
      radiusM: readNumber(record, 'radiusM', label),
      minAltitudeM: readNullableNumber(record, 'minAltitudeM', label),
      maxAltitudeM: readNullableNumber(record, 'maxAltitudeM', label),
    };
  }

  throw new Error(`${label}.shape must be polygon or circle; shape=${shape}.`);
};

const readRallyPoint = (value: unknown, label: string): RallyPoint => {
  const record = readRecord(value, label);
  const coordinate = readRecord(record.coordinate, `${label}.coordinate`);

  return {
    id: readString(record, 'id', label),
    name: readString(record, 'name', label),
    coordinate: {
      lat: readNumber(coordinate, 'lat', `${label}.coordinate`),
      lng: readNumber(coordinate, 'lng', `${label}.coordinate`),
      alt: readNumber(coordinate, 'alt', `${label}.coordinate`),
    },
    loiterAltitudeM: readNumber(record, 'loiterAltitudeM', label),
    breakAltitudeM: readNullableNumber(record, 'breakAltitudeM', label),
    landHeadingDeg: readNullableNumber(record, 'landHeadingDeg', label),
  };
};

const readSurveyPattern = (record: Record<string, unknown>, label: string): 'grid' | 'crosshatch' => {
  const pattern = readString(record, 'pattern', label);

  if (pattern !== 'grid' && pattern !== 'crosshatch') {
    throw new Error(`${label}.pattern must be grid or crosshatch; pattern=${pattern}.`);
  }

  return pattern;
};

const readSurveyStartCorner = (
  record: Record<string, unknown>,
  label: string,
): 'southWest' | 'northWest' | 'southEast' | 'northEast' => {
  const startCorner = readString(record, 'startCorner', label);

  if (
    startCorner !== 'southWest' &&
    startCorner !== 'northWest' &&
    startCorner !== 'southEast' &&
    startCorner !== 'northEast'
  ) {
    throw new Error(`${label}.startCorner is not a supported survey start corner; startCorner=${startCorner}.`);
  }

  return startCorner;
};

const readSurveyCameraTriggerMode = (record: Record<string, unknown>, label: string): 'none' | 'distance' => {
  const cameraTriggerMode = readString(record, 'cameraTriggerMode', label);

  if (cameraTriggerMode !== 'none' && cameraTriggerMode !== 'distance') {
    throw new Error(
      `${label}.cameraTriggerMode must be none or distance; cameraTriggerMode=${cameraTriggerMode}.`,
    );
  }

  return cameraTriggerMode;
};

const readSurvey = (value: unknown, label: string): AdvancedMissionPlan['surveys'][number] => {
  const record = readRecord(value, label);

  return {
    id: readString(record, 'id', label),
    name: readString(record, 'name', label),
    polygon: readArray(record, 'polygon', label).map((vertex, index) =>
      readFenceVertex(vertex, `${label}.polygon[${index}]`),
    ),
    altitudeM: readNumber(record, 'altitudeM', label),
    angleDeg: readNumber(record, 'angleDeg', label),
    laneSpacingM: readNumber(record, 'laneSpacingM', label),
    overshootM: readNumber(record, 'overshootM', label),
    pattern: readSurveyPattern(record, label),
    startCorner: readSurveyStartCorner(record, label),
    cameraTriggerMode: readSurveyCameraTriggerMode(record, label),
    cameraTriggerDistanceM: readNullableNumber(record, 'cameraTriggerDistanceM', label),
  };
};

const qgcNumber = (value: number): string => {
  if (!Number.isFinite(value)) {
    throw new Error(`Cannot serialize non-finite QGC value; value=${value}.`);
  }

  return Number.isInteger(value) ? value.toString() : value.toFixed(7).replace(/0+$/, '').replace(/\.$/, '');
};

const qgcLine = (row: QgcRow): string =>
  [
    row.seq,
    row.current,
    row.frame,
    row.command,
    row.p1,
    row.p2,
    row.p3,
    row.p4,
    row.lat,
    row.lng,
    row.alt,
    row.autocontinue,
  ]
    .map(qgcNumber)
    .join('\t');

const fenceCommand = (fence: FenceDefinition): number => {
  if (fence.shape === 'circle') {
    return fence.boundary === 'inclusion'
      ? MAV_CMD_NAV_FENCE_CIRCLE_INCLUSION
      : MAV_CMD_NAV_FENCE_CIRCLE_EXCLUSION;
  }

  return fence.boundary === 'inclusion'
    ? MAV_CMD_NAV_FENCE_POLYGON_VERTEX_INCLUSION
    : MAV_CMD_NAV_FENCE_POLYGON_VERTEX_EXCLUSION;
};

const fenceToUploadItems = (fence: FenceDefinition): readonly AdvancedMissionUploadItem[] => {
  if (fence.shape === 'circle') {
    return [
      {
        frame: MAV_FRAME_GLOBAL,
        command: fenceCommand(fence),
        params: [fence.radiusM, 0, 0, 0, fence.center.lat, fence.center.lng, fence.maxAltitudeM ?? 0],
        sourceId: fence.id,
        sourceType: 'fence',
      },
    ];
  }

  return fence.vertices.map((vertex): AdvancedMissionUploadItem => ({
    frame: MAV_FRAME_GLOBAL,
    command: fenceCommand(fence),
    params: [fence.vertices.length, 0, 0, 0, vertex.lat, vertex.lng, fence.maxAltitudeM ?? 0],
    sourceId: fence.id,
    sourceType: 'fence',
  }));
};

const rallyToUploadItem = (rallyPoint: RallyPoint): AdvancedMissionUploadItem => ({
  frame: MAV_FRAME_GLOBAL,
  command: MAV_CMD_NAV_RALLY_POINT,
  params: [
    rallyPoint.loiterAltitudeM,
    rallyPoint.breakAltitudeM ?? 0,
    rallyPoint.landHeadingDeg ?? 0,
    0,
    rallyPoint.coordinate.lat,
    rallyPoint.coordinate.lng,
    rallyPoint.coordinate.alt,
  ],
  sourceId: rallyPoint.id,
  sourceType: 'rally',
});

export const buildAdvancedMissionUploadItems = (
  plan: AdvancedMissionPlan,
): readonly AdvancedMissionUploadItem[] => [
  ...plan.fences.flatMap(fenceToUploadItems),
  ...plan.rallyPoints.map(rallyToUploadItem),
];

export const exportAdvancedPlanToJson = (plan: AdvancedMissionPlan): string =>
  JSON.stringify(
    {
      version: 1,
      advanced: plan,
    },
    null,
    2,
  );

export const importAdvancedPlanFromJson = (raw: string): AdvancedMissionPlan => {
  let parsed: unknown;

  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new Error(`Cannot parse advanced flight plan JSON: ${error instanceof Error ? error.message : String(error)}.`);
  }

  const record = readRecord(parsed, 'Advanced flight plan JSON');
  const advanced = record.advanced;

  const advancedRecord = readRecord(advanced, 'Advanced flight plan JSON.advanced');
  const fences = readArray(advancedRecord, 'fences', 'Advanced flight plan JSON.advanced');
  const rallyPoints = readArray(advancedRecord, 'rallyPoints', 'Advanced flight plan JSON.advanced');
  const surveys = readArray(advancedRecord, 'surveys', 'Advanced flight plan JSON.advanced');
  const planWithFences = fences.reduce<AdvancedMissionPlan>(
    (plan, fence, index) => addFence(plan, readFence(fence, `Advanced flight plan JSON.advanced.fences[${index}]`)),
    emptyAdvancedMissionPlan(),
  );
  const planWithRallyPoints = rallyPoints.reduce<AdvancedMissionPlan>(
    (plan, rallyPoint, index) =>
      addRallyPoint(plan, readRallyPoint(rallyPoint, `Advanced flight plan JSON.advanced.rallyPoints[${index}]`)),
    planWithFences,
  );

  return surveys.reduce<AdvancedMissionPlan>(
    (plan, survey, index) => addSurvey(plan, readSurvey(survey, `Advanced flight plan JSON.advanced.surveys[${index}]`)),
    planWithRallyPoints,
  );
};

export const exportAdvancedPlanToQgcWpl = (plan: AdvancedMissionPlan): string => {
  const rows = buildAdvancedMissionUploadItems(plan).map((item, index): QgcRow => ({
    seq: index,
    current: 0,
    frame: item.frame,
    command: item.command,
    p1: item.params[0],
    p2: item.params[1],
    p3: item.params[2],
    p4: item.params[3],
    lat: item.params[4],
    lng: item.params[5],
    alt: item.params[6],
    autocontinue: 1,
  }));

  return ['QGC WPL 110', ...rows.map(qgcLine)].join('\n');
};

const parseQgcRows = (raw: string): readonly QgcRow[] => {
  const lines = raw
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  if (lines[0] !== 'QGC WPL 110') {
    throw new Error('QGC WPL import requires header "QGC WPL 110".');
  }

  return lines.slice(1).map((line, index): QgcRow => {
    const parts = line.split(/\s+/u).map((value) => Number(value));

    if (parts.length !== 12 || parts.some((value) => !Number.isFinite(value))) {
      throw new Error(`Invalid QGC WPL row at line ${index + 2}: ${line}`);
    }

    return {
      seq: parts[0],
      current: parts[1],
      frame: parts[2],
      command: parts[3],
      p1: parts[4],
      p2: parts[5],
      p3: parts[6],
      p4: parts[7],
      lat: parts[8],
      lng: parts[9],
      alt: parts[10],
      autocontinue: parts[11],
    };
  });
};

const polygonBoundaryFromCommand = (command: number): PolygonFence['boundary'] => {
  if (command === MAV_CMD_NAV_FENCE_POLYGON_VERTEX_INCLUSION) {
    return 'inclusion';
  }

  if (command === MAV_CMD_NAV_FENCE_POLYGON_VERTEX_EXCLUSION) {
    return 'exclusion';
  }

  throw new Error(`QGC command ${command} is not a polygon fence command.`);
};

const circleBoundaryFromCommand = (command: number): CircleFence['boundary'] => {
  if (command === MAV_CMD_NAV_FENCE_CIRCLE_INCLUSION) {
    return 'inclusion';
  }

  if (command === MAV_CMD_NAV_FENCE_CIRCLE_EXCLUSION) {
    return 'exclusion';
  }

  throw new Error(`QGC command ${command} is not a circle fence command.`);
};

export const importAdvancedPlanFromQgcWpl = (raw: string): AdvancedMissionPlan => {
  const rows = parseQgcRows(raw);
  let plan = emptyAdvancedMissionPlan();
  let index = 0;

  while (index < rows.length) {
    const row = rows[index];

    if (
      row.command === MAV_CMD_NAV_FENCE_POLYGON_VERTEX_INCLUSION ||
      row.command === MAV_CMD_NAV_FENCE_POLYGON_VERTEX_EXCLUSION
    ) {
      const count = Math.trunc(row.p1);
      const polygonRows = rows.slice(index, index + count);

      if (polygonRows.length !== count || polygonRows.some((item) => item.command !== row.command)) {
        throw new Error(`Invalid polygon fence group starting at row ${index}; expected ${count} rows.`);
      }

      const fence: PolygonFence = {
        id: `imported-fence-${plan.fences.length + 1}`,
        name: `Imported Fence ${plan.fences.length + 1}`,
        shape: 'polygon',
        boundary: polygonBoundaryFromCommand(row.command),
        vertices: polygonRows.map((item) => ({ lat: item.lat, lng: item.lng })),
        minAltitudeM: null,
        maxAltitudeM: row.alt === 0 ? null : row.alt,
      };

      plan = addFence(plan, fence);
      index += count;
      continue;
    }

    if (
      row.command === MAV_CMD_NAV_FENCE_CIRCLE_INCLUSION ||
      row.command === MAV_CMD_NAV_FENCE_CIRCLE_EXCLUSION
    ) {
      const fence: CircleFence = {
        id: `imported-fence-${plan.fences.length + 1}`,
        name: `Imported Circle ${plan.fences.length + 1}`,
        shape: 'circle',
        boundary: circleBoundaryFromCommand(row.command),
        center: { lat: row.lat, lng: row.lng },
        radiusM: row.p1,
        minAltitudeM: null,
        maxAltitudeM: row.alt === 0 ? null : row.alt,
      };

      plan = addFence(plan, fence);
      index += 1;
      continue;
    }

    if (row.command === MAV_CMD_NAV_RALLY_POINT) {
      const rallyPoint: RallyPoint = {
        id: `imported-rally-${plan.rallyPoints.length + 1}`,
        name: `Imported Rally ${plan.rallyPoints.length + 1}`,
        coordinate: { lat: row.lat, lng: row.lng, alt: row.alt },
        loiterAltitudeM: row.p1,
        breakAltitudeM: row.p2 === 0 ? null : row.p2,
        landHeadingDeg: row.p3 === 0 ? null : row.p3,
      };

      plan = addRallyPoint(plan, rallyPoint);
      index += 1;
      continue;
    }

    if (row.command === MAV_CMD_NAV_FENCE_RETURN_POINT) {
      index += 1;
      continue;
    }

    throw new Error(`Unsupported advanced QGC command at row ${index}: command=${row.command}.`);
  }

  return plan;
};
