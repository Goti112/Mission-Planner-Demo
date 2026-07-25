export const FRAME_FIELDS = 12
export const MAX_FRAMES_PER_DRONE = 108_000

/** Recording rate — must match SimulationTelemetrySource rateHz */
export const RECORD_HZ = 20
export const MS_PER_FRAME = 1000 / RECORD_HZ

/**
 * Field indices — use these everywhere instead of magic numbers.
 * Keep in sync with the record() call in DroneStateManager.
 */
export const F = {
  LAT: 0, LNG: 1, ALT: 2,
  ROLL: 3, PITCH: 4, YAW: 5,
  AIRSPEED: 6, GROUNDSPEED: 7, BATTERY: 8,
  VX: 9, VY: 10, VZ: 11,
} as const

export interface DroneRecording {
  droneId: string
  /** Flat packed frames: frame N starts at index N * FRAME_FIELDS */
  frames: Float32Array
  /** Wall-clock timestamp (ms) for each frame — parallel array */
  timestamps: Uint32Array
  /**
   * Next-write slot in the ring buffer.
   * Ranges [0, MAX_FRAMES_PER_DRONE).
   */
  cursor: number
  /**
   * Total frames written since recording started (unbounded — never wraps).
   * frameCount = min(total, MAX_FRAMES_PER_DRONE)
   */
  total: number
  /** Wall-clock ms when the first frame was written */
  startedAt: number
  /**
   * Mission name associated with this recording (set when auto-record
   * is triggered by a mission start event).
   */
  missionName: string
}

export type ReplayState = 'IDLE' | 'PLAYING' | 'PAUSED'
