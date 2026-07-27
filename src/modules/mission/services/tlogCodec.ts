/**
 * tlogCodec.ts
 *
 * ═══════════════════════════════════════════════════════════════════════
 * BINARY TLOG FORMAT — EFFICIENT FLIGHT LOG ENCODER / DECODER
 * ═══════════════════════════════════════════════════════════════════════
 *
 * File structure:
 *   HEADER (fixed 32 bytes)
 *     magic    : 4 bytes  "MISSION"
 *     version  : Uint8
 *     flags    : Uint8 (bit 0 = delta-encoded)
 *     reserved : 2 bytes
 *     droneCount : Uint32
 *     totalFrames: Uint32
 *     createdAt  : Float64 (ms since epoch)
 *     reserved   : 8 bytes
 *
 *   Per-drone block (repeated droneCount times):
 *     DRONE_HEADER (variable)
 *       droneIdLen  : Uint16
 *       droneId     : UTF-8 bytes
 *       missionLen  : Uint16
 *       missionName : UTF-8 bytes
 *       startedAt   : Float64 (ms)
 *       frameCount  : Uint32
 *
 *     FRAME DATA
 *       First frame:  12 × Float32 (absolute values)
 *       Delta frames: 12 × Int16 (scaled deltas from previous frame)
 *         lat/lng delta scaled by 1e7 → Int16  (~0.01m resolution)
 *         alt delta scaled by 100    → Int16  (~0.01m resolution)
 *         angles scaled by 100      → Int16  (~0.01° resolution)
 *         speeds scaled by 100      → Int16  (~0.01 m/s resolution)
 *         battery scaled by 100     → Int16  (~0.01% resolution)
 *
 *     TIMESTAMPS
 *       timestamps: frameCount × Uint32
 *
 * Compression ratio vs JSON:
 *   ~15–20× smaller than JSON number arrays
 *   ~5× smaller than base64-encoded Float32Array
 */

import {
  type DroneRecording,
  FRAME_FIELDS,
  MAX_FRAMES_PER_DRONE,
  F,
} from '../../replay/store/flightRecorderStore'

// ── Constants ─────────────────────────────────────────────────────────────

const MAGIC = new Uint8Array([0x52, 0x4F, 0x48, 0x55]) // "MISSION"
const FORMAT_VERSION = 1
const FLAG_DELTA = 0x01

const HEADER_SIZE = 32

// Delta scale factors — chosen for Int16 range (-32768..32767)
const SCALE = {
  [F.LAT]:         1e7,   // ~0.011m per unit at equator
  [F.LNG]:         1e7,
  [F.ALT]:         100,   // 0.01m
  [F.ROLL]:        100,   // 0.01°
  [F.PITCH]:       100,
  [F.YAW]:         100,
  [F.AIRSPEED]:    100,   // 0.01 m/s
  [F.GROUNDSPEED]: 100,
  [F.BATTERY]:     100,   // 0.01%
  [F.VX]:          100,
  [F.VY]:          100,
  [F.VZ]:          100,
} as const

// ── Encoder ───────────────────────────────────────────────────────────────

/**
 * Encode recordings to a compact binary TLOG buffer.
 */
