import { haversineDistanceM } from '../../telemetry';
import { selectMissionRoutePoints } from './MissionSelectors';
import { MissionDomainError } from './MissionTypes';
import type {
  DomainMissionMetrics,
  MissionAltitudeProfilePoint,
  MissionMapPoint,
  MissionPlan,
  MissionSegmentDistance,
} from './MissionTypes';

const calculateSegmentDistances = (points: readonly MissionMapPoint[]): readonly MissionSegmentDistance[] =>
  points.reduce<readonly MissionSegmentDistance[]>((segments, point, index) => {
    if (index === 0) {
      return segments;
    }

    const previousPoint = points[index - 1];
    if (previousPoint === undefined) {
      throw new MissionDomainError('Cannot calculate mission segment distance without a previous spatial point.');
    }

    return [
      ...segments,
      {
        fromSeq: previousPoint.seq,
        toSeq: point.seq,
        distanceM: haversineDistanceM(previousPoint.lat, previousPoint.lng, point.lat, point.lng),
      },
    ];
  }, []);

const sumDistanceM = (segments: readonly MissionSegmentDistance[]): number =>
  segments.reduce((totalDistanceM, segment) => totalDistanceM + segment.distanceM, 0);

const calculateAltitudeProfile = (
  points: readonly MissionMapPoint[],
  segments: readonly MissionSegmentDistance[],
): readonly MissionAltitudeProfilePoint[] =>
  points.map((point, index) => ({
    seq: point.seq,
    label: `WP${index + 1}`,
    distanceM: sumDistanceM(segments.slice(0, index)),
    altitudeM: point.alt,
  }));

const calculateDurationSeconds = (totalDistanceM: number, cruiseSpeedMps: number): number => {
  if (totalDistanceM === 0) {
    return 0;
  }

  if (!Number.isFinite(cruiseSpeedMps) || cruiseSpeedMps <= 0) {
    throw new MissionDomainError(`Cannot calculate mission duration with invalid cruiseSpeedMps: ${cruiseSpeedMps}.`);
  }

  return totalDistanceM / cruiseSpeedMps;
};

const calculateMaxAltitudeM = (points: readonly MissionMapPoint[]): number | null => {
  if (points.length === 0) {
    return null;
  }

  return Math.max(...points.map((point) => point.alt));
};

const calculateMinAltitudeM = (points: readonly MissionMapPoint[]): number | null => {
  if (points.length === 0) {
    return null;
  }

  return Math.min(...points.map((point) => point.alt));
};

export const calculateDomainMissionMetrics = (
  plan: MissionPlan,
  cruiseSpeedMps: number,
): DomainMissionMetrics => {
  const spatialPoints = selectMissionRoutePoints(plan);
  const segmentDistances = calculateSegmentDistances(spatialPoints);
  const totalDistanceM = sumDistanceM(segmentDistances);

  return {
    spatialItemCount: spatialPoints.length,
    commandCount: plan.items.length,
    totalDistanceM,
    segmentDistances,
    durationSeconds: calculateDurationSeconds(totalDistanceM, cruiseSpeedMps),
    altitudeProfile: calculateAltitudeProfile(spatialPoints, segmentDistances),
    maxAltitudeM: calculateMaxAltitudeM(spatialPoints),
    minAltitudeM: calculateMinAltitudeM(spatialPoints),
  };
};
