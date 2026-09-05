import http from 'node:http';
import { readFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { expect, test } from '@playwright/test';

/**
 * Tauri applies the Content Security Policy from tauri.conf.json to the bundled app. Browsers in
 * the other tests run without it, so this test serves the production build with that exact policy
 * and checks that the app still boots. (Cesium's widgets need 'unsafe-eval', satellite.js needs
 * 'wasm-unsafe-eval'; a stricter policy shows a blank window.)
 */
const PORT = 4175;
const TYPES: Record<string, string> = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.wasm': 'application/wasm',
  '.xml': 'application/xml',
};

let server: http.Server;

test.beforeAll(async () => {
  const tauriConf = JSON.parse(readFileSync(join(process.cwd(), 'src-tauri', 'tauri.conf.json'), 'utf8')) as {
    app: { security: { csp: string } };
  };
  const csp = tauriConf.app.security.csp;
  const root = join(process.cwd(), 'dist');
  server = http.createServer(async (req, res) => {
    let path = decodeURIComponent(new URL(req.url ?? '/', 'http://x').pathname);
    if (path === '/') path = '/index.html';
    try {
      const data = await readFile(join(root, normalize(path)));
      res.writeHead(200, {
        'content-type': TYPES[extname(path)] ?? 'application/octet-stream',
        'content-security-policy': csp,
      });
      res.end(data);
    } catch {
      res.writeHead(404);
      res.end('not found');
    }
  });
  await new Promise<void>((resolve) => server.listen(PORT, resolve));
});

test.afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

test('the app boots under the Tauri Content Security Policy', async ({ page }) => {
  const violations: string[] = [];
  page.on('pageerror', (err) => violations.push(err.message));
  page.on('console', (msg) => {
    if (msg.type() === 'error' && /Content Security Policy/.test(msg.text())) violations.push(msg.text());
  });

  await page.goto(`http://localhost:${PORT}/?imagery=offline&catalog=fixture`);
  await expect(page.getByTestId('globe')).toHaveAttribute('data-ready', 'true');
  await expect(page.getByText('SatLoc', { exact: true })).toBeVisible();
  await expect(page.locator('#boot')).toHaveCount(0);
  expect(violations).toEqual([]);
});
