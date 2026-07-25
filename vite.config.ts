import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import checker from 'vite-plugin-checker';
import { viteStaticCopy } from 'vite-plugin-static-copy';
import path from 'path';

export default defineConfig({
  base: './',
  plugins: [
    react(),
    checker({
      typescript: true,
    }),
    viteStaticCopy({
      targets: [
        {
          src: 'node_modules/cesium/Build/Cesium/**/*',
          dest: 'cesium' // copies to public/cesium (dev) and dist/cesium (build)
        }
      ]
    })
  ],
  define: {
    CESIUM_BASE_URL: JSON.stringify('./cesium/')
  },
  publicDir: 'public',
  build: {
    outDir: 'dist',
  },
  server: {
    fs: {
      allow: [
        path.resolve(__dirname, 'node_modules/cesium/Build/Cesium'),
        __dirname
      ]
    }
  },
  optimizeDeps: {
    // Force pre-bundling of legacy CJS packages that lack an `exports` field
    include: ['utm', 'mgrs'],
  },
  test: {
    environment: 'jsdom',
    globals: true,
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
  },
});