export function encodeTlog(
  recordings: Record<string, DroneRecording>,
): ArrayBuffer {
  const encoder = new TextEncoder()
  const entries = Object.values(recordings).filter(
    (rec) => Math.min(rec.total, MAX_FRAMES_PER_DRONE) >= 1,
  )

  // Calculate total size
  let totalSize = HEADER_SIZE

  const droneData: Array<{
    rec: DroneRecording
    frameCount: number
    droneIdBytes: Uint8Array
    missionBytes: Uint8Array
  }> = []

  let totalFrames = 0

  for (const rec of entries) {
    const frameCount = Math.min(rec.total, MAX_FRAMES_PER_DRONE)
    const droneIdBytes = encoder.encode(rec.droneId)
    const missionBytes = encoder.encode(rec.missionName || rec.droneId)

    // Drone header: 2+id + 2+mission + 8(startedAt) + 4(frameCount)
    const droneHeaderSize = 2 + droneIdBytes.length + 2 + missionBytes.length + 8 + 4

    // Frame data: first frame (12 × 4 bytes) + (frameCount-1) × 12 × 2 bytes (Int16 deltas)
    const frameDataSize =
      FRAME_FIELDS * 4 + Math.max(0, frameCount - 1) * FRAME_FIELDS * 2

    // Timestamps: frameCount × 4 bytes
    const timestampSize = frameCount * 4

    totalSize += droneHeaderSize + frameDataSize + timestampSize
    totalFrames += frameCount

    droneData.push({ rec, frameCount, droneIdBytes, missionBytes })
  }

  // Allocate and write
  const buffer = new ArrayBuffer(totalSize)
  const view = new DataView(buffer)
  const bytes = new Uint8Array(buffer)
  let offset = 0

  // ── Header ──
  bytes.set(MAGIC, 0)
  offset = 4
  view.setUint8(offset++, FORMAT_VERSION)
  view.setUint8(offset++, FLAG_DELTA)
  offset += 2 // reserved
  view.setUint32(offset, entries.length, true)
  offset += 4
  view.setUint32(offset, totalFrames, true)
  offset += 4
  view.setFloat64(offset, Date.now(), true)
  offset += 8
  offset += 8 // reserved

  // ── Per-drone blocks ──
  for (const { rec, frameCount, droneIdBytes, missionBytes } of droneData) {
    // Drone header
    view.setUint16(offset, droneIdBytes.length, true)
    offset += 2
    bytes.set(droneIdBytes, offset)
    offset += droneIdBytes.length

    view.setUint16(offset, missionBytes.length, true)
    offset += 2
    bytes.set(missionBytes, offset)
    offset += missionBytes.length

    view.setFloat64(offset, rec.startedAt, true)
    offset += 8

    view.setUint32(offset, frameCount, true)
    offset += 4

    // Resolve ring-buffer order
    const ringOffset = rec.total > MAX_FRAMES_PER_DRONE ? rec.cursor : 0

    // Write first frame as absolute Float32
    const firstSlot = (ringOffset + 0) % MAX_FRAMES_PER_DRONE
    const firstBase = firstSlot * FRAME_FIELDS
    const prevValues = new Float32Array(FRAME_FIELDS)

    for (let f = 0; f < FRAME_FIELDS; f++) {
      const val = rec.frames[firstBase + f]
      view.setFloat32(offset, val, true)
      offset += 4
      prevValues[f] = val
    }

    // Write remaining frames as Int16 deltas
    for (let i = 1; i < frameCount; i++) {
      const slot = (ringOffset + i) % MAX_FRAMES_PER_DRONE
      const base = slot * FRAME_FIELDS

      for (let f = 0; f < FRAME_FIELDS; f++) {
        const current = rec.frames[base + f]
        let delta = current - prevValues[f]

        // For YAW (field 5), use short-path delta to avoid 359°→1° overflow.
        // Raw delta of -358° scaled ×100 = -35800 which exceeds Int16 range.
        if (f === F.YAW) {
          delta = ((delta + 540) % 360) - 180   // normalise to (-180, 180]
        }

        const scale = SCALE[f as keyof typeof SCALE] ?? 100
        // Clamp to Int16 range
        const scaled = Math.max(-32768, Math.min(32767, Math.round(delta * scale)))
        view.setInt16(offset, scaled, true)
        offset += 2
        // Accumulate from the quantized value to avoid drift
        prevValues[f] += scaled / scale
      }
    }

    // Write timestamps
    for (let i = 0; i < frameCount; i++) {
      const slot = (ringOffset + i) % MAX_FRAMES_PER_DRONE
      view.setUint32(offset, rec.timestamps[slot], true)
      offset += 4
    }
  }

  return buffer
}

// ── Decoder ───────────────────────────────────────────────────────────────

export interface TlogDecodeResult {
  ok: true
  recordings: Record<string, DroneRecording>
}

export interface TlogDecodeError {
  ok: false
  error: string
}

export type TlogResult = TlogDecodeResult | TlogDecodeError

/**
 * Decode a binary TLOG buffer into DroneRecording objects.
 */
