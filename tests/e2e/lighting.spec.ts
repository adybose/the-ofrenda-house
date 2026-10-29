import type { Page } from '@playwright/test';
import { NEAR_BLACK, expect, imageStats, test } from './fixtures';

async function boot(page: Page, query: string) {
  await page.goto(`/?seed=42&${query}`);
  await page.waitForFunction(() => document.body.dataset.ready === 'true' && Boolean(window.__ofrenda));
}

const CENTRE: [number, number, number, number] = [0.4, 0.4, 0.6, 0.6];
const CORNERS = {
  topLeft: [0, 0, 0.12, 0.12],
  topRight: [0.88, 0, 1, 0.12],
  bottomLeft: [0, 0.88, 0.12, 1],
  bottomRight: [0.88, 0.88, 1, 1],
} as const satisfies Record<string, [number, number, number, number]>;

test('the flashlight lights the centre of the view and leaves the edges dark; off, the room is near-black', async ({ page, consoleErrors }) => {
  await boot(page, 'debug=hooks&skip=prologue');
  // This measures the lit scene: the HUD overlays (spec 10) in the corners don't count.
  await page.addStyleTag({ content: '.hud-slot, #journal-button { display: none !important; }' });
  await page.evaluate(() => window.__ofrenda!.viewRoom('filler'));
  await page.evaluate(() => window.__ofrenda!.frames(3));

  // It starts off: the story has you switch it on after the door slams.
  expect(await page.evaluate(() => window.__ofrenda!.flashlight().on)).toBe(false);
  const dark = await page.screenshot({ path: 'artifacts/screenshots/06-flashlight-off.png' });
  const off = (await imageStats(page, dark)).all!;
  expect(off.mean).toBeLessThanOrEqual(NEAR_BLACK.mean);
  expect(off.p99).toBeLessThanOrEqual(NEAR_BLACK.p99);

  await page.keyboard.press('f');
  await expect.poll(() => page.evaluate(() => window.__ofrenda!.flashlight().on)).toBe(true);
  await page.evaluate(() => window.__ofrenda!.frames(10));
  const lit = await page.screenshot({ path: 'artifacts/screenshots/06-flashlight-on.png' });
  const stats = await imageStats(page, lit, { centre: CENTRE, ...CORNERS });
  const corners = Object.keys(CORNERS).map((k) => stats[k]!.mean);
  // "Well above the corners": clearly lit in the middle, and at least four times the brightest corner.
  expect(stats.centre!.mean).toBeGreaterThan(25);
  expect(stats.centre!.mean).toBeGreaterThan(Math.max(...corners) * 4);

  await page.keyboard.press('f');
  await expect.poll(() => page.evaluate(() => window.__ofrenda!.flashlight().on)).toBe(false);
  const events = await page.evaluate(() => window.__ofrenda!.events().filter((e) => e.name === 'flashlightToggled'));
  expect(events.map((e) => e.on)).toEqual([true, false]);
  expect(consoleErrors).toEqual([]);
});

test('lightning lights the room through a window and emits a lightning event', async ({ page }) => {
  await boot(page, 'debug=hooks&skip=prologue');
  await page.evaluate(() => window.__ofrenda!.viewRoom('filler'));
  await page.evaluate(() => window.__ofrenda!.strike({ strength: 1, distanceKm: 0.5 }));
  const events = await page.evaluate(() => window.__ofrenda!.events().filter((e) => e.name === 'lightning'));
  expect(events).toEqual([{ name: 'lightning', strength: 1, distanceKm: 0.5 }]);
});

test('light lab: a pillar in the beam casts a visible shadow', async ({ page, consoleErrors }) => {
  await page.goto('/?debug=lightlab');
  await page.waitForFunction(() => document.body.dataset.lightlabReady === 'true');
  const { withShadow, withoutShadow } = await page.evaluate(() => window.__lightlab!.measurePillar());
  expect(withoutShadow).toBeGreaterThan(20);
  expect(withShadow).toBeLessThan(withoutShadow * 0.4);
  await page.evaluate(() => window.__lightlab!.show('pillar'));
  await page.screenshot({ path: 'artifacts/screenshots/06-lightlab-pillar.png' });
  expect(consoleErrors).toEqual([]);
});

test('light lab: a lightning strike throws window-frame shadows on the floor', async ({ page }) => {
  await page.goto('/?debug=lightlab');
  await page.waitForFunction(() => document.body.dataset.lightlabReady === 'true');
  const { withFrame, withoutFrame } = await page.evaluate(() => window.__lightlab!.measureWindow());
  // The lit patch on the floor is bright either way; the mullions cut dark bars through it.
  expect(withoutFrame.max).toBeGreaterThan(40);
  expect(withFrame.max).toBeGreaterThan(40);
  expect(withFrame.min).toBeLessThan(withoutFrame.min * 0.5);
  await page.evaluate(() => window.__lightlab!.show('window'));
  await page.screenshot({ path: 'artifacts/screenshots/06-lightlab-window.png' });
});
