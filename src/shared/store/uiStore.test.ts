import { beforeEach, describe, expect, it } from 'vitest'

import { useUIStore } from './uiStore'

describe('uiStore AutoCenter state', () => {
  beforeEach(() => {
    useUIStore.setState({
      autoCenter: false,
      cameraMode: 'FREE',
      autoCenterPauseUntilMs: null,
    })
  })

  it('keeps 2D AutoCenter and 3D camera mode synchronized when toggled through AutoCenter', () => {
    useUIStore.getState().setAutoCenter(true)

    expect(useUIStore.getState().autoCenter).toBe(true)
    expect(useUIStore.getState().cameraMode).toBe('AUTO_CENTER')

    useUIStore.getState().setAutoCenter(false)

    expect(useUIStore.getState().autoCenter).toBe(false)
    expect(useUIStore.getState().cameraMode).toBe('FREE')
  })

  it('clears stale AutoCenter pauses when changing the global camera mode', () => {
    useUIStore.getState().setAutoCenterPauseUntilMs(3_500)

    useUIStore.getState().setCameraMode('AUTO_CENTER')

    expect(useUIStore.getState().autoCenter).toBe(true)
    expect(useUIStore.getState().autoCenterPauseUntilMs).toBeNull()

    useUIStore.getState().setAutoCenterPauseUntilMs(4_500)

    useUIStore.getState().setCameraMode('FREE')

    expect(useUIStore.getState().autoCenter).toBe(false)
    expect(useUIStore.getState().autoCenterPauseUntilMs).toBeNull()
  })

  it('shares the AutoCenter pause timestamp without changing the selected mode', () => {
    useUIStore.getState().setCameraMode('AUTO_CENTER')

    useUIStore.getState().setAutoCenterPauseUntilMs(5_000)

    expect(useUIStore.getState().autoCenter).toBe(true)
    expect(useUIStore.getState().cameraMode).toBe('AUTO_CENTER')
    expect(useUIStore.getState().autoCenterPauseUntilMs).toBe(5_000)
  })
})
