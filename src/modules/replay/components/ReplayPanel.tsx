/**
 * ReplayPanel.tsx
 *
 * ═══════════════════════════════════════════════════════════════════════
 * PROFESSIONAL REPLAY CONTROL PANEL
 * ═══════════════════════════════════════════════════════════════════════
 *
 * A floating dock anchored above the map (top-right area of the center
 * column), below the map toolbar.  It does NOT overlap the footer or
 * the status bar.
 *
 * Layout (collapsed):
 *   [● REC  |  ⏮ ▶/⏸ ⏭  |  00:00 ━━━━━━━━━━━ 02:30  |  1×  |  💾  📂]
 *
 * Layout (expanded — shows mission selector for multi-drone):
 *   + Drone selector row
 *   + Recording metadata (frames, estimated size, mission name)
 *   + Import status / error feedback
 *
 * Design decisions
 * ────────────────
 * • Anchored INSIDE the map canvas area, not outside it — so it never
 *   affects the footer / status bar layout.
 * • Uses CSS position:absolute (relative to .gcs-map-col) so it never
 *   causes layout reflow.
 * • Glassmorphism styling consistent with the rest of the GCS design
 *   system (backdrop-filter blur, rohu-* color tokens where possible).
 * • The component is self-contained: it imports the stores directly and
 *   exposes only the `droneId` prop for the active drone context.
 */

import React, { useRef, useState, useCallback, useMemo } from 'react'
import {
  SkipBack, Play, Pause, Square, SkipForward,
  Save, FolderOpen, ChevronUp, ChevronDown,
} from 'lucide-react'
import { useFlightRecorderStore, MAX_FRAMES_PER_DRONE, RECORD_HZ, FRAME_FIELDS, F } from '..'
import { useDroneStore } from '../../drone'
import {
  downloadRecordings,
  readRecordingFile,
  framesToDuration,
  frameIndexToTime,
  formatBytes,
} from '../../../utils/telemetryFileIO'
import './ReplayPanel.css'

// ── Constants ──────────────────────────────────────────────────────────────

const SPEED_OPTIONS = [0.25, 0.5, 1, 2, 4, 8] as const

// ── Props ──────────────────────────────────────────────────────────────────

interface ReplayPanelProps {
  /** Active drone ID — used to pre-select the drone for replay */
  droneId?: string | null
}

// ── Helpers ────────────────────────────────────────────────────────────────

/** Estimate serialised file size for `frameCount` frames (rough base64 sizing) */
function estimateFileSize(frameCount: number): number {
  // Float32Array: 4 bytes per float × FRAME_FIELDS
  // Uint32Array:  4 bytes per timestamp
  // base64 overhead: ×4/3
  const raw = frameCount * (FRAME_FIELDS * 4 + 4)
  return Math.round(raw * (4 / 3))
}

// ── Component ──────────────────────────────────────────────────────────────

