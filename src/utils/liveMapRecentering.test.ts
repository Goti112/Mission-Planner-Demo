import { describe, expect, it } from 'vitest'

import {
  isUsableLiveCameraPoint,
  shouldRecenterOnLiveFix,
} from './liveMapRecentering'

describe('liveMapRecentering', () => {
  it('does not treat the live pre-GPS null-island placeholder as a camera target', () => {
    expect(isUsableLiveCameraPoint({ lat: 0, lng: 0 })).toBe(false)
  })

  it('keeps finite non-placeholder GPS fixes usable as camera targets', () => {
    expect(isUsableLiveCameraPoint({ lat: 40.4168, lng: -3.7038 })).toBe(true)
  })

  it('does not recenter to the live pre-GPS null-island placeholder', () => {
    expect(
      shouldRecenterOnLiveFix(
        { lat: 40.4168, lng: -3.7038 },
        { lat: 0, lng: 0 },
      ),
    ).toBe(false)
  })
})
