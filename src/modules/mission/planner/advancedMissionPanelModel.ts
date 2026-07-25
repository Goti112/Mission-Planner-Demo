import type { MissionCoordinate, MissionPlan } from '../domain';
import type {
  FenceDefinition,
  FenceVertex,
  RallyPoint,
  SurveyGridSpec,
  AdvancedMissionUploadItem,
} from './advancedMissionTypes';

export interface FenceFormState {
  readonly id: string | null;
  readonly name: string;
  readonly shape: FenceDefinition['shape'];
  readonly boundary: FenceDefinition['boundary'];
  readonly polygonText: string;
  readonly centerLat: string;
  readonly centerLng: string;
  readonly radiusM: string;
  readonly maxAltitudeM: string;
}

export interface RallyFormState {
  readonly id: string | null;
  readonly name: string;
  readonly lat: string;
  readonly lng: string;
  readonly alt: string;
  readonly loiterAltitudeM: string;
  readonly breakAltitudeM: string;
  readonly landHeadingDeg: string;
}

export interface SurveyFormState {
  readonly id: string | null;
  readonly name: string;
  readonly polygonText: string;
  readonly altitudeM: string;
  readonly angleDeg: string;
  readonly laneSpacingM: string;
  readonly overshootM: string;
  readonly pattern: SurveyGridSpec['pattern'];
  readonly startCorner: SurveyGridSpec['startCorner'];
  readonly cameraTriggerMode: SurveyGridSpec['cameraTriggerMode'];
  readonly cameraTriggerDistanceM: string;
}

export const createAdvancedId = (scope: string): string =>
  `${scope}-${Date.now().toString(36)}-${Math.floor(Math.random() * 10000).toString(36)}`;

export const createSeedPolygon = (coordinate: MissionCoordinate): readonly FenceVertex[] => {
  const delta = 0.001;

  return [
    { lat: coordinate.lat - delta, lng: coordinate.lng - delta },
    { lat: coordinate.lat - delta, lng: coordinate.lng + delta },
    { lat: coordinate.lat + delta, lng: coordinate.lng + delta },
    { lat: coordinate.lat + delta, lng: coordinate.lng - delta },
  ];
};

export const formatCoordinate = (value: number): string => value.toFixed(7).replace(/0+$/u, '').replace(/\.$/u, '');

export const formatPolygonText = (polygon: readonly FenceVertex[]): string =>
  polygon.map((vertex) => `${formatCoordinate(vertex.lat)}, ${formatCoordinate(vertex.lng)}`).join('\n');

export const readNumber = (rawValue: string, label: string): number => {
  const value = Number(rawValue);

  if (!Number.isFinite(value)) {
    throw new Error(`${label} must be a finite number; value="${rawValue}".`);
  }

  return value;
};

export const readNullableNumber = (rawValue: string, label: string): number | null => {
  if (rawValue.trim().length === 0) {
    return null;
  }

  return readNumber(rawValue, label);
};

export const parsePolygonText = (rawValue: string): readonly FenceVertex[] => {
  const lines = rawValue
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  if (lines.length < 3) {
    throw new Error(`Polygon requires at least 3 vertices; count=${lines.length}.`);
  }

  return lines.map((line, index) => {
    const parts = line.split(/[,\s]+/u).filter((part) => part.length > 0);

    if (parts.length !== 2) {
      throw new Error(`Polygon vertex ${index + 1} must be "lat,lng"; value="${line}".`);
    }

    return {
      lat: readNumber(parts[0], `polygon[${index}].lat`),
      lng: readNumber(parts[1], `polygon[${index}].lng`),
    };
  });
};

const readFenceShape = (rawValue: string): FenceDefinition['shape'] => {
  if (rawValue === 'polygon' || rawValue === 'circle') {
    return rawValue;
  }

  throw new Error(`Fence shape must be polygon or circle; shape=${rawValue}.`);
};

export const polygonCenter = (vertices: readonly FenceVertex[]): FenceVertex => {
  if (vertices.length === 0) {
    throw new Error('Cannot calculate polygon center because vertices are empty.');
  }

  const total = vertices.reduce(
    (sum, vertex) => ({
      lat: sum.lat + vertex.lat,
      lng: sum.lng + vertex.lng,
    }),
    { lat: 0, lng: 0 },
  );

  return {
    lat: total.lat / vertices.length,
    lng: total.lng / vertices.length,
  };
};

