import { describe, expect, it } from 'vitest';
import {
  TRAIL_FADE_OLDEST_FACTOR,
  TRAIL_MIN_RENDER_POINTS,
  TRAIL_VISUAL_WINDOW_POINTS,
  calculateTrailFadeFactor,
  calculateTrailHistoryTrimCount,
  calculateTrajectoryAlpha,
  calculateTrailWindowStartIndex,
  shouldRebuildTrailCurtain,
  shouldRenderTrailCurtain,
} from '../trailVisualSync';

describe('trailVisualSync', () => {
  it('updates the curtain as soon as the shared trail receives a new point', () => {
    expect(shouldRebuildTrailCurtain(10, 11, 'old', 'new')).toBe(true);
    expect(shouldRebuildTrailCurtain(10, 10, 'old', 'new')).toBe(true);
    expect(shouldRebuildTrailCurtain(10, 10, 'same', 'same')).toBe(false);
  });

  it('keeps line and curtain fade calculations on the same trail window', () => {
    expect(calculateTrailWindowStartIndex(TRAIL_VISUAL_WINDOW_POINTS - 1)).toBe(0);
    expect(calculateTrailWindowStartIndex(TRAIL_VISUAL_WINDOW_POINTS)).toBe(0);
    expect(calculateTrailWindowStartIndex(TRAIL_VISUAL_WINDOW_POINTS + 7)).toBe(7);
  });

  it('keeps curtain lifetime and aligned terrain history tied to the visible trail', () => {
    expect(shouldRenderTrailCurtain(TRAIL_MIN_RENDER_POINTS - 1)).toBe(false);
    expect(shouldRenderTrailCurtain(TRAIL_MIN_RENDER_POINTS)).toBe(true);
    expect(calculateTrailHistoryTrimCount(8, 5)).toBe(3);
    expect(calculateTrailHistoryTrimCount(5, 8)).toBe(0);
  });

  it('keeps the active trajectory line fully solid across the visible trail', () => {
    const progress = 0.35;

    expect(calculateTrailFadeFactor(0)).toBe(TRAIL_FADE_OLDEST_FACTOR);
    expect(calculateTrailFadeFactor(1)).toBe(1);
    expect(calculateTrajectoryAlpha(0, true)).toBe(1);
    expect(calculateTrajectoryAlpha(progress, true)).toBe(1);
    expect(calculateTrajectoryAlpha(1, true)).toBe(1);
    expect(calculateTrajectoryAlpha(progress, false)).toBeCloseTo(calculateTrailFadeFactor(progress) * 0.5, 6);
  });
});
