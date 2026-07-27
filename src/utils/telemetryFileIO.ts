/**
 * telemetryFileIO.ts
 *
 * ═══════════════════════════════════════════════════════════════════════
 * TELEMETRY RECORDING — FILE EXPORT & IMPORT
 * ═══════════════════════════════════════════════════════════════════════
 *
 * Export format (JSON)
 * ────────────────────
 *  {
 *    "version": 2,
 *    "exportedAt": "<ISO 8601>",
 *    "missions": [
 *      {
 *        "droneId":     "drone-1",
 *        "missionName": "Misión Madrid",
 *        "startedAt":   1700000000000,
 *        "frameCount":  4500,
 *        "durationSec": 225,
 *        "frames": "<base64-encoded Float32Array>",
 *        "timestamps":  "<base64-encoded Uint32Array>"
 *      }
 *    ]
 *  }
 *
 * The typed arrays are base64-encoded because JSON doesn't support binary.
 * Using base64 instead of a JSON number array keeps file size ~33% larger
 * than raw binary, but still 8–10× smaller than full JSON number arrays
 * (e.g. 4 500 frames × 12 fields = 54 000 floats → 216 KB raw JSON vs
 * ~288 KB base64).
 *
 * For very long recordings (>10 min) consider switching to a binary
 * format in a future version — the shape/API here stays identical, only
 * the serialisation layer changes.
 *
 * Security note: All imported data is validated before use.  We only
 * read numeric fields and reject anything that doesn't match the schema.
 */

import {
  type DroneRecording,
  FRAME_FIELDS,
  MAX_FRAMES_PER_DRONE,
  RECORD_HZ,
} from '../modules/replay/store'

// ── Public Types ─────────────────────────────────────────────────────────

/** Current file format version.  Increment on breaking schema changes. */
export const FILE_FORMAT_VERSION = 2

export interface TelemetryExportMission {
  droneId:     string
  missionName: string
  startedAt:   number
  frameCount:  number
  durationSec: number
  /** base64-encoded Float32Array (frameCount × FRAME_FIELDS elements) */
  frames:      string
  /** base64-encoded Uint32Array (frameCount elements) */
  timestamps:  string
}

export interface TelemetryExportFile {
  version:    number
  exportedAt: string
  missions:   TelemetryExportMission[]
}

// ── Export ────────────────────────────────────────────────────────────────

/**
 * Serialise one or more DroneRecordings to a JSON string.
 *
 * Only `frameCount = min(rec.total, MAX_FRAMES_PER_DRONE)` frames are
 * exported in chronological order (ring-buffer order is resolved here).
 */
export function exportRecordings(
  recordings: Record<string, DroneRecording>,
): string {
  const missions: TelemetryExportMission[] = []

  for (const rec of Object.values(recordings)) {
    const frameCount = Math.min(rec.total, MAX_FRAMES_PER_DRONE)
    if (frameCount < 1) continue

    // Re-order ring buffer into a chronological Float32Array
    const orderedFrames      = new Float32Array(frameCount * FRAME_FIELDS)
    const orderedTimestamps  = new Uint32Array(frameCount)

    const ringOffset = rec.total > MAX_FRAMES_PER_DRONE ? rec.cursor : 0

    for (let i = 0; i < frameCount; i++) {
      const slot    = (ringOffset + i) % MAX_FRAMES_PER_DRONE
      const srcBase = slot * FRAME_FIELDS
      const dstBase = i    * FRAME_FIELDS
      for (let f = 0; f < FRAME_FIELDS; f++) {
        orderedFrames[dstBase + f] = rec.frames[srcBase + f]
      }
      orderedTimestamps[i] = rec.timestamps[slot]
    }

    missions.push({
      droneId:     rec.droneId,
      missionName: rec.missionName || rec.droneId,
      startedAt:   rec.startedAt,
      frameCount,
      durationSec: Math.round((frameCount / RECORD_HZ) * 10) / 10,
      frames:      arrayBufferToBase64(orderedFrames.buffer),
      timestamps:  arrayBufferToBase64(orderedTimestamps.buffer),
    })
  }

  const file: TelemetryExportFile = {
    version:    FILE_FORMAT_VERSION,
    exportedAt: new Date().toISOString(),
    missions,
  }

  return JSON.stringify(file, null, 2)
}

/**
 * Trigger a browser download of the serialised recordings.
 *
 * @param recordings  The recordings map from flightRecorderStore
 * @param fileName    Suggested filename (without extension)
 */
export function downloadRecordings(
  recordings: Record<string, DroneRecording>,
  fileName = 'telemetry',
): void {
  const json = exportRecordings(recordings)
  const blob = new Blob([json], { type: 'application/json' })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href     = url
  a.download = `${fileName}.mission.json`
  a.click()
  URL.revokeObjectURL(url)
}

// ── Import ────────────────────────────────────────────────────────────────

export type ImportResult =
  | { ok: true;  recordings: Record<string, DroneRecording> }
  | { ok: false; error: string }

/**
 * Parse a raw file string produced by exportRecordings().
 *
 * Returns a ready-to-use `recordings` map that can be merged into the
 * flightRecorderStore, or an error object if parsing fails.
 *
 * Validation is intentionally strict: incomplete or malformed files are
 * rejected entirely rather than silently accepted with bad data.
 */