export const changeFenceFormShape = (
  form: FenceFormState,
  shape: FenceDefinition['shape'],
): FenceFormState => {
  if (form.shape === shape) {
    return form;
  }

  if (form.shape === 'polygon' && shape === 'circle') {
    const center = polygonCenter(parsePolygonText(form.polygonText));

    return {
      ...form,
      shape,
      centerLat: formatCoordinate(center.lat),
      centerLng: formatCoordinate(center.lng),
    };
  }

  return {
    ...form,
    shape,
  };
};

export const changeFenceFormField = (
  form: FenceFormState,
  field: keyof FenceFormState,
  value: string,
): FenceFormState => {
  if (field === 'shape') {
    return changeFenceFormShape(form, readFenceShape(value));
  }

  return {
    ...form,
    [field]: value,
  };
};

export const missionPolygon = (plan: MissionPlan | null, defaultCoordinate: MissionCoordinate): readonly FenceVertex[] => {
  const points =
    plan?.items
      .map((item) => item.coordinate)
      .filter((coordinate): coordinate is MissionCoordinate => coordinate !== null)
      .map((coordinate) => ({ lat: coordinate.lat, lng: coordinate.lng })) ?? [];

  return points.length >= 3 ? points : createSeedPolygon(defaultCoordinate);
};

export const createRallyForm = (defaultCoordinate: MissionCoordinate): RallyFormState => ({
  id: null,
  name: 'Rally',
  lat: formatCoordinate(defaultCoordinate.lat),
  lng: formatCoordinate(defaultCoordinate.lng),
  alt: '60',
  loiterAltitudeM: '80',
  breakAltitudeM: '',
  landHeadingDeg: '',
});

export const createSurveyForm = (polygon: readonly FenceVertex[]): SurveyFormState => ({
  id: null,
  name: 'Survey grid',
  polygonText: formatPolygonText(polygon),
  altitudeM: '60',
  angleDeg: '0',
  laneSpacingM: '35',
  overshootM: '5',
  pattern: 'grid',
  startCorner: 'southWest',
  cameraTriggerMode: 'distance',
  cameraTriggerDistanceM: '25',
});

export const fenceToForm = (fence: FenceDefinition, defaultCoordinate: MissionCoordinate): FenceFormState => {
  if (fence.shape === 'polygon') {
    return {
      id: fence.id,
      name: fence.name,
      shape: fence.shape,
      boundary: fence.boundary,
      polygonText: formatPolygonText(fence.vertices),
      centerLat: formatCoordinate(defaultCoordinate.lat),
      centerLng: formatCoordinate(defaultCoordinate.lng),
      radiusM: '120',
      maxAltitudeM: fence.maxAltitudeM === null ? '' : fence.maxAltitudeM.toString(),
    };
  }

  return {
    id: fence.id,
    name: fence.name,
    shape: fence.shape,
    boundary: fence.boundary,
    polygonText: formatPolygonText(createSeedPolygon(defaultCoordinate)),
    centerLat: formatCoordinate(fence.center.lat),
    centerLng: formatCoordinate(fence.center.lng),
    radiusM: fence.radiusM.toString(),
    maxAltitudeM: fence.maxAltitudeM === null ? '' : fence.maxAltitudeM.toString(),
  };
};

export const rallyToForm = (rallyPoint: RallyPoint): RallyFormState => ({
  id: rallyPoint.id,
  name: rallyPoint.name,
  lat: formatCoordinate(rallyPoint.coordinate.lat),
  lng: formatCoordinate(rallyPoint.coordinate.lng),
  alt: rallyPoint.coordinate.alt.toString(),
  loiterAltitudeM: rallyPoint.loiterAltitudeM.toString(),
  breakAltitudeM: rallyPoint.breakAltitudeM === null ? '' : rallyPoint.breakAltitudeM.toString(),
  landHeadingDeg: rallyPoint.landHeadingDeg === null ? '' : rallyPoint.landHeadingDeg.toString(),
});

export const surveyToForm = (survey: SurveyGridSpec): SurveyFormState => ({
  id: survey.id,
  name: survey.name,
  polygonText: formatPolygonText(survey.polygon),
  altitudeM: survey.altitudeM.toString(),
  angleDeg: survey.angleDeg.toString(),
  laneSpacingM: survey.laneSpacingM.toString(),
  overshootM: survey.overshootM.toString(),
  pattern: survey.pattern,
  startCorner: survey.startCorner,
  cameraTriggerMode: survey.cameraTriggerMode,
  cameraTriggerDistanceM: survey.cameraTriggerDistanceM === null ? '' : survey.cameraTriggerDistanceM.toString(),
});

