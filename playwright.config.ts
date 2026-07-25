import { defineConfig, devices } from '@playwright/test';

const readRequiredEnvironmentVariable = (name: string): string => {
  const value = process.env[name];

  if (value === undefined || value.trim().length === 0) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
};

const mapboxToken = readRequiredEnvironmentVariable('VITE_MAPBOX_TOKEN');
const cesiumIonToken = readRequiredEnvironmentVariable('VITE_CESIUM_ION_TOKEN');

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
      VITE_MAPBOX_TOKEN: mapboxToken,
      VITE_CESIUM_ION_TOKEN: cesiumIonToken,
    },
    url: 'http://127.0.0.1:4173',
  },
});
