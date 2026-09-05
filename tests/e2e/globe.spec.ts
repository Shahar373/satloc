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

  // Overlays: footprint on by default; the fixture has no swath entry so no Swath button.
  await expect(page.getByRole('button', { name: 'Footprint' })).toHaveClass(/btn--on/);
  await expect(page.getByRole('button', { name: 'Swath' })).toHaveCount(0);

  // Camera modes move the camera; the app must keep running afterwards.
  await page.getByRole('button', { name: 'Track', exact: true }).click();
  await page.waitForTimeout(1500);
  await page.screenshot({ path: 'test-results/globe-tracking.png' });
  await page.getByRole('button', { name: 'Nadir' }).click();
  await page.waitForTimeout(1500);
  await page.screenshot({ path: 'test-results/globe-nadir.png' });
  await page.getByRole('button', { name: 'Nadir' }).click();

  // Catalogue: display the fixture constellation as points, then find one by name and select it.
  await page.getByTestId('catalog').getByRole('button', { name: 'groups' }).click();
  await page.getByTestId('groups').getByLabel(/Fixture constellation/).check();
  await expect(page.getByTestId('groups')).toContainText('300');
  await page.getByLabel('Search satellites').fill('FIX-042');
  await page.getByTestId('search-results').getByRole('button', { name: /FIX-042/ }).click();
  await expect(page.getByTestId('details')).toContainText('FIX-042');
  await expect(page.getByTestId('altitude')).toContainText(/\d{3,5}\.\d km/);
  await page.getByRole('button', { name: /pin/ }).click();
  await expect(page.getByRole('button', { name: /pinned/ })).toBeVisible();
  await page.waitForTimeout(1000);
  await page.screenshot({ path: 'test-results/globe-catalog.png' });
  // Back to the fixture satellite for the rest of the checks.
  await page.getByTestId('satlist').getByRole('button', { name: /EROS-LIKE/ }).click();
  await expect(page.getByTestId('details')).toContainText('EROS-LIKE');

  // Imaging opportunities over the default target (Tel Aviv): add a second target by coordinates,
  // list opportunities, jump to one (imaging camera looks at the target from the satellite).
  await page.getByLabel('Target coordinates').fill('31.77, 35.21');
  await page.getByTestId('imaging').getByRole('button', { name: 'Add', exact: true }).click();
  await expect(page.getByTestId('target-list')).toContainText('Target 2');
  const opportunities = page.getByTestId('opportunity-list').getByRole('button');
  await expect(opportunities.first()).toBeVisible();
  await expect(opportunities.first()).toContainText(/roll \d+\.\d°/);
  await opportunities.first().click();
  await expect(page.getByRole('button', { name: 'Imaging view' })).toHaveClass(/btn--on/);
  await page.waitForTimeout(1500);
  await expect(page.locator('.cesium-widget-errorPanel')).toHaveCount(0);
  await page.screenshot({ path: 'test-results/globe-imaging.png' });
  await page.getByRole('button', { name: 'Imaging view' }).click();
  await page.getByRole('button', { name: /Remove Target 2/ }).click();
  await expect(page.getByTestId('target-list')).not.toContainText('Target 2');

  // Pass prediction over the default observer (Tel Aviv); jumping to a pass moves the clock.
  const passes = page.getByTestId('pass-list').getByRole('button');
  await expect(passes.first()).toBeVisible();
  const firstPassText = (await passes.first().textContent()) ?? '';
  const aosMatch = /(\d{2}-\d{2} \d{2}:\d{2}) UTC/.exec(firstPassText);
  expect(aosMatch).not.toBeNull();
  await passes.first().click();
  await expect(page.getByTestId('sim-time')).toContainText(`2026-${aosMatch![1]!.slice(0, 5)}`);

  // Settings dialog opens, shows the resolved imagery, and closes.
  await page.getByRole('button', { name: 'Settings' }).click();
  await expect(page.getByTestId('settings')).toContainText('Currently showing: offline');
  await page.getByTestId('settings').getByRole('button', { name: 'Close' }).click();
  await expect(page.getByTestId('settings')).toHaveCount(0);
  await page.getByRole('button', { name: 'Home view' }).click();

  // Time controls: speed presets and pause are reflected in the clock read-out.
  await page.getByLabel('Simulation speed').selectOption('60');
  await expect(page.getByTestId('sim-time')).toContainText('60x');
  await page.getByRole('button', { name: 'Pause' }).click();
  await expect(page.getByTestId('sim-time')).toContainText('paused');
  await page.getByRole('button', { name: 'Play' }).click();
  await expect(page.getByTestId('sim-time')).toContainText('60x');

  await page.waitForTimeout(500);
  await page.screenshot({ path: 'test-results/globe.png' });

  // Cesium reports render errors in its own panel instead of throwing; make sure none appeared.
  await expect(page.locator('.cesium-widget-errorPanel')).toHaveCount(0);
  expect(pageErrors).toEqual([]);
});
