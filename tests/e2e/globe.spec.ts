import { expect, test } from '@playwright/test';

// `imagery=offline` uses the bundled tiles and `catalog=fixture` a synthetic element set,
// so the test never touches the network and is deterministic in the sandbox and in CI.
const APP_URL = '/?imagery=offline&catalog=fixture&time=2026-09-01T12:00:00Z';

test('the globe renders and a satellite can be selected', async ({ page }) => {
  const pageErrors: string[] = [];
  page.on('pageerror', (err) => pageErrors.push(err.message));

  await page.goto(APP_URL);

  await expect(page.getByTestId('globe')).toHaveAttribute('data-ready', 'true');
  await expect(page.getByText('SatLoc', { exact: true })).toBeVisible();
  await expect(page.getByTestId('sim-time')).toContainText('2026-09-01 12:00');
  await expect(page.getByText('Offline imagery')).toBeVisible();

  // Fixture satellite is listed; selecting it opens the live details panel.
  const item = page.getByTestId('satlist').getByRole('button', { name: /EROS-LIKE/ });
  await expect(item).toBeVisible();
  await item.click();
  await expect(page.getByTestId('details')).toBeVisible();
  await expect(page.getByTestId('altitude')).toContainText(/\d{3}\.\d km/);
  await expect(page.getByRole('button', { name: 'Orbit' })).toHaveClass(/btn--on/);

  // Camera tracking moves the camera; the app must keep running afterwards.
  await page.getByRole('button', { name: 'Track', exact: true }).click();
  await page.waitForTimeout(1500);
  await page.screenshot({ path: 'test-results/globe-tracking.png' });
  await page.getByRole('button', { name: 'Track', exact: true }).click();

  // Time controls: speed presets and pause are reflected in the clock read-out.
  await page.getByLabel('Simulation speed').selectOption('60');
  await expect(page.getByTestId('sim-time')).toContainText('60x');
  await page.getByRole('button', { name: 'Pause' }).click();
  await expect(page.getByTestId('sim-time')).toContainText('paused');
  await page.getByRole('button', { name: 'Play' }).click();
  await expect(page.getByTestId('sim-time')).toContainText('60x');

  await page.waitForTimeout(500);
  await page.screenshot({ path: 'test-results/globe.png' });

  expect(pageErrors).toEqual([]);
});