export function decodeTlog(buffer: ArrayBuffer): TlogResult {
  const view = new DataView(buffer)
  const bytes = new Uint8Array(buffer)
  const decoder = new TextDecoder()

  if (buffer.byteLength < HEADER_SIZE) {
    return { ok: false, error: 'Archivo TLOG demasiado pequeño.' }
  }

  // Validate magic
  for (let i = 0; i < 4; i++) {
    if (bytes[i] !== MAGIC[i]) {
      return { ok: false, error: 'No es un archivo TLOG válido.' }
    }
  }

  let offset = 4
  const version = view.getUint8(offset++)
  if (version !== FORMAT_VERSION) {
    return {
      ok: false,
      error: `Versión TLOG no soportada (esperado ${FORMAT_VERSION}, recibido ${version}).`,
    }
  }

  const flags = view.getUint8(offset++)
  const isDelta = (flags & FLAG_DELTA) !== 0
  offset += 2 // reserved

  const droneCount = view.getUint32(offset, true)
  offset += 4
  // totalFrames — skip, we use per-drone counts
  offset += 4
  // createdAt — skip
  offset += 8
  offset += 8 // reserved

  const recordings: Record<string, DroneRecording> = {}

  for (let d = 0; d < droneCount; d++) {
    // Drone header
    if (offset + 2 > buffer.byteLength) {
      return { ok: false, error: 'Archivo TLOG truncado (drone header).' }
    }

    const droneIdLen = view.getUint16(offset, true)
    offset += 2
    const droneId = decoder.decode(bytes.subarray(offset, offset + droneIdLen))
    offset += droneIdLen

    const missionLen = view.getUint16(offset, true)
    offset += 2
    const missionName = decoder.decode(bytes.subarray(offset, offset + missionLen))
    offset += missionLen

    const startedAt = view.getFloat64(offset, true)
    offset += 8

    const frameCount = view.getUint32(offset, true)
    offset += 4

    if (frameCount < 1) continue

    // Allocate full-size buffers
    const frames = new Float32Array(MAX_FRAMES_PER_DRONE * FRAME_FIELDS)
    const timestamps = new Uint32Array(MAX_FRAMES_PER_DRONE)
    const copyCount = Math.min(frameCount, MAX_FRAMES_PER_DRONE)

    // Read first frame (absolute Float32)
    const prevValues = new Float32Array(FRAME_FIELDS)
    for (let f = 0; f < FRAME_FIELDS; f++) {
      const val = view.getFloat32(offset, true)
      offset += 4
      frames[f] = val
      prevValues[f] = val
    }

    // Read delta frames
    if (isDelta) {
      for (let i = 1; i < frameCount; i++) {
        const dstBase = i * FRAME_FIELDS
        for (let f = 0; f < FRAME_FIELDS; f++) {
          const scaled = view.getInt16(offset, true)
          offset += 2
          const scale = SCALE[f as keyof typeof SCALE] ?? 100
          prevValues[f] += scaled / scale
          if (i < copyCount) {
            frames[dstBase + f] = prevValues[f]
          }
        }
      }
    } else {
      // Non-delta: straight Float32
      for (let i = 1; i < frameCount; i++) {
        const dstBase = i * FRAME_FIELDS
        for (let f = 0; f < FRAME_FIELDS; f++) {
          const val = view.getFloat32(offset, true)
          offset += 4
          if (i < copyCount) {
            frames[dstBase + f] = val
          }
        }
      }
    }

    // Read timestamps
    for (let i = 0; i < frameCount; i++) {
      const ts = view.getUint32(offset, true)
      offset += 4
      if (i < copyCount) {
        timestamps[i] = ts
      }
    }

    recordings[droneId] = {
      droneId,
      missionName,
      startedAt,
      frames,
      timestamps,
      cursor: copyCount % MAX_FRAMES_PER_DRONE,
      total: copyCount,
    }
  }

  if (Object.keys(recordings).length === 0) {
    return { ok: false, error: 'El archivo TLOG no contiene datos de vuelo.' }
  }

  return { ok: true, recordings }
}

// ── File helpers ──────────────────────────────────────────────────────────

/**
 * Download recordings as a .tlog binary file.
 */
export function downloadTlog(
  recordings: Record<string, DroneRecording>,
  fileName = 'telemetry',
): void {
  const buffer = encodeTlog(recordings)
  const blob = new Blob([buffer], { type: 'application/octet-stream' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${fileName}.tlog`
  a.click()
  URL.revokeObjectURL(url)
}

/**
 * Read a .tlog file from an <input type="file">.
 */
export function readTlogFile(file: File): Promise<TlogResult> {
  return new Promise((resolve) => {
    const reader = new FileReader()
    reader.onload = () => {
      const buffer = reader.result as ArrayBuffer
      resolve(decodeTlog(buffer))
    }
    reader.onerror = () =>
      resolve({ ok: false, error: 'Error al leer el archivo TLOG.' })
    reader.readAsArrayBuffer(file)
  })
}
