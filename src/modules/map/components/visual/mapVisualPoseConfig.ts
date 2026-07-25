export interface MapVisualPoseConfig {
  renderDelayMs: number;
  maxBufferSize: number;
  maxGapMs: number;
  maxExtrapolationMs: number;
  snapDistanceDeg: number;
}

export const DEFAULT_MAP_VISUAL_POSE_CONFIG: MapVisualPoseConfig = {
  renderDelayMs: 120,
  maxBufferSize: 16,
  maxGapMs: 450,
  maxExtrapolationMs: 80,
  snapDistanceDeg: 0.0015,
};
