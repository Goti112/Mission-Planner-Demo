/**
 * cesiumImagery.ts
 *
 * Provides a Cesium ImageryProvider for each map style so that the 3D globe
 * always matches the visual style selected in the 2D Mapbox view.
 *
 * All four styles are served as raster tiles from the Mapbox Styles API, which
 * means no extra dependencies and the same tile source as Mapbox GL JS 2D.
 */

import * as Cesium from 'cesium';
import { readDemoEnvironment } from '../demo/config/demoEnvironment';
import type { MapStyle } from '../shared/store/uiStore';

/** Mapbox style IDs mapped to each MapStyle value. */
const MAPBOX_STYLE_IDS: Record<MapStyle, string> = {
  streets:   'mapbox/streets-v12',
  satellite: 'mapbox/satellite-v9',
  hybrid:    'mapbox/satellite-streets-v12',
  dark:      'mapbox/dark-v11',
};

/**
 * Returns a synchronous Cesium ImageryProvider for the given map style.
 *
 * Uses Mapbox Raster Tiles (Styles API, 256 px tiles, Web Mercator projection)
 * for visual consistency with the 2D Mapbox map.
 *
 * Usage — swap imagery on an existing Cesium viewer:
 *   viewer.imageryLayers.removeAll();
 *   viewer.imageryLayers.addImageryProvider(getCesiumImageryProvider(style));
 */
export function getCesiumImageryProvider(style: MapStyle): Cesium.ImageryProvider {
  const environment = readDemoEnvironment({
    VITE_MAPBOX_TOKEN: import.meta.env.VITE_MAPBOX_TOKEN,
    VITE_CESIUM_ION_TOKEN: import.meta.env.VITE_CESIUM_ION_TOKEN,
  });
  const styleId = MAPBOX_STYLE_IDS[style];
  return new Cesium.UrlTemplateImageryProvider({
    url: `https://api.mapbox.com/styles/v1/${styleId}/tiles/256/{z}/{x}/{y}?access_token=${environment.mapboxToken}`,
    tileWidth: 256,
    tileHeight: 256,
    maximumLevel: 22,
    tilingScheme: new Cesium.WebMercatorTilingScheme(),
    credit: new Cesium.Credit('© Mapbox © OpenStreetMap'),
  });
}