export function importRecordings(rawJson: string): ImportResult {
  let parsed: unknown
  try {
    parsed = JSON.parse(rawJson)
  } catch {
    return { ok: false, error: 'El archivo no es JSON válido.' }
  }

  if (!isObject(parsed)) {
    return { ok: false, error: 'Formato de archivo inválido.' }
  }

  const file = parsed as Record<string, unknown>

  if (file['version'] !== FILE_FORMAT_VERSION) {
    return {
      ok: false,
      error: `Versión de archivo no soportada (esperado ${FILE_FORMAT_VERSION}, recibido ${file['version']}).`,
    }
  }

  if (!Array.isArray(file['missions'])) {
    return { ok: false, error: 'El archivo no contiene misiones.' }
  }

  const recordings: Record<string, DroneRecording> = {}

  for (const raw of file['missions'] as unknown[]) {
    const result = parseMission(raw)
    if (result.ok === false) return result
    recordings[result.recording.droneId] = result.recording
  }

  if (Object.keys(recordings).length === 0) {
    return { ok: false, error: 'El archivo no contiene datos de vuelo.' }
  }

  return { ok: true, recordings }
}

// ── File-input helper ─────────────────────────────────────────────────────

/**
 * Read a File object from an <input type="file"> and call importRecordings.
 * Resolves with ImportResult so the caller can show errors inline.
 */
export function readRecordingFile(file: File): Promise<ImportResult> {
  return new Promise((resolve) => {
    const reader = new FileReader()
    reader.onload  = () => resolve(importRecordings(reader.result as string))
    reader.onerror = () => resolve({ ok: false, error: 'Error al leer el archivo.' })
    reader.readAsText(file)
  })
}

// ── Internal helpers ──────────────────────────────────────────────────────

type MissionParseResult =
  | { ok: true;  recording: DroneRecording }
  | { ok: false; error: string }

function parseMission(raw: unknown): MissionParseResult {
  if (!isObject(raw)) return { ok: false, error: 'Entrada de misión inválida.' }
  const m = raw as Record<string, unknown>

  const droneId     = assertString(m['droneId'],     'droneId')
  if (!droneId.ok)  return droneId

  const missionName = assertString(m['missionName'], 'missionName')
  if (!missionName.ok) return missionName

  const startedAt   = assertNumber(m['startedAt'],   'startedAt')
  if (!startedAt.ok) return startedAt

  const frameCount  = assertNumber(m['frameCount'],  'frameCount')
  if (!frameCount.ok) return frameCount

  const framesB64     = assertString(m['frames'],     'frames')
  if (!framesB64.ok)   return framesB64

  const timestampsB64 = assertString(m['timestamps'], 'timestamps')
  if (!timestampsB64.ok) return timestampsB64

  // Decode arrays
  let framesArr: Float32Array
  let timestampsArr: Uint32Array
  try {
    framesArr     = new Float32Array(base64ToArrayBuffer(framesB64.value))
    timestampsArr = new Uint32Array(base64ToArrayBuffer(timestampsB64.value))
  } catch {
    return { ok: false, error: 'Los datos de telemetría están corruptos.' }
  }

  const fc = frameCount.value
  if (framesArr.length !== fc * FRAME_FIELDS) {
    return { ok: false, error: `Array de frames con tamaño erróneo (${framesArr.length} vs ${fc * FRAME_FIELDS}).` }
  }
  if (timestampsArr.length !== fc) {
    return { ok: false, error: `Array de timestamps con tamaño erróneo.` }
  }

  // Allocate full-size buffer and copy data in
  const frames     = new Float32Array(MAX_FRAMES_PER_DRONE * FRAME_FIELDS)
  const timestamps = new Uint32Array(MAX_FRAMES_PER_DRONE)

  const copyCount = Math.min(fc, MAX_FRAMES_PER_DRONE)
  frames.set(framesArr.subarray(0, copyCount * FRAME_FIELDS))
  timestamps.set(timestampsArr.subarray(0, copyCount))

  const recording: DroneRecording = {
    droneId:     droneId.value,
    missionName: missionName.value,
    startedAt:   startedAt.value,
    frames,
    timestamps,
    cursor:      copyCount % MAX_FRAMES_PER_DRONE,
    total:       copyCount,
  }

  return { ok: true, recording }
}

// ── Primitive validators (avoids throwing on bad data) ────────────────────

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

type OK<T>   = { ok: true;  value: T }
type Err     = { ok: false; error: string }

function assertString(v: unknown, field: string): OK<string> | Err {
  if (typeof v !== 'string') return { ok: false, error: `Campo '${field}' debe ser string.` }
  return { ok: true, value: v }
}

function assertNumber(v: unknown, field: string): OK<number> | Err {
  if (typeof v !== 'number' || !isFinite(v)) return { ok: false, error: `Campo '${field}' debe ser número.` }
  return { ok: true, value: v }
}

// ── Base64 codec ──────────────────────────────────────────────────────────

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes  = new Uint8Array(buffer)
  let binary   = ''
  const chunk  = 8192   // avoid stack overflow on btoa with huge strings
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk))
  }
  return btoa(binary)
}

function base64ToArrayBuffer(b64: string): ArrayBuffer {
  const binary = atob(b64)
  const bytes  = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes.buffer
}

// ── Duration helper (used by UI) ──────────────────────────────────────────

/** Convert frame count to a human-readable duration string (MM:SS) */
export function framesToDuration(frameCount: number): string {
  const totalSec = Math.floor(frameCount / RECORD_HZ)
  const mm = Math.floor(totalSec / 60).toString().padStart(2, '0')
  const ss = (totalSec % 60).toString().padStart(2, '0')
  return `${mm}:${ss}`
}

/** Convert frame index to a human-readable elapsed time (MM:SS) */
export function frameIndexToTime(index: number): string {
  return framesToDuration(Math.floor(index))
}

/** Format bytes as human-readable size */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1048576).toFixed(2)} MB`
}
