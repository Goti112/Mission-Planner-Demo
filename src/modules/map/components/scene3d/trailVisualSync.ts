export const TRAIL_VISUAL_WINDOW_POINTS = 500;
export const TRAIL_MIN_RENDER_POINTS = 2;
export const TRAIL_FADE_OLDEST_FACTOR = 0.22;
export const TRAIL_ACTIVE_LINE_ALPHA = 1;
export const TRAIL_PASSIVE_LINE_ALPHA = 0.5;

export function calculateTrailWindowStartIndex(pointCount: number): number {
  return Math.max(0, pointCount - TRAIL_VISUAL_WINDOW_POINTS);
}

export function calculateTrailHistoryTrimCount(historyPointCount: number, trailPointCount: number): number {
  return Math.max(0, historyPointCount - trailPointCount);
}

export function calculateTrailFadeFactor(progress: number): number {
  const clampedProgress = Math.max(0, Math.min(1, progress));
  return TRAIL_FADE_OLDEST_FACTOR + (1 - TRAIL_FADE_OLDEST_FACTOR) * clampedProgress;
}

export function calculateTrajectoryAlpha(progress: number, isActive: boolean): number {
  if (isActive) return TRAIL_ACTIVE_LINE_ALPHA;

  const maxAlpha = isActive ? TRAIL_ACTIVE_LINE_ALPHA : TRAIL_PASSIVE_LINE_ALPHA;
  return calculateTrailFadeFactor(progress) * maxAlpha;
}

export function shouldRebuildTrailCurtain(
  previousPointCount: number,
  currentPointCount: number,
  previousNewestPointKey: string,
  currentNewestPointKey: string,
): boolean {
  return previousPointCount !== currentPointCount || previousNewestPointKey !== currentNewestPointKey;
}

export function shouldRenderTrailCurtain(pointCount: number): boolean {
  return pointCount >= TRAIL_MIN_RENDER_POINTS;
}
