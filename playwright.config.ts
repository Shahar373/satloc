import { existsSync } from 'node:fs';
import { defineConfig } from '@playwright/test';

// The remote dev sandbox ships a Chromium build at /opt/pw-browsers/chromium.
// CI installs its own via `npx playwright install chromium`.
const sandboxChromium = '/opt/pw-browsers/chromium';
const executablePath =
  process.env.PW_CHROMIUM_PATH ?? (existsSync(sandboxChromium) ? sandboxChromium : undefined);

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 180_000,
  expect: { timeout: 120_000 },
  retries: 0,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:4173',
    viewport: { width: 1280, height: 800 },
    launchOptions: {
      executablePath,
      // Software WebGL so the globe renders on headless runners without a GPU.
      args: [
        '--use-gl=angle',
        '--use-angle=swiftshader',
        '--enable-unsafe-swiftshader',
        '--ignore-gpu-blocklist',
      ],
    },
  },
  webServer: {
    command: 'npm run preview -- --port 4173 --strictPort',
    url: 'http://localhost:4173',
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
