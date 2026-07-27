import { defineConfig, devices } from '@playwright/test';
import { readDemoEnvironment } from './src/demo/config/demoEnvironment';

const environment = readDemoEnvironment({
  VITE_MAPBOX_TOKEN: process.env.VITE_MAPBOX_TOKEN,
  VITE_CESIUM_ION_TOKEN: process.env.VITE_CESIUM_ION_TOKEN,
});

export default defineConfig({
  testDir: './tests',
  use: {
    baseURL: 'http://127.0.0.1:4173',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: devices['Desktop Chrome'],
    },
  ],
  webServer: {
    command: 'npm run dev -- --host 127.0.0.1 --port 4173',
    env: {
      VITE_MAPBOX_TOKEN: environment.mapboxToken,
      VITE_CESIUM_ION_TOKEN: environment.cesiumIonToken,
    },
    url: 'http://127.0.0.1:4173',
  },
});
