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
    // Browser dev mode only: same-origin proxy so CelesTrak requests avoid CORS.
    proxy: {
      '/api/celestrak': {
        target: 'https://celestrak.org',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/celestrak/, ''),
      },
    },
  },
  envPrefix: ['VITE_', 'TAURI_ENV_*'],
  build: {
    // WebView2 on Windows, WKWebView on macOS 12+ / Android WebView elsewhere.
    target: platform === 'windows' ? 'chrome105' : platform ? 'safari15' : 'es2022',
    chunkSizeWarningLimit: 8000,
  },
  // satellite.js 7 ships a WASM bulk propagator whose worker uses top-level await,
  // which only module workers support.
  worker: { format: 'es' },
});
