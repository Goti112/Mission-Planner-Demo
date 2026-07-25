import { describe, expect, it } from 'vitest'
import { resolvePublicAssetUrl } from './publicAssetUrl'

describe('resolvePublicAssetUrl', () => {
  it('keeps public assets root-relative in Vite development', () => {
    expect(resolvePublicAssetUrl('/', 'Logo.svg')).toBe('/Logo.svg')
    expect(resolvePublicAssetUrl('/', 'assets/drone.glb')).toBe('/assets/drone.glb')
  })

  it('keeps public assets document-relative in packaged Electron', () => {
    expect(resolvePublicAssetUrl('./', 'Logo.svg')).toBe('./Logo.svg')
    expect(resolvePublicAssetUrl('./', 'assets/aircraft-marker.png'))
      .toBe('./assets/aircraft-marker.png')
  })

  it('rejects absolute and empty asset paths', () => {
    expect(() => resolvePublicAssetUrl('./', '/Logo.svg'))
      .toThrow('Public asset path must be relative')
    expect(() => resolvePublicAssetUrl('./', '   '))
      .toThrow('Public asset path cannot be empty')
  })
})
