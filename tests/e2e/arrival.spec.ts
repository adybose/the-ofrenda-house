import type { Page } from '@playwright/test';
import { expect, imageStats, test } from './fixtures';

async function boot(page: Page) {
  await page.goto('/?seed=42&debug=hooks&mute=1');
  await page.waitForFunction(() => document.body.dataset.ready === 'true' && Boolean(window.__ofrenda));
}

test('the game starts outside, under a dim sky above darker ground', async ({ page, consoleErrors }) => {
  await boot(page);
  expect(await page.evaluate(() => window.__ofrenda!.arrival())).toEqual({ stage: 'outside', exterior: true });
  await page.evaluate(() => window.__ofrenda!.frames(5));
  const png = await page.screenshot({ path: 'artifacts/screenshots/16-exterior.png' });
  const stats = await imageStats(page, png, { sky: [0, 0, 1, 0.18], ground: [0, 0.85, 1, 1], all: [0, 0, 1, 1] });
  // Not black: the clouds and the house can be made out. Still night.
  expect(stats.sky!.mean).toBeGreaterThan(6);
  expect(stats.all!.mean).toBeGreaterThan(6);
  expect(stats.all!.mean).toBeLessThan(90);
  expect(consoleErrors).toEqual([]);
});

test('the door opens by itself as you reach it, and slams and seals once you are inside', async ({ page }) => {
  await boot(page);
  await page.evaluate(() => window.__ofrenda!.place(11.25, 4, 0));
  expect(await page.evaluate(() => window.__ofrenda!.house.getDoor('front-door')?.state)).toBe('sealed');
  // Walk up to the door without pressing E.
  await page.keyboard.down('ArrowUp');
  await expect.poll(() => page.evaluate(() => window.__ofrenda!.house.getDoor('front-door')?.state), { timeout: 4000 }).toBe('open');
  await page.keyboard.up('ArrowUp');
  const events = await page.evaluate(() => window.__ofrenda!.events().map((e) => e.name));
  expect(events).toContain('doorOpened');
  expect(events).not.toContain('interact');
  await page.waitForTimeout(600);
  await page.screenshot({ path: 'artifacts/screenshots/16-door-open.png' });

  // Walk in.
  await page.keyboard.down('ArrowUp');
  await expect.poll(() => page.evaluate(() => window.__ofrenda!.arrival().stage), { timeout: 6000 }).toBe('inside');
  await page.keyboard.up('ArrowUp');
  expect(await page.evaluate(() => window.__ofrenda!.house.getDoor('front-door')?.state)).toBe('sealed');
  expect(await page.evaluate(() => window.__ofrenda!.arrival().exterior)).toBe(false);
  // "You switch on your flashlight."
  await page.keyboard.press('f');
  await page.evaluate(() => window.__ofrenda!.frames(10));
  await page.screenshot({ path: 'artifacts/screenshots/16-inside.png' });
});

test('lightning outside lights up the sky and the grounds', async ({ page }) => {
  await boot(page);
  await page.evaluate(() => window.__ofrenda!.frames(3));
  const before = await page.screenshot();
  await page.evaluate(() => window.__ofrenda!.holdLightning(1));
  await page.evaluate(() => window.__ofrenda!.frames(5));
  const lit = await page.screenshot({ path: 'artifacts/screenshots/16-exterior-lightning.png' });
  const regions = { sky: [0, 0, 1, 0.18], ground: [0, 0.8, 1, 1] } as Record<string, [number, number, number, number]>;
  const a = await imageStats(page, before, regions);
  const b = await imageStats(page, lit, regions);
  expect(b.sky!.mean).toBeGreaterThan(a.sky!.mean * 1.5);
  expect(b.ground!.mean).toBeGreaterThan(a.ground!.mean * 1.3);
});

test('?skip=prologue starts inside the entrance hall as before', async ({ page }) => {
  await page.goto('/?seed=42&debug=hooks&mute=1&skip=prologue');
  await page.waitForFunction(() => Boolean(window.__ofrenda));
  expect(await page.evaluate(() => window.__ofrenda!.arrival())).toEqual({ stage: 'inside', exterior: false });
  expect(await page.evaluate(() => window.__ofrenda!.house.roomAt('7,2')?.id)).toBe('entrance-hall');
});
