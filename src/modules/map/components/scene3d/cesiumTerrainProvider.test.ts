import * as Cesium from 'cesium'
import { describe, expect, it } from 'vitest'
import { loadCesiumTerrainProvider } from './cesiumTerrainProvider'

describe('loadCesiumTerrainProvider', () => {
  it('returns Ion terrain when the configured request succeeds', async () => {
    const fallback = new Cesium.EllipsoidTerrainProvider()
    const ionTerrain = new Cesium.EllipsoidTerrainProvider()
    const failures: unknown[] = []

    const result = await loadCesiumTerrainProvider({
      token: 'configured-token',
      fallback,
      loadIonTerrain: async () => ionTerrain,
      reportFailure: (error: unknown): void => { failures.push(error) },
    })

    expect(result).toBe(ionTerrain)
    expect(failures).toEqual([])
  })

  it('returns ellipsoid terrain and reports rejected Ion requests', async () => {
    const fallback = new Cesium.EllipsoidTerrainProvider()
    const failure = { statusCode: 401, response: '{"code":"INVALID_TOKEN"}' }
    const failures: unknown[] = []

    const result = await loadCesiumTerrainProvider({
      token: 'invalid-token',
      fallback,
      loadIonTerrain: async () => { throw failure },
      reportFailure: (error: unknown): void => { failures.push(error) },
    })

    expect(result).toBe(fallback)
    expect(failures).toEqual([failure])
  })

  it('does not contact Ion when a runtime token is unavailable', async () => {
    const fallback = new Cesium.EllipsoidTerrainProvider()
    let loadAttempts = 0

    const result = await loadCesiumTerrainProvider({
      token: null,
      fallback,
      loadIonTerrain: async () => {
        loadAttempts += 1
        return new Cesium.EllipsoidTerrainProvider()
      },
      reportFailure: (): void => {},
    })

    expect(result).toBe(fallback)
    expect(loadAttempts).toBe(0)
  })
})
