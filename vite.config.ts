import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// TAURI_DEV_HOST is set by `tauri dev` when targeting a physical device (Android).
const host = process.env.TAURI_DEV_HOST;
const platform = process.env.TAURI_ENV_PLATFORM;

export default defineConfig({
  plugins: [react()],
  // Relative base so the same bundle works under http://tauri.localhost (Windows),
  // tauri://localhost (macOS/Linux) and plain static hosting.
  base: './',
  clearScreen: false,
  server: {
    port: 5173,
    strictPort: true,
    host: host || false,
    hmr: host ? { protocol: 'ws', host, port: 5174 } : undefined,
    watch: { ignored: ['**/src-tauri/**'] },
  },
  envPrefix: ['VITE_', 'TAURI_ENV_*'],
  build: {
    target: platform === 'windows' ? 'chrome105' : platform ? 'safari13' : 'es2022',
    chunkSizeWarningLimit: 8000,
  },
});
