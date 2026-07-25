import { afterEach, describe, expect, it, vi } from 'vitest';
import { DemoEnvironmentError } from '../demo/config/demoEnvironment';
import { getCesiumImageryProvider } from './cesiumImagery';

describe('getCesiumImageryProvider', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('raises a configuration error when the Mapbox token is blank', () => {
    vi.stubEnv('VITE_MAPBOX_TOKEN', ' ');
    vi.stubEnv('VITE_CESIUM_ION_TOKEN', 'cesium-token');

    expect(() => getCesiumImageryProvider('streets')).toThrow(DemoEnvironmentError);
  });
});
