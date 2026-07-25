/**
 * flightRecorderStore.ts
 *
 * ═══════════════════════════════════════════════════════════════════════
 * TELEMETRY RECORDER & REPLAY STATE
 * ═══════════════════════════════════════════════════════════════════════
 *
 * RECORD phase
 * ────────────
 *   DroneStateManager.onTelemetry() → record()  (called at 20 Hz)
 *
 *   Storage: flat Float32Array ring-buffer for data + parallel Uint32Array
 *   for timestamps. Each frame = FRAME_FIELDS (12) floats.
 *
 *   Ring-buffer semantics: when the buffer is full the oldest frame is
 *   silently overwritten. `cursor` always points at the NEXT write slot.
 *   `total` is unbounded (never wraps) so consumers can detect overflow.
 *
 * REPLAY phase
 * ────────────
 *   useReplayEngine (hook) drives a rAF loop that:
 *     1. Advances a sub-frame accumulator using wall-clock Δt × speed.
 *     2. Lerps between adjacent frames for smooth motion.
 *     3. Writes interpolated values into droneStore — the same pipeline
 *        used by live telemetry, so the PFD, 3D model, map and trail
 *        all respond identically without modification.
 *
 *   Yaw interpolation uses short-path angular lerp to avoid 359°→1°
 *   spin artefacts.
 *
 * RECORDING TRIGGER
 * ─────────────────
 *   Recording starts automatically when a mission begins
 *   (DroneStateManager calls startAutoRecord) and stops when the mission
 *   ends. The operator can also toggle it manually via the ReplayPanel.
 *
 * BUFFER LIMITS
 * ─────────────
 *   MAX_FRAMES_PER_DRONE = 108 000  →  ~90 min @ 20 Hz  (~5 MB per drone)
 *
 * FRAME LAYOUT (F constant)
 * ─────────────────────────
 *   0  lat          (degrees)
 *   1  lng          (degrees)
 *   2  alt          (m AGL)
 *   3  roll         (degrees)
 *   4  pitch        (degrees)
 *   5  yaw          (degrees)     ← short-path lerp on replay
 *   6  airspeed     (m/s)
 *   7  groundspeed  (m/s)
 *   8  battery      (%)
 *   9  vx           (m/s north)
 *   10 vy           (m/s east)
 *   11 vz           (m/s vertical)
 */

import { create } from 'zustand'
import {
  F,
  FRAME_FIELDS,
  MAX_FRAMES_PER_DRONE,
  RECORD_HZ,
  type DroneRecording,
  type ReplayState,
} from './flightRecorderShared'

export {
  F,
  FRAME_FIELDS,
  MAX_FRAMES_PER_DRONE,
  MS_PER_FRAME,
  RECORD_HZ,
  type DroneRecording,
  type ReplayState,
} from './flightRecorderShared'

export interface FlightRecorderState {
  // ── Recording ────────────────────────────────────────────────────────
  recordings:  Record<string, DroneRecording>
  isRecording: boolean
  /** Internal: mission name to attach when creating the first per-drone buffer */
  _pendingMissionName: string

  startRecording:  (missionName?: string) => void
  stopRecording:   () => void
  clearRecording:  (droneId: string) => void
  clearAll:        () => void
  /**
   * Inject a synthetic circular flight path for UI testing.
   * Creates ~300 frames (15 s at 20 Hz) for the given droneId.
   */
  injectMockRecording: (droneId: string, centerLat?: number, centerLng?: number) => void

  /**
   * Write one telemetry snapshot for a drone.
   * No-op when isRecording === false.
   * Called at 20 Hz — must be allocation-free.
   */
  record: (
    droneId:     string,
    lat:         number,
    lng:         number,
    alt:         number,
    roll:        number,
    pitch:       number,
    yaw:         number,
    airspeed:    number,
    groundspeed: number,
    battery:     number,
    vx:          number,
    vy:          number,
    vz:          number,
  ) => void

