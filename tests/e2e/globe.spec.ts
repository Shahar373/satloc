import { expect, test } from '@playwright/test';

test('the globe renders with the bundled offline imagery', async ({ page }) => {
  const pageErrors: string[] = [];
  page.on('pageerror', (err) => pageErrors.push(err.message));

  // `imagery=offline` forces the bundled Natural Earth II tiles so the test never touches the network.
  await page.goto('/?imagery=offline');

  await expect(page.getByTestId('globe')).toHaveAttribute('data-ready', 'true');
  await expect(page.getByText('SatLoc', { exact: true })).toBeVisible();
  await expect(page.getByTestId('sim-time')).toContainText('UTC');
  await expect(page.getByText('Offline imagery')).toBeVisible();

  // Give lighting and atmosphere a couple of frames before the screenshot.
  await page.waitForTimeout(1500);
  await page.screenshot({ path: 'test-results/globe.png' });

  expect(pageErrors).toEqual([]);
});
