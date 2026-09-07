import { expect, test } from '@playwright/test';

// `imagery=offline` uses the bundled tiles and `catalog=fixture` a synthetic element set, so the
// test never touches the network and is deterministic in the sandbox and in CI. Shell V2 is the
// default (no `shell=` param needed) — see main.tsx.
const APP_URL = '/?imagery=offline&catalog=fixture&time=2026-09-01T12:00:00Z';

test('the default route boots Shell V2 with the real globe and a selectable catalog', async ({ page }) => {
  const pageErrors: string[] = [];
  page.on('pageerror', (err) => pageErrors.push(err.message));

  await page.goto(APP_URL);

  await expect(page.locator('.sl-v2')).toBeVisible();
  await expect(page.getByTestId('globe')).toHaveAttribute('data-ready', 'true');
  await expect(page.getByText('SatLoc', { exact: true })).toBeVisible();

  const row = page.locator('.sl-dock__row', { hasText: 'EROS-LIKE' });
  await expect(row).toBeVisible();
  await row.click();
  await expect(page.locator('.sl-inspector__title')).toContainText('EROS-LIKE');
  await expect(page.locator('.sl-inspector')).toContainText(/\d+\.\d km/);

  expect(pageErrors).toEqual([]);
});

test('the command palette finds a satellite by name and selects it', async ({ page }) => {
  await page.goto(APP_URL);
  await expect(page.getByTestId('globe')).toHaveAttribute('data-ready', 'true');

  await page.locator('.sl-topbar__cmdk').click();
  await expect(page.locator('.sl-palette')).toBeVisible();
  await page.locator('.sl-palette__input').fill('EROS');
  const result = page.locator('.sl-palette__result', { hasText: 'EROS-LIKE' });
  await expect(result).toBeVisible();
  await result.click();

  await expect(page.locator('.sl-palette')).toHaveCount(0);
  await expect(page.locator('.sl-inspector__title')).toContainText('EROS-LIKE');
});

test('the language toggle switches to Hebrew and mirrors the layout', async ({ page }) => {
  await page.goto(APP_URL);
  await expect(page.getByTestId('globe')).toHaveAttribute('data-ready', 'true');

  await expect(page.locator('.sl-v2')).toHaveAttribute('dir', 'ltr');
  await page.locator('.sl-topbar__lang').click();
  await expect(page.locator('.sl-v2')).toHaveAttribute('dir', 'rtl');
  await expect(page.locator('.sl-v2')).toHaveAttribute('lang', 'he');

  // The Rail's grid column mirrors to the far side under RTL, same technique the Dock/Inspector
  // use — a real pixel check, not just that the CSS looks logically correct.
  const railBox = await page.locator('.sl-rail').boundingBox();
  const inspectorBox = await page.locator('.sl-inspector').boundingBox();
  expect(railBox?.x ?? 0).toBeGreaterThan(inspectorBox?.x ?? 0);
});

test('the Plan workspace lets an operator build a draft plan from real imaging opportunities', async ({ page }) => {
  await page.goto(APP_URL);
  await expect(page.getByTestId('globe')).toHaveAttribute('data-ready', 'true');

  await page.getByRole('button', { name: /plan/i }).first().click();
  await expect(page.locator('.sl-plan')).toBeVisible();

  const rows = page.locator('.sl-plan__list-surface .sl-plan__row');
  await expect(rows.first()).toBeVisible();

  // The draft starts empty; adding a clean (nominal) opportunity moves it into the draft surface
  // and the running storage total (evaluatePlanDraft's real accumulation) reflects it.
  await expect(page.locator('.sl-plan__draft-surface .sl-plan__empty')).toBeVisible();
  const nominalRow = rows.filter({ has: page.locator('.sl-pill--nominal') }).first();
  await nominalRow.getByRole('button', { name: /add to plan/i }).click();

  const draftRows = page.locator('.sl-plan__draft-surface .sl-plan__row');
  await expect(draftRows).toHaveCount(1);
  await expect(page.locator('.sl-plan__draft-storage')).toHaveText('1.2 / 6.0 GB');
  await expect(draftRows.first().locator('.sl-plan__row-seq')).toContainText('#1');

  // Removing it from the draft (either the browse row's toggle or the draft row's own button)
  // clears the draft back to empty and the storage total resets.
  await draftRows
    .first()
    .getByRole('button', { name: /remove/i })
    .click();
  await expect(page.locator('.sl-plan__draft-surface .sl-plan__empty')).toBeVisible();
});

test('the Debrief workspace replays the real Scenario 01 run and flags where Observables lag Truth', async ({
  page,
}) => {
  await page.goto(APP_URL);
  await expect(page.getByTestId('globe')).toHaveAttribute('data-ready', 'true');

  await page
    .getByRole('button', { name: /debrief/i })
    .first()
    .click();
  await expect(page.locator('.sl-debrief')).toBeVisible();

  const rows = page.locator('.sl-debrief__list .sl-debrief__row');
  // The real demo timeline (buildRealDemoTimeline) always produces this exact 8-event story for
  // Scenario 01: capture, store, complete, acquire contact, start downlink, complete it, complete
  // the task, lose contact.
  await expect(rows).toHaveCount(8);

  // Exactly the ContactAcquired@1 and the TaskStarted@1 right after it (same simTime) show Truth
  // with an active contact that Operator Observables hasn't confirmed yet — the real acquisitionS
  // lock-on lag docs/design/operator-simulation.md documents. Both clear by DownlinkCompleted@1.
  await expect(page.locator('.sl-debrief__row .sl-pill--warning')).toHaveCount(2);
  await expect(rows.filter({ hasText: 'Contact acquired' })).toContainText('Lag');
  await expect(rows.filter({ hasText: 'Downlink completed' })).not.toContainText('Lag');
});

test.describe("at 900x600 (the mandate's narrow mandatory resolution)", () => {
  test.use({ viewport: { width: 900, height: 600 } });

  test('the Rail and Inspector collapse into on-demand drawers', async ({ page }) => {
    await page.goto(APP_URL);
    await expect(page.getByTestId('globe')).toHaveAttribute('data-ready', 'true');

    await expect(page.locator('.sl-topbar__menu')).toBeVisible();
    const railBoxClosed = await page.locator('.sl-rail').boundingBox();
    expect(railBoxClosed?.x).toBeLessThan(0);

    await page.locator('.sl-topbar__menu').click();
    // The drawer slides in over shell.css's 0.2s transition; poll rather than guess a fixed wait.
    await expect.poll(async () => (await page.locator('.sl-rail').boundingBox())?.x).toBe(0);

    // The shared backdrop makes the Rail drawer modal — it correctly blocks the Dock underneath
    // while open, so close it (its own close button) before testing the Inspector separately.
    await page.locator('.sl-rail__drawer-close').click();
    await expect.poll(async () => (await page.locator('.sl-rail').boundingBox())?.x).toBeLessThan(0);

    // Selecting a satellite auto-opens the Inspector drawer (the "on-demand" trigger).
    await page.locator('.sl-dock__row', { hasText: 'EROS-LIKE' }).click();
    await expect.poll(async () => (await page.locator('.sl-inspector').boundingBox())?.x).toBeGreaterThanOrEqual(0);
    await expect(page.locator('.sl-inspector__title')).toContainText('EROS-LIKE');
  });
});
