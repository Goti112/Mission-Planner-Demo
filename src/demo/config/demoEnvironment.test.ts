import { describe, expect, it } from 'vitest';
import { DemoEnvironmentError, readDemoEnvironment } from './demoEnvironment';

describe('readDemoEnvironment', () => {
  it('returns trimmed required client tokens', () => {
    expect(readDemoEnvironment({
      VITE_MAPBOX_TOKEN: ' mapbox-token ',
      VITE_CESIUM_ION_TOKEN: ' cesium-token ',
    })).toEqual({
      mapboxToken: 'mapbox-token',
      cesiumIonToken: 'cesium-token',
    });
  });

  it.each(['VITE_MAPBOX_TOKEN', 'VITE_CESIUM_ION_TOKEN'] as const)(
    'raises an actionable error when %s is blank',
    (missingKey) => {
      const input = {
        VITE_MAPBOX_TOKEN: 'mapbox-token',
        VITE_CESIUM_ION_TOKEN: 'cesium-token',
        [missingKey]: ' ',
      };
      expect(() => readDemoEnvironment(input)).toThrow(DemoEnvironmentError);
      expect(() => readDemoEnvironment(input)).toThrow(`${missingKey} is required`);
    },
  );
});