  // ── Replay ───────────────────────────────────────────────────────────
  replayState:   ReplayState
  /**
   * droneId under replay, or null → replay all recorded drones in sync.
   */
  replayDroneId: string | null
  /**
   * Current playback position as a floating-point frame index.
   * Non-integer values are used for sub-frame interpolation.
   */
  replayIndex:   number
  /** Playback speed multiplier (e.g. 0.25, 0.5, 1, 2, 4) */
  replaySpeed:   number

  startReplay:     (droneId?: string) => void
  stopReplay:      () => void
  pauseReplay:     () => void
  resumeReplay:    () => void
  /** Set replay position (frame index — may be fractional for seek) */
  setReplayIndex:  (index: number) => void
  setReplaySpeed:  (speed: number) => void
}

// ── Internal helper ────────────────────────────────────────────────────────

function makeRecording(droneId: string, missionName: string): DroneRecording {
  return {
    droneId,
    frames:      new Float32Array(MAX_FRAMES_PER_DRONE * FRAME_FIELDS),
    timestamps:  new Uint32Array(MAX_FRAMES_PER_DRONE),
    cursor:      0,
    total:       0,
    startedAt:   Date.now(),
    missionName,
  }
}

function ensureRecording(
  recordings: Record<string, DroneRecording>,
  droneId:    string,
  missionName: string,
): DroneRecording {
  if (!recordings[droneId]) {
    recordings[droneId] = makeRecording(droneId, missionName)
  }
  return recordings[droneId]
}

// ── Store ──────────────────────────────────────────────────────────────────

