import type { Page } from '@playwright/test';
import { expect, imageStats, test } from './fixtures';

// Spec 17: the torch starts two-thirds charged, dims as it fades, and cuts out when critical.

async function boot(page: Page, query = '') {
  await page.goto(`/?seed=42&debug=hooks&skip=prologue&mute=1${query}`);
  await page.waitForFunction(() => document.body.dataset.ready === 'true' && Boolean(window.__ofrenda));
}

const CENTRE: [number, number, number, number] = [0.4, 0.4, 0.6, 0.6];

/** Switches the torch on in a filler room; the brightest centre of a few frames, so a flicker dip doesn't count. */
async function litCentre(page: Page, shot: string): Promise<number> {
  await page.addStyleTag({ content: '.hud-slot, #journal-button { display: none !important; }' });
  await page.evaluate(() => window.__ofrenda!.viewRoom('filler'));
  await page.keyboard.press('f');
  await expect.poll(() => page.evaluate(() => window.__ofrenda!.flashlight().on)).toBe(true);
  let best = 0;
  for (let i = 0; i < 5; i++) {
    await page.evaluate(() => window.__ofrenda!.frames(8));
    const image = await page.screenshot(i === 0 ? { path: `artifacts/screenshots/${shot}` } : {});
    best = Math.max(best, (await imageStats(page, image, { centre: CENTRE })).centre!.mean);
  }
  return best;
}

test('the torch starts between 60% and 70%, and is much dimmer at 8%', async ({ page, consoleErrors }) => {
  await boot(page);
  const { level } = await page.evaluate(() => window.__ofrenda!.flashlight());
  expect(level).toBeGreaterThanOrEqual(0.6);
  expect(level).toBeLessThanOrEqual(0.7);
  const healthy = await litCentre(page, '17-battery-65.png');

  await boot(page, '&battery=0.08');
  const critical = await page.evaluate(() => window.__ofrenda!.flashlight());
  expect(critical.critical).toBe(true);
  const weak = await litCentre(page, '17-battery-08.png');

  expect(healthy).toBeGreaterThan(25);
  expect(weak).toBeLessThan(healthy * 0.6);
  expect(consoleErrors).toEqual([]);
});

test('a critical torch cuts out while still switched on', async ({ page }) => {
  test.setTimeout(60_000);
  // 9.5%: about 27 s of light before it switches off at 5%; the first cut-out comes within 20 s.
  await boot(page, '&battery=0.095');
  await page.keyboard.press('f');
  await expect.poll(() => page.evaluate(() => window.__ofrenda!.flashlight().on)).toBe(true);
  await expect
    .poll(() => page.evaluate(() => (({ on, lit }) => on && !lit)(window.__ofrenda!.flashlight())), { timeout: 30_000, intervals: [100] })
    .toBe(true);
  const cuts = await page.evaluate(() => window.__ofrenda!.events().filter((e) => e.name === 'flashlightCutOut'));
  expect(cuts.length).toBeGreaterThan(0);
  expect(Number(cuts[0]!.seconds)).toBeGreaterThanOrEqual(1.4);
  expect(Number(cuts[0]!.seconds)).toBeLessThanOrEqual(4);
});

test('the battery bar turns red when critical', async ({ page }) => {
  await boot(page, '&battery=0.08');
  await page.evaluate(() => window.__ofrenda!.frames(3));
  const colour = await page.evaluate(() => getComputedStyle(document.querySelector('#hud-battery span span')!).backgroundColor);
  expect(colour).toBe('rgb(176, 58, 46)');
  await page.screenshot({ path: 'artifacts/screenshots/17-battery-critical-hud.png' });

  await boot(page);
  await page.evaluate(() => window.__ofrenda!.frames(3));
  expect(await page.evaluate(() => getComputedStyle(document.querySelector('#hud-battery span span')!).backgroundColor)).toBe('rgb(217, 180, 108)');
});
