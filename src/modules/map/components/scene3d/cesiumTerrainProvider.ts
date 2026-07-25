import type * as Cesium from 'cesium'

export interface LoadCesiumTerrainProviderInput {
  token: string | null
  fallback: Cesium.TerrainProvider
  loadIonTerrain: () => Promise<Cesium.TerrainProvider>
  reportFailure: (error: unknown) => void
}

export const loadCesiumTerrainProvider = async (
  input: LoadCesiumTerrainProviderInput,
): Promise<Cesium.TerrainProvider> => {
  if (input.token === null) return input.fallback

  try {
    return await input.loadIonTerrain()
  } catch (error: unknown) {
    input.reportFailure(error)
    return input.fallback
  }
}
