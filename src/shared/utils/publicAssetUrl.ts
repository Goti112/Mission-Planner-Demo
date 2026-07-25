const normalizeBaseUrl = (baseUrl: string): string => {
  if (baseUrl.length === 0) {
    throw new TypeError('Public asset base URL cannot be empty')
  }
  return baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`
}

export const resolvePublicAssetUrl = (baseUrl: string, assetPath: string): string => {
  const normalizedPath = assetPath.trim()
  if (normalizedPath.length === 0) {
    throw new TypeError('Public asset path cannot be empty')
  }
  if (normalizedPath.startsWith('/')) {
    throw new TypeError(`Public asset path must be relative: ${normalizedPath}`)
  }
  return `${normalizeBaseUrl(baseUrl)}${normalizedPath}`
}

export const PUBLIC_ASSET_URLS = Object.freeze({
  logo: resolvePublicAssetUrl(import.meta.env.BASE_URL, 'Logo.svg'),
  aircraftMarker: resolvePublicAssetUrl(import.meta.env.BASE_URL, 'assets/aircraft-marker.png'),
  droneModel: resolvePublicAssetUrl(import.meta.env.BASE_URL, 'assets/drone.glb'),
})