export const useFlightRecorderStore = create<FlightRecorderState>((set, get) => ({
  // ── Recording ──────────────────────────────────────────────────────────
  recordings:  {},
  isRecording: false,
  _pendingMissionName: 'Grabación',

  startRecording(missionName = 'Grabación') {
    // Do NOT clear recordings — allow continuous recording across sessions.
    // After a replay ends, auto-record resumes writing into the same buffers
    // instead of wiping everything. Call clearAll() for a fresh start.
    console.debug('[Recorder] startRecording  mission=%s  existingDrones=%d',
      missionName, Object.keys(get().recordings).length)
    set({ isRecording: true, _pendingMissionName: missionName })
  },

  stopRecording() {
    // Force-publish the latest recordings reference so React components
    // (MissionReplayViewer, ReplayPanel, timeline) see ALL frames,
    // including the ≤19 that were mutated since the last periodic set().
    const { recordings } = get()
    const totalFrames: Record<string, number> = {}
    for (const [id, rec] of Object.entries(recordings)) totalFrames[id] = rec.total
    console.debug('[Recorder] stopRecording  totals=%o', totalFrames)
    set({ isRecording: false, recordings: { ...recordings } })
  },

  clearRecording(droneId) {
    set((s) => {
      const next = { ...s.recordings }
      delete next[droneId]
      return { recordings: next }
    })
  },

  clearAll() {
    set({ recordings: {}, isRecording: false, _pendingMissionName: 'Grabación' })
  },

  injectMockRecording(droneId, centerLat = 40.4168, centerLng = -3.7038) {
    // 300 frames = 15 s at 20 Hz — a tight circular orbit around the center point
    const totalFrames = 300
    const rec = makeRecording(droneId, 'Vuelo de prueba')

    const now = Date.now()
    for (let i = 0; i < totalFrames; i++) {
      const angle = (i / totalFrames) * Math.PI * 2
      const radius = 0.001  // ~111 m
      const lat = centerLat + Math.sin(angle) * radius
      const lng = centerLng + Math.cos(angle) * radius
      const alt = 30 + Math.sin(angle * 2) * 5   // 25–35 m
      const yaw = (angle * 180 / Math.PI + 90) % 360
      const gs  = 7.0   // 7 m/s groundspeed (ensures auto-record trigger)

      const base = rec.cursor * FRAME_FIELDS
      rec.frames[base + F.LAT]         = lat
      rec.frames[base + F.LNG]         = lng
      rec.frames[base + F.ALT]         = alt
      rec.frames[base + F.ROLL]        = 0
      rec.frames[base + F.PITCH]       = -5
      rec.frames[base + F.YAW]         = yaw
      rec.frames[base + F.AIRSPEED]    = 8
      rec.frames[base + F.GROUNDSPEED] = gs
      rec.frames[base + F.BATTERY]     = 100 - (i / totalFrames) * 5
      rec.frames[base + F.VX]          = Math.cos(angle) * gs
      rec.frames[base + F.VY]          = Math.sin(angle) * gs
      rec.frames[base + F.VZ]          = 0
      rec.timestamps[rec.cursor]       = (now + i * 50) & 0xFFFFFFFF
      rec.cursor = (rec.cursor + 1) % MAX_FRAMES_PER_DRONE
      rec.total++
    }

    console.debug('[MockRecord] injected  drone=%s  frames=%d  lat=%.4f  lng=%.4f',
      droneId, totalFrames, centerLat, centerLng)
    set({ recordings: { [droneId]: rec } })
  },

  record(droneId, lat, lng, alt, roll, pitch, yaw, airspeed, groundspeed, battery, vx, vy, vz) {
    // Always read fresh state — never capture from a closure.
    // Bug fix: using get() here instead of destructuring at call-site prevents
    // stale-closure issues where `recordings` points to an old object after
    // Zustand has produced a new one via a previous set().
    const s = get()
    if (!s.isRecording) return

    const recordings = s.recordings
    const rec = ensureRecording(recordings, droneId, s._pendingMissionName)
    const base = rec.cursor * FRAME_FIELDS

    rec.frames[base + F.LAT]         = lat
    rec.frames[base + F.LNG]         = lng
    rec.frames[base + F.ALT]         = alt
    rec.frames[base + F.ROLL]        = roll
    rec.frames[base + F.PITCH]       = pitch
    rec.frames[base + F.YAW]         = yaw
    rec.frames[base + F.AIRSPEED]    = airspeed
    rec.frames[base + F.GROUNDSPEED] = groundspeed
    rec.frames[base + F.BATTERY]     = battery
    rec.frames[base + F.VX]          = vx
    rec.frames[base + F.VY]          = vy
    rec.frames[base + F.VZ]          = vz
    rec.timestamps[rec.cursor]       = Date.now() & 0xFFFFFFFF   // fits Uint32

    rec.cursor = (rec.cursor + 1) % MAX_FRAMES_PER_DRONE
    rec.total++

    // Publish on FIRST frame so React sees the recording immediately,
    // then every RECORD_HZ frames (≈1/sec) to avoid flooding Zustand.
    if (rec.total === 1 || rec.total % RECORD_HZ === 0) {
      set({ recordings: { ...recordings, [droneId]: rec } })
      if (rec.total === 1) {
        console.debug('[Recorder] first frame  drone=%s', droneId)
      }
    }
  },

  // ── Replay ────────────────────────────────────────────────────────────
  replayState:   'IDLE',
  replayDroneId: null,
  replayIndex:   0,
  replaySpeed:   1,

  startReplay(droneId) {
    if (get().isRecording) get().stopRecording()
    // Re-publish recordings to guarantee React components see
    // ALL data (including final frames written since last periodic set).
    const recs = get().recordings
    const totalFrames: Record<string, number> = {}
    for (const [id, rec] of Object.entries(recs)) totalFrames[id] = rec.total
    console.debug('[Replay] startReplay  drone=%s  totals=%o', droneId ?? 'ALL', totalFrames)
    set({
      replayState:   'PLAYING',
      replayDroneId: droneId ?? null,
      replayIndex:   0,
      recordings:    { ...recs },
    })
  },

  stopReplay() {
    console.debug('[Replay] stopReplay')
    set({ replayState: 'IDLE', replayDroneId: null, replayIndex: 0 })
  },

  pauseReplay() {
    if (get().replayState === 'PLAYING') {
      console.debug('[Replay] pauseReplay  index=%.1f', get().replayIndex)
      set({ replayState: 'PAUSED' })
    }
  },

  resumeReplay() {
    if (get().replayState === 'PAUSED') {
      console.debug('[Replay] resumeReplay  index=%.1f', get().replayIndex)
      set({ replayState: 'PLAYING' })
    }
  },

  setReplayIndex(index) {
    set({ replayIndex: index })
  },

  setReplaySpeed(speed) {
    set({ replaySpeed: speed })
  },
}))
