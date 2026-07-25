import { isUsableLiveCameraPoint } from '../../../utils/liveMapRecentering'

export interface MapCameraPoint {
  readonly lat: number
  readonly lng: number
}

export interface FleetMemberPoint extends MapCameraPoint {
  readonly id: string
}

export type MapBounds = [[number, number], [number, number]]

export type AutoCenterTarget =
  | {
      readonly type: 'active-drone'
      readonly point: MapCameraPoint
    }
  | {
      readonly type: 'fleet'
      readonly bounds: MapBounds
    }
  | {
      readonly type: 'none'
    }

export interface ResolveAutoCenterTargetInput {
  readonly activePoint: MapCameraPoint | null
  readonly fleetBounds: MapBounds | null
}

export interface ResolveHumanPauseUntilMsInput {
  readonly humanInteractionAtMs: number
  readonly idleDelayMs: number
}

export interface IsAutoCenterPausedByHumanInput {
  readonly autoCenter: boolean
  readonly pauseUntilMs: number | null
  readonly nowMs: number
}

export interface ShouldRecaptureAfterHumanPauseInput extends IsAutoCenterPausedByHumanInput {
  readonly activePoint: MapCameraPoint | null
}

export interface ResolveProgrammaticCameraGuardMsInput {
  readonly durationMs: number
  readonly bufferMs: number
}

export interface ResolveProgrammaticCameraGuardUntilMsInput extends ResolveProgrammaticCameraGuardMsInput {
  readonly moveStartedAtMs: number
}

export function resolveHumanPauseUntilMs(input: ResolveHumanPauseUntilMsInput): number {
  return input.humanInteractionAtMs + input.idleDelayMs
}

export function isAutoCenterPaused(input: IsAutoCenterPausedByHumanInput): boolean {
  if (!input.autoCenter) return false
  if (input.pauseUntilMs === null) return false
  return input.nowMs < input.pauseUntilMs
}

export function isAutoCenterPausedByHuman(input: IsAutoCenterPausedByHumanInput): boolean {
  return isAutoCenterPaused(input)
}

export function resolveProgrammaticCameraGuardMs(input: ResolveProgrammaticCameraGuardMsInput): number {
  if (input.durationMs <= 0) return 0
  return Math.max(0, input.durationMs + input.bufferMs)
}

export function resolveProgrammaticCameraGuardUntilMs(input: ResolveProgrammaticCameraGuardUntilMsInput): number {
  return input.moveStartedAtMs + resolveProgrammaticCameraGuardMs({
    durationMs: input.durationMs,
    bufferMs: input.bufferMs,
  })
}

export function shouldRecaptureAfterHumanPause(input: ShouldRecaptureAfterHumanPauseInput): boolean {
  if (!input.autoCenter) return false
  if (input.pauseUntilMs === null) return false
  if (input.nowMs < input.pauseUntilMs) return false
  if (input.activePoint === null) return false
  return isUsableLiveCameraPoint(input.activePoint)
}

export function resolveAutoCenterTarget(input: ResolveAutoCenterTargetInput): AutoCenterTarget {
  if (input.activePoint !== null && isUsableLiveCameraPoint(input.activePoint)) {
    return {
      type: 'active-drone',
      point: input.activePoint,
    }
  }

  if (input.fleetBounds !== null) {
    return {
      type: 'fleet',
      bounds: input.fleetBounds,
    }
  }

  return {
    type: 'none',
  }
}

export function stableFleetMembershipKey(points: readonly FleetMemberPoint[]): string {
  return points
    .filter((point) => isUsableLiveCameraPoint(point))
    .map((point) => point.id)
    .sort()
    .join('|')
}