const ReplayPanel: React.FC<ReplayPanelProps> = ({ droneId }) => {
  // ── Store bindings ───────────────────────────────────────────────────
  const isRecording   = useFlightRecorderStore(s => s.isRecording)
  const recordings    = useFlightRecorderStore(s => s.recordings)
  const replayState   = useFlightRecorderStore(s => s.replayState)
  const replayIndex   = useFlightRecorderStore(s => s.replayIndex)
  const replaySpeed   = useFlightRecorderStore(s => s.replaySpeed)
  const replayDroneId = useFlightRecorderStore(s => s.replayDroneId)

  const startRecording  = useFlightRecorderStore(s => s.startRecording)
  const stopRecording   = useFlightRecorderStore(s => s.stopRecording)
  const startReplay     = useFlightRecorderStore(s => s.startReplay)
  const stopReplay      = useFlightRecorderStore(s => s.stopReplay)
  const pauseReplay     = useFlightRecorderStore(s => s.pauseReplay)
  const resumeReplay    = useFlightRecorderStore(s => s.resumeReplay)
  const setReplayIndex  = useFlightRecorderStore(s => s.setReplayIndex)
  const setReplaySpeed  = useFlightRecorderStore(s => s.setReplaySpeed)
  const clearAll        = useFlightRecorderStore(s => s.clearAll)

  // ── Local state ──────────────────────────────────────────────────────
  const [expanded, setExpanded]     = useState(false)
  const [importError, setImportError] = useState<string | null>(null)
  const [importing, setImporting]   = useState(false)
  const fileInputRef                = useRef<HTMLInputElement>(null)

  // ── Derived values ──────────────────────────────────────────────────
  /** Drone IDs that have recorded data */
  const recordedIds = useMemo(() => Object.keys(recordings), [recordings])

  /** Active replay target ID (fallback to prop) */
  const effectiveDroneId = replayDroneId ?? droneId ?? recordedIds[0] ?? null

  /** Frame count for the display drone */
  const activeFrameCount = useMemo(() => {
    if (!effectiveDroneId) return 0
    const rec = recordings[effectiveDroneId]
    if (!rec) return 0
    return Math.min(rec.total, MAX_FRAMES_PER_DRONE)
  }, [recordings, effectiveDroneId])

  /** Max frame count across all drones in scope (drives slider range) */
  const maxFrames = useMemo(() => {
    const ids = effectiveDroneId ? [effectiveDroneId] : recordedIds
    return ids.reduce((max, id) => {
      const rec = recordings[id]
      if (!rec) return max
      return Math.max(max, Math.min(rec.total, MAX_FRAMES_PER_DRONE))
    }, 0)
  }, [recordings, effectiveDroneId, recordedIds])

  const isReplaying = replayState !== 'IDLE'
  const isPlaying   = replayState === 'PLAYING'
  const hasData     = maxFrames >= 2

  const totalDuration = framesToDuration(maxFrames)
  const currentTime   = frameIndexToTime(replayIndex)

  // Scrubber fill percentage (CSS custom property for the track fill)
  const scrubPercent = maxFrames > 1
    ? (Math.floor(replayIndex) / (maxFrames - 1)) * 100
    : 0

  // ── Handlers ─────────────────────────────────────────────────────────

  const handleRecToggle = useCallback(() => {
    if (isReplaying) return
    if (isRecording) {
      stopRecording()
    } else {
      startRecording()
    }
  }, [isReplaying, isRecording, startRecording, stopRecording])

  const handlePlayPause = useCallback(() => {
    if (replayState === 'IDLE') {
      if (!hasData) return
      startReplay(effectiveDroneId ?? undefined)
    } else if (isPlaying) {
      pauseReplay()
    } else {
      resumeReplay()
    }
  }, [replayState, hasData, isPlaying, startReplay, pauseReplay, resumeReplay, effectiveDroneId])

  const handleStop = useCallback(() => stopReplay(), [stopReplay])

  const handleStepBack = useCallback(() => {
    const idx = Math.max(0, Math.floor(replayIndex) - 1)
    setReplayIndex(idx)
    // Also write the frame immediately so view updates while paused
    seekToFrame(idx, effectiveDroneId, recordings, recordedIds)
  }, [replayIndex, effectiveDroneId, recordings, recordedIds, setReplayIndex])

  const handleStepForward = useCallback(() => {
    const idx = Math.min(maxFrames - 1, Math.floor(replayIndex) + 1)
    setReplayIndex(idx)
    seekToFrame(idx, effectiveDroneId, recordings, recordedIds)
  }, [replayIndex, maxFrames, effectiveDroneId, recordings, recordedIds, setReplayIndex])

  const handleScrub = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const idx = parseFloat(e.target.value)
    setReplayIndex(idx)
    seekToFrame(Math.floor(idx), effectiveDroneId, recordings, recordedIds)
  }, [effectiveDroneId, recordings, recordedIds, setReplayIndex])

  const handleExport = useCallback(() => {
    if (!hasData) return
    const name = effectiveDroneId
      ? (recordings[effectiveDroneId]?.missionName || effectiveDroneId)
      : 'telemetria'
    downloadRecordings(recordings, name)
  }, [hasData, recordings, effectiveDroneId])

  const handleImportClick = useCallback(() => {
    setImportError(null)
    fileInputRef.current?.click()
  }, [])

  const handleFileChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''   // allow re-importing same file

    setImporting(true)
    setImportError(null)

    const result = await readRecordingFile(file)

    setImporting(false)

    if (!result.ok) {
      setImportError(result.error)
      return
    }

    // Merge imported recordings into the store
    // We set isRecording=false and overwrite recordings in place.
    useFlightRecorderStore.setState({
      recordings:  result.recordings,
      isRecording: false,
      replayState: 'IDLE',
      replayIndex: 0,
    })
  }, [])

  const handleClearAll = useCallback(() => {
    stopReplay()
    clearAll()
    setImportError(null)
  }, [stopReplay, clearAll])

  // ── Render ───────────────────────────────────────────────────────────

  return (
    <div className={`rp ${isReplaying ? 'rp--replaying' : ''} ${expanded ? 'rp--expanded' : ''}`}>

      {/* ── Main control row ── */}
      <div className="rp__row rp__row--main">

        {/* Record button */}
        <button
          className={`rp__btn rp__btn--rec ${isRecording ? 'rp__btn--rec-active' : ''}`}
          onClick={handleRecToggle}
          disabled={isReplaying}
          title={isRecording ? 'Detener grabación' : 'Iniciar grabación de telemetría'}
          aria-label={isRecording ? 'Detener grabación' : 'Iniciar grabación'}
        >
          {isRecording ? (
            <><span className="rp__rec-dot" />REC</>
          ) : (
            <><span className="rp__rec-ring" />REC</>
          )}
        </button>

        <div className="rp__sep" />

        {/* Step back */}
        <button
          className="rp__btn rp__btn--icon"
          onClick={handleStepBack}
          disabled={!isReplaying && !hasData}
          title="Retroceder un frame"
          aria-label="Frame anterior"
        ><SkipBack size={13} /></button>

        {/* Play / Pause */}
        <button
          className={`rp__btn rp__btn--play ${isPlaying ? 'rp__btn--play-active' : ''}`}
          onClick={handlePlayPause}
          disabled={!hasData}
          title={isPlaying ? 'Pausar' : replayState === 'PAUSED' ? 'Reanudar' : 'Reproducir telemetría grabada'}
          aria-label={isPlaying ? 'Pausar' : 'Reproducir'}
        >
          {isPlaying ? <Pause size={14} /> : <Play size={14} />}
        </button>

        {/* Stop */}
        <button
          className="rp__btn rp__btn--icon"
          onClick={handleStop}
          disabled={!isReplaying}
          title="Detener replay"
          aria-label="Detener"
        ><Square size={13} /></button>

        {/* Step forward */}
        <button
          className="rp__btn rp__btn--icon"
          onClick={handleStepForward}
          disabled={!hasData}
          title="Avanzar un frame"
          aria-label="Siguiente frame"
        ><SkipForward size={13} /></button>

        <div className="rp__sep" />

        {/* Timeline */}
        <div className="rp__timeline">
          <span className="rp__time rp__time--current">{currentTime}</span>
          <div className="rp__track-wrap">
            <input
              type="range"
              className="rp__slider"
              min={0}
              max={Math.max(0, maxFrames - 1)}
              step={1}
              value={Math.floor(replayIndex)}
              onChange={handleScrub}
              disabled={!hasData}
              style={{ '--fill': `${scrubPercent}%` } as React.CSSProperties}
              aria-label="Posición en el timeline"
              aria-valuemin={0}
              aria-valuemax={maxFrames - 1}
              aria-valuenow={Math.floor(replayIndex)}
            />
          </div>
          <span className="rp__time rp__time--total">{totalDuration}</span>
        </div>

        <div className="rp__sep" />

        {/* Speed selector */}
        <select
          className="rp__speed"
          value={replaySpeed}
          onChange={e => setReplaySpeed(parseFloat(e.target.value))}
          disabled={!isReplaying}
          aria-label="Velocidad de reproducción"
        >
          {SPEED_OPTIONS.map(s => (
            <option key={s} value={s}>{s}×</option>
          ))}
        </select>

        <div className="rp__sep" />

        {/* Export */}
        <button
          className="rp__btn rp__btn--icon rp__btn--export"
          onClick={handleExport}
          disabled={!hasData}
          title="Exportar grabación como archivo .rohu.json"
          aria-label="Exportar grabación"
        ><Save size={13} /></button>

        {/* Import */}
        <button
          className={`rp__btn rp__btn--icon rp__btn--import ${importing ? 'rp__btn--loading' : ''}`}
          onClick={handleImportClick}
          disabled={importing}
          title="Importar grabación desde archivo"
          aria-label="Importar grabación"
        >
          {importing ? '…' : <FolderOpen size={13} />}
        </button>

        {/* Expand toggle */}
        <button
          className="rp__btn rp__btn--icon rp__btn--expand"
          onClick={() => setExpanded(v => !v)}
          title={expanded ? 'Contraer panel' : 'Expandir info de grabación'}
          aria-label={expanded ? 'Contraer' : 'Expandir'}
          aria-expanded={expanded}
        >
          {expanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
        </button>
      </div>

      {/* ── Expanded info panel ── */}
      {expanded && (
        <div className="rp__info">
          {/* Recording metadata */}
          {hasData && effectiveDroneId && recordings[effectiveDroneId] && (
            <div className="rp__meta">
              <div className="rp__meta-row">
                <span className="rp__meta-label">Misión</span>
                <span className="rp__meta-value">
                  {recordings[effectiveDroneId].missionName || '—'}
                </span>
              </div>
              <div className="rp__meta-row">
                <span className="rp__meta-label">Frames</span>
                <span className="rp__meta-value">{activeFrameCount.toLocaleString()}</span>
              </div>
              <div className="rp__meta-row">
                <span className="rp__meta-label">Duración</span>
                <span className="rp__meta-value">{framesToDuration(activeFrameCount)}</span>
              </div>
              <div className="rp__meta-row">
                <span className="rp__meta-label">Tamaño</span>
                <span className="rp__meta-value">{formatBytes(estimateFileSize(activeFrameCount))}</span>
              </div>
              <div className="rp__meta-row">
                <span className="rp__meta-label">Frecuencia</span>
                <span className="rp__meta-value">{RECORD_HZ} Hz</span>
              </div>
            </div>
          )}

          {/* Multi-drone list */}
          {recordedIds.length > 1 && (
            <div className="rp__drone-list">
              <span className="rp__drone-list-label">Drones grabados:</span>
              <div className="rp__drone-chips">
                {recordedIds.map(id => (
                  <span key={id} className={`rp__chip ${effectiveDroneId === id ? 'rp__chip--active' : ''}`}>
                    {id}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Import error feedback */}
          {importError && (
            <div className="rp__error" role="alert">
              <span className="rp__error-icon">⚠</span>
              {importError}
            </div>
          )}

          {/* Clear button */}
          {hasData && (
            <button
              className="rp__btn rp__btn--clear"
              onClick={handleClearAll}
              disabled={isRecording}
              title="Borrar todos los datos grabados de memoria"
            >
              Limpiar grabación
            </button>
          )}
        </div>
      )}

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".json,.rohu.json"
        style={{ display: 'none' }}
        onChange={handleFileChange}
        aria-hidden="true"
      />
    </div>
  )
}

export default ReplayPanel

// ── Internal helpers ───────────────────────────────────────────────────────

/**
 * Immediately write a specific frame to droneStore.
 * Used on scrub-drag and step-frame so the view updates while paused.
 */
function seekToFrame(
  idx:            number,
  effectiveDroneId: string | null,
  recordings:     ReturnType<typeof useFlightRecorderStore.getState>['recordings'],
  recordedIds:    string[],
): void {
  const updateDrone = useDroneStore.getState().updateDrone
  const ids = effectiveDroneId ? [effectiveDroneId] : recordedIds

  for (const id of ids) {
    const rec = recordings[id]
    if (!rec) continue
    const fc    = Math.min(rec.total, MAX_FRAMES_PER_DRONE)
    const safeIdx = Math.max(0, Math.min(idx, fc - 1))

    // Resolve ring-buffer slot
    const ringOffset = rec.total > MAX_FRAMES_PER_DRONE ? rec.cursor : 0
    const slot       = (ringOffset + safeIdx) % MAX_FRAMES_PER_DRONE
    const base       = slot * FRAME_FIELDS

    updateDrone(id, {
      lat:         rec.frames[base + F.LAT],
      lng:         rec.frames[base + F.LNG],
      altitude:    rec.frames[base + F.ALT],
      roll:        rec.frames[base + F.ROLL],
      pitch:       rec.frames[base + F.PITCH],
      yaw:         rec.frames[base + F.YAW],
      airspeed:    rec.frames[base + F.AIRSPEED],
      groundspeed: rec.frames[base + F.GROUNDSPEED],
      battery:     rec.frames[base + F.BATTERY],
    })
  }
}
