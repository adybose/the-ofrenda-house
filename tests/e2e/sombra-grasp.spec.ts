import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';

// Spec 26: walk at La Sombra by candlelight and a gust blows the candle out, and it seizes the player,
// who has 1.5 s to light up again.

/** Act 2 with the Act 1 matchbox and candle in hand, the candle lit and the torch off. */
async function byCandle(page: Page) {
  await page.route('**/api/shadow/taunt', (route) => route.fulfill({ status: 503, body: '{}' }));
  await page.route('**/api/tts', (route) => route.fulfill({ status: 503, body: '{}' }));
  await page.goto('/?seed=42&skip=act1&debug=hooks,shadow,items&mute=1');
  await page.waitForFunction(() => document.body.dataset.ready === 'true' && Boolean(window.__shadow));
  expect(await page.evaluate(() => window.__items!.goTo('stand:act1-corridor'))).toBe(true);
  await page.evaluate(() => window.__ofrenda!.frames(5));
  await page.keyboard.press('KeyE');
  await expect.poll(() => page.evaluate(() => window.__items!.state().hasMatchbox)).toBe(true);
  await page.keyboard.press('KeyE');
  await expect.poll(() => page.evaluate(() => window.__items!.state().hand)).toBe('candle:stand:act1-corridor');
  await page.keyboard.press('KeyM');
  await expect.poll(() => page.evaluate(() => window.__items!.inLight())).toBe(true);
  expect(await page.evaluate(() => window.__ofrenda!.flashlight().on)).toBe(false);
  // Spec 20's fix: with a candle in hand, the thought about finding one is gone.
  expect(await page.locator('#thought').evaluate((e) => e.dataset.id !== 'findCandle' || e.style.opacity === '0')).toBe(true);
}

const mode = (page: Page) => page.evaluate(() => window.__shadow!.mode());
const names = async (page: Page) => (await page.evaluate(() => window.__ofrenda!.events())).map((e) => e.name);

/** It appears a few metres off, threatening; the player turns to it and walks at it until it seizes them. */
async function walkInto(page: Page) {
  expect(await page.evaluate(() => window.__shadow!.summon(3, 'confronting'))).toBe(true);
  await page.evaluate(() => {
    const [sx, sz] = window.__shadow!.position();
    const p = window.__ofrenda!.player();
    window.__ofrenda!.place(p.x, p.z, Math.atan2(-(sx - p.x), -(sz - p.z)));
  });
  await page.keyboard.down('ArrowUp');
  await expect.poll(() => mode(page), { timeout: 3000, intervals: [50] }).toBe('grasping');
  await page.keyboard.up('ArrowUp');
}

test('walking at it by candlelight: the candle is blown out and it seizes the player; a struck match throws it off', async ({ page }) => {
  await byCandle(page);
  await walkInto(page);
  const log = await page.evaluate(() => window.__ofrenda!.events());
  expect(log.find((e) => e.name === 'shadowGrasped')?.gust).toBe(true);
  expect(log.some((e) => e.name === 'candleOut' && e.reason === 'blown')).toBe(true);
  expect(await page.evaluate(() => window.__items!.inLight())).toBe(false);
  await expect(page.locator('#caption')).toContainText('La Sombra:');
  await page.waitForTimeout(350);
  const near = (await page.evaluate(() => window.__shadow!.distance()))!;
  console.log(`seized: La Sombra ${near.toFixed(2)} m from the player`);
  expect(near).toBeLessThan(1);
  await page.screenshot({ path: 'artifacts/screenshots/26-grasp.png' });
  await page.keyboard.press('KeyM');
  await expect.poll(() => mode(page), { timeout: 1000 }).toBe('withdrawn');
  expect(await names(page)).toContain('shadowRepelled');
  expect(await page.evaluate(() => window.__items!.inLight())).toBe(true);
  await page.waitForTimeout(2000);
  expect(await names(page)).not.toContain('caughtByShadow');
});

test('switching the torch on throws it off', async ({ page }) => {
  await byCandle(page);
  await walkInto(page);
  await page.waitForTimeout(400);
  await page.keyboard.press('KeyF');
  await expect.poll(() => mode(page), { timeout: 1000 }).toBe('withdrawn');
  expect(await names(page)).toContain('shadowRepelled');
  await page.waitForTimeout(2000);
  expect(await names(page)).not.toContain('caughtByShadow');
});

test('with no light struck in time, the player is possessed', async ({ page }) => {
  await byCandle(page);
  await walkInto(page);
  const seized = Date.now();
  await page.waitForTimeout(1000);
  expect(await mode(page)).toBe('grasping');
  await expect.poll(() => mode(page), { timeout: 3000 }).toBe('caught');
  console.log(`caught ${((Date.now() - seized) / 1000).toFixed(1)} s after the seizure`);
  await expect(page.locator('#ending[data-kind="possessed"]')).toContainText('You lost. You were possessed by the spirit of La Sombra.');
  expect(await names(page)).toContain('caughtByShadow');
});

test('with the torch on, walking at it brings no gust', async ({ page }) => {
  await byCandle(page);
  await page.keyboard.press('KeyF');
  expect(await page.evaluate(() => window.__shadow!.summon(3, 'confronting'))).toBe(true);
  await page.evaluate(() => {
    const [sx, sz] = window.__shadow!.position();
    const p = window.__ofrenda!.player();
    window.__ofrenda!.place(p.x, p.z, Math.atan2(-(sx - p.x), -(sz - p.z)));
  });
  await page.keyboard.down('ArrowUp');
  await page.waitForTimeout(2500);
  await page.keyboard.up('ArrowUp');
  const log = await names(page);
  expect(log).not.toContain('shadowGrasped');
  expect(log).not.toContain('caughtByShadow');
  expect(await page.evaluate(() => window.__items!.state().hand)).toBe('candle:stand:act1-corridor');
  expect(await page.evaluate(() => window.__items!.inLight())).toBe(true);
});