export const buildFence = (form: FenceFormState): FenceDefinition => {
  const base = {
    id: form.id ?? createAdvancedId('fence'),
    name: form.name.trim().length === 0 ? 'Fence' : form.name.trim(),
    boundary: form.boundary,
    minAltitudeM: null,
    maxAltitudeM: readNullableNumber(form.maxAltitudeM, 'fence.maxAltitudeM'),
  };

  if (form.shape === 'circle') {
    return {
      ...base,
      shape: form.shape,
      center: {
        lat: readNumber(form.centerLat, 'fence.center.lat'),
        lng: readNumber(form.centerLng, 'fence.center.lng'),
      },
      radiusM: readNumber(form.radiusM, 'fence.radiusM'),
    };
  }

  return {
    ...base,
    shape: form.shape,
    vertices: parsePolygonText(form.polygonText),
  };
};

export const buildRallyPoint = (form: RallyFormState): RallyPoint => ({
  id: form.id ?? createAdvancedId('rally'),
  name: form.name.trim().length === 0 ? 'Rally' : form.name.trim(),
  coordinate: {
    lat: readNumber(form.lat, 'rally.lat'),
    lng: readNumber(form.lng, 'rally.lng'),
    alt: readNumber(form.alt, 'rally.alt'),
  },
  loiterAltitudeM: readNumber(form.loiterAltitudeM, 'rally.loiterAltitudeM'),
  breakAltitudeM: readNullableNumber(form.breakAltitudeM, 'rally.breakAltitudeM'),
  landHeadingDeg: readNullableNumber(form.landHeadingDeg, 'rally.landHeadingDeg'),
});

export const buildSurvey = (form: SurveyFormState): SurveyGridSpec => ({
  id: form.id ?? createAdvancedId('survey'),
  name: form.name.trim().length === 0 ? 'Survey grid' : form.name.trim(),
  polygon: parsePolygonText(form.polygonText),
  altitudeM: readNumber(form.altitudeM, 'survey.altitudeM'),
  angleDeg: readNumber(form.angleDeg, 'survey.angleDeg'),
  laneSpacingM: readNumber(form.laneSpacingM, 'survey.laneSpacingM'),
  overshootM: readNumber(form.overshootM, 'survey.overshootM'),
  pattern: form.pattern,
  startCorner: form.startCorner,
  cameraTriggerMode: form.cameraTriggerMode,
  cameraTriggerDistanceM:
    form.cameraTriggerMode === 'none' ? null : readNumber(form.cameraTriggerDistanceM, 'survey.cameraTriggerDistanceM'),
});

export const formatArea = (areaM2: number): string => {
  if (areaM2 >= 1000000) {
    return `${(areaM2 / 1000000).toFixed(2)} km2`;
  }

  return `${Math.round(areaM2).toString()} m2`;
};

export const formatDistance = (distanceM: number): string => {
  if (distanceM >= 1000) {
    return `${(distanceM / 1000).toFixed(2)} km`;
  }

  return `${Math.round(distanceM).toString()} m`;
};

export const fenceSummary = (fence: FenceDefinition): string => {
  const boundary = fence.boundary === 'inclusion' ? 'INCLUSION' : 'EXCLUSION';
  const shape = fence.shape === 'polygon' ? `${fence.vertices.length.toString()} pts` : formatDistance(fence.radiusM);
  const altitude = fence.maxAltitudeM === null ? 'no max alt' : `${Math.round(fence.maxAltitudeM).toString()} m max`;

  return `${boundary} · ${shape} · ${altitude}`;
};

export const fenceDraftSummary = (source: 'map' | 'waypoints', count: number): string => {
  const sourceLabel = source === 'map' ? 'vertices' : 'waypoints selected';

  if (count < 3) {
    return `${count.toString()} ${sourceLabel} - need 3`;
  }

  return `${count.toString()} ${sourceLabel} - ready to create`;
};

export const rallySummary = (rallyPoint: RallyPoint): string =>
  `ALT ${Math.round(rallyPoint.coordinate.alt).toString()} m · LOITER ${Math.round(rallyPoint.loiterAltitudeM).toString()} m`;

export const uploadCommandName = (item: AdvancedMissionUploadItem): string => {
  switch (item.command) {
    case 5001:
      return 'FENCE_POLYGON_VERTEX_INCLUSION';
    case 5002:
      return 'FENCE_POLYGON_VERTEX_EXCLUSION';
    case 5003:
      return 'FENCE_CIRCLE_INCLUSION';
    case 5004:
      return 'FENCE_CIRCLE_EXCLUSION';
    case 5100:
      return 'RALLY_POINT';
    default:
      throw new Error(`Unsupported advanced upload command: ${item.command.toString()}.`);
  }
};
