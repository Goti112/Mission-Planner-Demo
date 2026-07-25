/**
 * useReplayEngine.ts  (exported as useFlightReplay for backward compat)
 *
 * ═══════════════════════════════════════════════════════════════════════
 * REPLAY ENGINE — smooth sub-frame interpolated playback
 * ═══════════════════════════════════════════════════════════════════════
 *
 * How it works
 * ────────────
 * A single rAF loop runs while replayState === 'PLAYING'.
 * Each tick:
 *   1. Compute wall-clock Δt (capped at 100 ms to survive tab throttle).
 *   2. Add (Δt × replaySpeed) to a floating-point accumulator.
 *   3. Derive integer frame pair (floorIdx, ceilIdx) + blend factor α.
 *   4. For each drone: lerp all float fields, short-path lerp for yaw.
 *   5. Write one updateDrone() call — exactly what live telemetry does.
 *   6. Publish the new fractional index to the store (cheaply, via a
 *      ref-mutation path — only triggers React re-renders at 60 fps on
 *      fields consumers actually subscribe to).
 *
 * Interpolation details
 * ─────────────────────
 *   Linear lerp:   value = a + (b - a) * α
 *   Yaw lerp:      short-path — always take the <180° arc so a drone
 *                  reading 359° → 1° doesn't spin 358° the wrong way.
 *
 * Performance
 * ───────────
 *   • Zero allocation per tick (Float32Array indexed arithmetic only).
 *   • droneStore.updateDrone is a shallow Zustand patch — O(1).
 *   • Backward scrub (negative speed) is fully supported.
 *   • The simulation pipeline keeps running during replay; its writes
 *     are simply overridden by the replay loop.
 *
 * Exported as `useFlightReplay` to avoid changing import sites.
 */

import { useEffect, useRef } from 'react'
import {
  useFlightRecorderStore,
  FRAME_FIELDS, F,
  MAX_FRAMES_PER_DRONE,
  MS_PER_FRAME,
} from '../store/flightRecorderStore'
import { useDroneStore } from '../../drone'
import { useReplayTrajectoryStore } from '../store/replayTrajectoryStore'

// ── Short-path yaw lerp ───────────────────────────────────────────────────

/**
 * Interpolate between two angle values (degrees) along the shortest arc.
 * Result is always in [−180, 180) but droneStore accepts any float for yaw.
 */
function lerpAngle(a: number, b: number, t: number): number {
  const delta = ((b - a + 540) % 360) - 180   // normalise to (-180, 180]
  return a + delta * t
}

/** Linear interpolation for scalar fields */
function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

// ── Frame read helper — respects ring-buffer wrap ─────────────────────────

/**
 * Read a single float field from a ring-buffered recording.
 *
 * When total > MAX_FRAMES_PER_DRONE the oldest written slot is at
 *   (cursor) mod MAX_FRAMES_PER_DRONE
 * and linear indices [0..frameCount) map to ring slots via:
 *   slot = (cursor + linearIdx) % MAX_FRAMES_PER_DRONE
 */
function readField(
  frames: Float32Array,
  cursor:  number,
  total:   number,
  linearIdx: number,
  field:   number,
): number {
  const frameCount = Math.min(total, MAX_FRAMES_PER_DRONE)
  const safeIdx    = Math.max(0, Math.min(linearIdx, frameCount - 1))

  // If buffer has wrapped, the oldest frame lives at `cursor`.
  const ringOffset = total > MAX_FRAMES_PER_DRONE ? cursor : 0
  const slot       = (ringOffset + safeIdx) % MAX_FRAMES_PER_DRONE

  return frames[slot * FRAME_FIELDS + field]
}

// ── Write interpolated frame to droneStore ────────────────────────────────

function writeInterpolatedFrame(
  droneId:    string,
  frames:     Float32Array,
  cursor:     number,
  total:      number,
  frameCount: number,
  alpha:      number,   // blend [0, 1) between floor and ceil
  floorIdx:   number,
): void {
  const ceilIdx = Math.min(floorIdx + 1, frameCount - 1)

  function r(field: number, idx: number) {
    return readField(frames, cursor, total, idx, field)
  }

  const fLat  = r(F.LAT,  floorIdx); const cLat  = r(F.LAT,  ceilIdx)
  const fLng  = r(F.LNG,  floorIdx); const cLng  = r(F.LNG,  ceilIdx)
  const fAlt  = r(F.ALT,  floorIdx); const cAlt  = r(F.ALT,  ceilIdx)
  const fRoll = r(F.ROLL, floorIdx); const cRoll = r(F.ROLL, ceilIdx)
  const fPit  = r(F.PITCH,floorIdx); const cPit  = r(F.PITCH,ceilIdx)
  const fYaw  = r(F.YAW,  floorIdx); const cYaw  = r(F.YAW,  ceilIdx)

  useDroneStore.getState().updateDrone(droneId, {
    lat:         lerp(fLat,  cLat,  alpha),
    lng:         lerp(fLng,  cLng,  alpha),
    altitude:    lerp(fAlt,  cAlt,  alpha),
    roll:        lerp(fRoll, cRoll, alpha),
    pitch:       lerp(fPit,  cPit,  alpha),
    yaw:         lerpAngle(fYaw, cYaw, alpha),
    airspeed:    lerp(r(F.AIRSPEED,    floorIdx), r(F.AIRSPEED,    ceilIdx), alpha),
    groundspeed: lerp(r(F.GROUNDSPEED, floorIdx), r(F.GROUNDSPEED, ceilIdx), alpha),
    battery:     lerp(r(F.BATTERY,     floorIdx), r(F.BATTERY,     ceilIdx), alpha),
  })
}

