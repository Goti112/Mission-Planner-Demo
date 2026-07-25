import { describe, expect, it } from 'vitest'

import {
  isAutoCenterPausedByHuman,
  isAutoCenterPaused,
  resolveAutoCenterTarget,
  resolveHumanPauseUntilMs,
  resolveProgrammaticCameraGuardMs,
  resolveProgrammaticCameraGuardUntilMs,
  shouldRecaptureAfterHumanPause,
  stableFleetMembershipKey,
} from './mapCameraPolicy'

describe('mapCameraPolicy', () => {
  it('auto-center follows the active drone instead of changing zoom to fit the fleet', () => {
    const target = resolveAutoCenterTarget({
      activePoint: { lat: 40.4168, lng: -3.7038 },
      fleetBounds: [[-4, 40], [-3, 41]],
    })

    expect(target).toEqual({
      type: 'active-drone',
      point: { lat: 40.4168, lng: -3.7038 },
    })
  })

  it('falls back to fleet bounds only when there is no usable active drone point', () => {
    const fleetBounds: [[number, number], [number, number]] = [[-4, 40], [-3, 41]]
    const target = resolveAutoCenterTarget({
      activePoint: { lat: 0, lng: 0 },
      fleetBounds,
    })

    expect(target).toEqual({
      type: 'fleet',
      bounds: fleetBounds,
    })
  })

  it('uses drone ids instead of moving coordinates for fleet membership identity', () => {
    expect(
      stableFleetMembershipKey([
        { id: 'b', lat: 40.1, lng: -3.1 },
        { id: 'a', lat: 40.2, lng: -3.2 },
      ]),
    ).toBe(
      stableFleetMembershipKey([
        { id: 'a', lat: 41.2, lng: -4.2 },
        { id: 'b', lat: 41.1, lng: -4.1 },
      ]),
    )
  })

  it('keeps AutoCenter paused until the human idle delay expires', () => {
    expect(
      isAutoCenterPausedByHuman({
        autoCenter: true,
        pauseUntilMs: 3_500,
        nowMs: 3_499,
      }),
    ).toBe(true)

    expect(
      isAutoCenterPausedByHuman({
        autoCenter: true,
        pauseUntilMs: 3_500,
        nowMs: 3_500,
      }),
    ).toBe(false)
  })

  it('does not pause AutoCenter when AutoCenter is disabled', () => {
    expect(
      isAutoCenterPausedByHuman({
        autoCenter: false,
        pauseUntilMs: 3_500,
        nowMs: 3_000,
      }),
    ).toBe(false)
  })

  it('extends the human pause from the latest interaction time', () => {
    expect(
      resolveHumanPauseUntilMs({
        humanInteractionAtMs: 1_000,
        idleDelayMs: 2_500,
      }),
    ).toBe(3_500)

    expect(
      resolveHumanPauseUntilMs({
        humanInteractionAtMs: 2_000,
        idleDelayMs: 2_500,
      }),
    ).toBe(4_500)
  })

  it('keeps programmatic camera moves guarded through their animation buffer', () => {
    expect(
      resolveProgrammaticCameraGuardMs({
        durationMs: 0,
        bufferMs: 75,
      }),
    ).toBe(0)

    expect(
      resolveProgrammaticCameraGuardMs({
        durationMs: 850,
        bufferMs: 75,
      }),
    ).toBe(925)

    expect(
      resolveProgrammaticCameraGuardUntilMs({
        moveStartedAtMs: 3_500,
        durationMs: 850,
        bufferMs: 75,
      }),
    ).toBe(4_425)
  })

  it('keeps AutoCenter paused while a programmatic camera animation is still running', () => {
    const pauseUntilMs = resolveProgrammaticCameraGuardUntilMs({
      moveStartedAtMs: 3_500,
      durationMs: 850,
      bufferMs: 75,
    })

    expect(
      isAutoCenterPaused({
        autoCenter: true,
        pauseUntilMs,
        nowMs: 4_424,
      }),
    ).toBe(true)

    expect(
      isAutoCenterPaused({
        autoCenter: true,
        pauseUntilMs,
        nowMs: 4_425,
      }),
    ).toBe(false)
  })

  it('recaptures only after idle delay with a usable active drone point', () => {
    expect(
      shouldRecaptureAfterHumanPause({
        autoCenter: true,
        activePoint: { lat: 40.4168, lng: -3.7038 },
        pauseUntilMs: 3_500,
        nowMs: 3_499,
      }),
    ).toBe(false)

    expect(
      shouldRecaptureAfterHumanPause({
        autoCenter: true,
        activePoint: { lat: 40.4168, lng: -3.7038 },
        pauseUntilMs: 3_500,
        nowMs: 3_500,
      }),
    ).toBe(true)

    expect(
      shouldRecaptureAfterHumanPause({
        autoCenter: true,
        activePoint: { lat: 0, lng: 0 },
        pauseUntilMs: 3_500,
        nowMs: 3_500,
      }),
    ).toBe(false)
  })

  it('skips stale recapture when AutoCenter was disabled before idle expiry', () => {
    expect(
      shouldRecaptureAfterHumanPause({
        autoCenter: false,
        activePoint: { lat: 40.4168, lng: -3.7038 },
        pauseUntilMs: 3_500,
        nowMs: 3_500,
      }),
    ).toBe(false)
  })

})
