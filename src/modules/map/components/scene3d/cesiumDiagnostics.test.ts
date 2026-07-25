import { describe, expect, it } from 'vitest'
import {
  createCesiumDiagnostic,
  resolveCesiumIonToken,
  serializeCesiumError,
} from './cesiumDiagnostics'

describe('cesiumDiagnostics', () => {
  it('trims a configured Ion token', () => {
    expect(resolveCesiumIonToken('  abc123  ')).toBe('abc123')
  })

  it('returns null for an empty Ion token', () => {
    expect(resolveCesiumIonToken('   ')).toBeNull()
  })

  it('serializes errors with useful context', () => {
    const result = serializeCesiumError(new Error('terrain failed'))

    expect(result.name).toBe('Error')
    expect(result.message).toBe('terrain failed')
  })

  it('serializes Cesium HTTP request failures without object placeholders', () => {
    const result = serializeCesiumError({
      statusCode: 401,
      response: '{"code":"INVALID_TOKEN","message":"Invalid access token"}',
    })

    expect(result.name).toBe('CesiumRequestError')
    expect(result.message).toContain('HTTP 401')
    expect(result.message).toContain('Invalid access token')
  })

  it('builds structured diagnostic records', () => {
    const diagnostic = createCesiumDiagnostic({
      level: 'warning',
      code: 'terrain-sampling-failed',
      message: 'Terrain sampling failed',
      context: { droneId: 'drone-1', lat: 40.4, lng: -3.7 },
      error: new Error('network'),
    })

    expect(diagnostic.level).toBe('warning')
    expect(diagnostic.code).toBe('terrain-sampling-failed')
    expect(diagnostic.context).toEqual({ droneId: 'drone-1', lat: 40.4, lng: -3.7 })
    expect(diagnostic.error?.message).toBe('network')
  })
})
