import { describe, expect, it } from 'vitest'
import { F, FRAME_FIELDS, MAX_FRAMES_PER_DRONE, type DroneRecording } from '../modules/replay/store'
import { exportRecordings, importRecordings } from './telemetryFileIO'

const writeFrame = (
  recording: DroneRecording,
  slot: number,
  lat: number,
  timestamp: number,
): void => {
  const offset = slot * FRAME_FIELDS
  recording.frames[offset + F.LAT] = lat
  recording.frames[offset + F.LNG] = -3.7
  recording.frames[offset + F.ALT] = 60
  recording.frames[offset + F.ROLL] = 1
  recording.frames[offset + F.PITCH] = 2
  recording.frames[offset + F.YAW] = 3
  recording.frames[offset + F.AIRSPEED] = 4
  recording.frames[offset + F.GROUNDSPEED] = 5
  recording.frames[offset + F.BATTERY] = 95
  recording.frames[offset + F.VX] = 6
  recording.frames[offset + F.VY] = 7
  recording.frames[offset + F.VZ] = 8
  recording.timestamps[slot] = timestamp
}

const buildWrappedRecording = (): DroneRecording => {
  const recording: DroneRecording = {
    droneId: 'drone-a',
    missionName: 'Ring Buffer Mission',
    startedAt: 1_700_000_000_000,
    frames: new Float32Array(MAX_FRAMES_PER_DRONE * FRAME_FIELDS),
    timestamps: new Uint32Array(MAX_FRAMES_PER_DRONE),
    cursor: 2,
    total: MAX_FRAMES_PER_DRONE + 2,
  }

  writeFrame(recording, 0, 40.2, 200)
  writeFrame(recording, 1, 40.3, 300)
  writeFrame(recording, 2, 40.0, 0)
  writeFrame(recording, 3, 40.1, 100)

  return recording
}

describe('telemetryFileIO', () => {
  it('exports wrapped ring-buffer recordings in chronological order', () => {
    const exported = exportRecordings({ 'drone-a': buildWrappedRecording() })
    const imported = importRecordings(exported)

    expect(imported.ok).toBe(true)
    if (!imported.ok) {
      throw new Error(imported.error)
    }

    const recording = imported.recordings['drone-a']
    expect(recording.total).toBe(MAX_FRAMES_PER_DRONE)
    expect(recording.frames[0 + F.LAT]).toBeCloseTo(40.0)
    expect(recording.frames[FRAME_FIELDS + F.LAT]).toBeCloseTo(40.1)
    expect(recording.frames[(MAX_FRAMES_PER_DRONE - 2) * FRAME_FIELDS + F.LAT]).toBeCloseTo(40.2)
    expect(recording.frames[(MAX_FRAMES_PER_DRONE - 1) * FRAME_FIELDS + F.LAT]).toBeCloseTo(40.3)
    expect(recording.timestamps[0]).toBe(0)
    expect(recording.timestamps[1]).toBe(100)
    expect(recording.timestamps[MAX_FRAMES_PER_DRONE - 2]).toBe(200)
    expect(recording.timestamps[MAX_FRAMES_PER_DRONE - 1]).toBe(300)
  })

  it('rejects malformed telemetry JSON without throwing', () => {
    const imported = importRecordings('{not json')

    expect(imported.ok).toBe(false)
    if (!imported.ok) {
      expect(imported.error).toContain('JSON')
    }
  })
})
