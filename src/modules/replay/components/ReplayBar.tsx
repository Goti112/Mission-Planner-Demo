/**
 * ReplayBar.tsx — Flight Recorder + Replay controls panel
 *
 * Sits above (or below) the status bar.
 * Shows:
 *   [● REC]  [▶ REPLAY]  [divider]  [time] [━━━━━━━timeline━━━━━━━] [total]  [speed ×]
 *
 * Usage:
 *   <ReplayBar droneId={activeDroneId} />
 */

import React, { useMemo } from 'react'
import { useFlightRecorderStore, MAX_FRAMES_PER_DRONE, FRAME_FIELDS, F } from '..'
import { useDroneStore } from '../../drone'
import './ReplayBar.css'

interface ReplayBarProps {
  /** ID of the drone to replay. If omitted, all recorded drones replay together. */
  droneId?: string | null
}

/** Convert frame index to MM:SS string based on 20 Hz recording rate */
function frameToTime(index: number): string {
  const totalSec = Math.floor(index / 20)
  const mm = Math.floor(totalSec / 60).toString().padStart(2, '0')
  const ss = (totalSec % 60).toString().padStart(2, '0')
  return `${mm}:${ss}`
}

const SPEED_OPTIONS = [0.25, 0.5, 1, 2, 4]

const ReplayBar: React.FC<ReplayBarProps> = ({ droneId }) => {
  const isRecording  = useFlightRecorderStore(s => s.isRecording)
  const recordings   = useFlightRecorderStore(s => s.recordings)
  const replayState  = useFlightRecorderStore(s => s.replayState)
  const replayIndex  = useFlightRecorderStore(s => s.replayIndex)
  const replaySpeed  = useFlightRecorderStore(s => s.replaySpeed)

  const startRecording = useFlightRecorderStore(s => s.startRecording)
  const stopRecording  = useFlightRecorderStore(s => s.stopRecording)
  const startReplay    = useFlightRecorderStore(s => s.startReplay)
  const stopReplay     = useFlightRecorderStore(s => s.stopReplay)
  const pauseReplay    = useFlightRecorderStore(s => s.pauseReplay)
  const resumeReplay   = useFlightRecorderStore(s => s.resumeReplay)
  const setReplayIndex = useFlightRecorderStore(s => s.setReplayIndex)
  const setReplaySpeed = useFlightRecorderStore(s => s.setReplaySpeed)

  // ── Max frame count for the scrubber ──────────────────────────────
  const maxFrames = useMemo(() => {
    const ids = droneId ? [droneId] : Object.keys(recordings)
    let max = 0
    for (const id of ids) {
      const rec = recordings[id]
      if (!rec) continue
      const count = Math.min(rec.total, MAX_FRAMES_PER_DRONE)
      if (count > max) max = count
    }
    return max
  }, [recordings, droneId])

  const isReplaying = replayState !== 'IDLE'
  const hasData     = maxFrames >= 2

  // ── Handlers ──────────────────────────────────────────────────────
  const handleRecToggle = () => {
    if (isReplaying) return   // can't record during replay
    if (isRecording) { stopRecording() } else { startRecording() }
  }

  const handlePlayPause = () => {
    if (replayState === 'IDLE') {
      if (!hasData) return
      startReplay(droneId ?? undefined)
    } else if (replayState === 'PLAYING') {
      pauseReplay()
    } else if (replayState === 'PAUSED') {
      resumeReplay()
    }
  }

  const handleStop = () => stopReplay()

  const handleScrub = (e: React.ChangeEvent<HTMLInputElement>) => {
    const idx = parseInt(e.target.value, 10)
    setReplayIndex(idx)
    // Write the selected frame immediately so the map/model updates on scrub drag
    const recs = useFlightRecorderStore.getState().recordings
    const updateDrone = useDroneStore.getState().updateDrone
    const ids = droneId ? [droneId] : Object.keys(recs)
    for (const id of ids) {
      const rec = recs[id]
      if (!rec) continue
      const safeIdx = Math.max(0, Math.min(idx, Math.min(rec.total, MAX_FRAMES_PER_DRONE) - 1))
      const base = safeIdx * FRAME_FIELDS
      updateDrone(id, {
        lat: rec.frames[base + F.LAT], lng: rec.frames[base + F.LNG],
        altitude: rec.frames[base + F.ALT], roll: rec.frames[base + F.ROLL],
        pitch: rec.frames[base + F.PITCH], yaw: rec.frames[base + F.YAW],
        airspeed: rec.frames[base + F.AIRSPEED], groundspeed: rec.frames[base + F.GROUNDSPEED],
        battery: rec.frames[base + F.BATTERY],
      })
    }
  }

  const playLabel = replayState === 'PLAYING' ? '⏸' : replayState === 'PAUSED' ? '▶' : '▶ Replay'

  return (
    <div className="replay-bar">
      {/* ── Record button ── */}
      {isRecording && <div className="replay-bar__rec-dot" />}
      <button
        className={`replay-bar__btn-rec${isRecording ? ' replay-bar__btn-rec--active' : ''}`}
        onClick={handleRecToggle}
        disabled={isReplaying}
        title={isRecording ? 'Detener grabación' : 'Iniciar grabación de telemetría'}
      >
        {isRecording ? '⏹ REC' : '● REC'}
      </button>

      <div className="replay-bar__div" />

      {/* ── Play / Pause button ── */}
      <button
        className={`replay-bar__btn-play${isReplaying ? ' replay-bar__btn-play--active' : ''}`}
        onClick={handlePlayPause}
        disabled={!hasData && replayState === 'IDLE'}
        title={replayState === 'PLAYING' ? 'Pausar replay' : replayState === 'PAUSED' ? 'Reanudar replay' : 'Iniciar replay del vuelo grabado'}
      >
        {playLabel}
      </button>

      {/* ── Stop button (only during replay) ── */}
      {isReplaying && (
        <button onClick={handleStop} title="Detener replay">
          ⏹
        </button>
      )}

      <div className="replay-bar__div" />

      {/* ── Timeline scrubber ── */}
      <div className="replay-bar__scrubber-wrap">
        <span className="replay-bar__time">{frameToTime(replayIndex)}</span>
        <input
          type="range"
          className="replay-bar__slider"
          min={0}
          max={Math.max(0, maxFrames - 1)}
          value={replayIndex}
          onChange={handleScrub}
          disabled={!hasData}
          title="Posición del replay"
        />
        <span className="replay-bar__time">{frameToTime(maxFrames)}</span>
      </div>

      {/* ── Playback speed ── */}
      {isReplaying && (
        <select
          className="replay-bar__speed"
          value={replaySpeed}
          onChange={e => setReplaySpeed(parseFloat(e.target.value))}
          title="Velocidad de reproducción"
        >
          {SPEED_OPTIONS.map(s => (
            <option key={s} value={s}>{s}×</option>
          ))}
        </select>
      )}

      {/* ── Frame counter ── */}
      <span className="replay-bar__frames">
        {maxFrames > 0 ? `${maxFrames} frames` : 'Sin datos'}
      </span>
    </div>
  )
}

export default ReplayBar
