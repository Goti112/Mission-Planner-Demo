import { describe, expect, it } from 'vitest';
import { DemoEnvironmentError, readDemoEnvironment } from './demoEnvironment';

describe('readDemoEnvironment', () => {
  it('returns trimmed required client tokens', () => {
    expect(readDemoEnvironment({
      VITE_MAPBOX_TOKEN: ' pk.mapbox-token ',
      VITE_CESIUM_ION_TOKEN: ' cesium-token ',
    })).toEqual({
      mapboxToken: 'pk.mapbox-token',
      cesiumIonToken: 'cesium-token',
    });
  });

  it.each(['sk.secret-token', 'mapbox-token'])(
    'rejects non-public Mapbox browser token %s',
    (mapboxToken) => {
      const readEnvironment = (): ReturnType<typeof readDemoEnvironment> => readDemoEnvironment({
        VITE_MAPBOX_TOKEN: mapboxToken,
        VITE_CESIUM_ION_TOKEN: 'cesium-token',
      });

      expect(readEnvironment).toThrow(DemoEnvironmentError);
      expect(readEnvironment).toThrow(
        'VITE_MAPBOX_TOKEN must be a public client token beginning with pk.',
      );
    },
  );

  it.each(['VITE_MAPBOX_TOKEN', 'VITE_CESIUM_ION_TOKEN'] as const)(
    'raises an actionable error when %s is blank',
    (missingKey) => {
      const input = {
        VITE_MAPBOX_TOKEN: 'pk.mapbox-token',
        VITE_CESIUM_ION_TOKEN: 'cesium-token',
        [missingKey]: ' ',
      };
      expect(() => readDemoEnvironment(input)).toThrow(DemoEnvironmentError);
      expect(() => readDemoEnvironment(input)).toThrow(`${missingKey} is required`);
    },
  );
});