// ── Hook ──────────────────────────────────────────────────────────────────

export function useFlightReplay(): void {
  const rafRef        = useRef<number | undefined>(undefined)
  const lastTimeRef   = useRef<number>(0)
  /** Sub-frame accumulator in milliseconds of simulation time. */
  const accumRef      = useRef<number>(0)

  useEffect(() => {
    const store = useFlightRecorderStore.getState

    const tick = (wallTime: number) => {
      const s = store()
      if (s.replayState !== 'PLAYING') {
        lastTimeRef.current = 0
        accumRef.current    = 0
        return
      }

      // ── Compute simulation time delta ─────────────────────────────
      const wallDelta = lastTimeRef.current
        ? Math.min(wallTime - lastTimeRef.current, 100)   // cap at 100 ms
        : 0
      lastTimeRef.current = wallTime
      accumRef.current   += wallDelta * s.replaySpeed

      const framesToAdvance = accum_toFrames(accumRef.current)

      if (framesToAdvance > 0) {
        accumRef.current -= framesToAdvance * MS_PER_FRAME

        const targetIds = s.replayDroneId
          ? [s.replayDroneId]
          : Object.keys(s.recordings)

        // Determine max frame count across replayed drones
        let maxFrames = 0
        for (const id of targetIds) {
          const rec = s.recordings[id]
          if (!rec) continue
          const fc = Math.min(rec.total, MAX_FRAMES_PER_DRONE)
          if (fc > maxFrames) maxFrames = fc
        }

        if (maxFrames < 2) {
          console.warn('[Replay] maxFrames < 2 — stopping replay  maxFrames=%d  targetIds=%o  recordingKeys=%o',
            maxFrames, targetIds, Object.keys(s.recordings))
          for (const id of targetIds) {
            const rec = s.recordings[id]
            console.warn('[Replay]   drone=%s  rec=%s  total=%d', id, rec ? 'FOUND' : 'MISSING', rec?.total ?? 0)
          }
          s.stopReplay()
          return
        }

        const newIndex = s.replayIndex + framesToAdvance

        // Reached end → freeze on last frame and stop
        if (newIndex >= maxFrames - 1) {
          console.debug('[Replay] reached end  maxFrames=%d', maxFrames)
          for (const id of targetIds) {
            const rec = s.recordings[id]
            if (!rec) continue
            const fc = Math.min(rec.total, MAX_FRAMES_PER_DRONE)
            writeInterpolatedFrame(id, rec.frames, rec.cursor, rec.total, fc, 0, fc - 1)
          }
          s.setReplayIndex(maxFrames - 1)
          // Sync global trajectory so all renderers show the complete path
          useReplayTrajectoryStore.getState().syncToFrame(maxFrames - 1)
          s.stopReplay()
          return
        }

        const floorIdx = Math.floor(newIndex)
        const alpha    = newIndex - floorIdx

        for (const id of targetIds) {
          const rec = s.recordings[id]
          if (!rec) continue
          const fc = Math.min(rec.total, MAX_FRAMES_PER_DRONE)
          writeInterpolatedFrame(id, rec.frames, rec.cursor, rec.total, fc, alpha, floorIdx)
        }

        s.setReplayIndex(newIndex)
        // Keep global trajectory store in sync — all renderers derive
        // their "traveled" path from this, so switching views is lossless.
        useReplayTrajectoryStore.getState().syncToFrame(Math.floor(newIndex))
      }

      // Always reschedule — even when no frames were advanced this tick.
      // Bug fix: previously the reschedule was inside the framesToAdvance > 0
      // block, so the loop died silently whenever the accumulator hadn't yet
      // collected enough ms for a whole frame.
      rafRef.current = requestAnimationFrame(tick)
    }

    // Subscribe to replayState to start/stop the rAF loop
    const unsub = useFlightRecorderStore.subscribe((state, prev) => {
      const wasPlaying = prev.replayState === 'PLAYING'
      const isPlaying  = state.replayState === 'PLAYING'

      if (isPlaying && !wasPlaying) {
        console.debug('[Replay] rAF loop STARTED  droneId=%s', state.replayDroneId)
        lastTimeRef.current = 0
        accumRef.current    = 0
        rafRef.current = requestAnimationFrame(tick)
      } else if (!isPlaying && wasPlaying) {
        console.debug('[Replay] rAF loop STOPPED  state=%s', state.replayState)
        if (rafRef.current !== undefined) {
          cancelAnimationFrame(rafRef.current)
          rafRef.current = undefined
        }
      }
    })

    // Handle hot-reload: if already playing, start immediately
    if (store().replayState === 'PLAYING') {
      rafRef.current = requestAnimationFrame(tick)
    }

    return () => {
      unsub()
      if (rafRef.current !== undefined) {
        cancelAnimationFrame(rafRef.current)
        rafRef.current = undefined
      }
    }
  }, [])
}

/** Convert millisecond accumulator to whole frame count */
function accum_toFrames(accumMs: number): number {
  return Math.floor(accumMs / MS_PER_FRAME)
}
