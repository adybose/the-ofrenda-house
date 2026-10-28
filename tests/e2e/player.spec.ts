import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';

async function boot(page: Page, query = '') {
  await page.goto(`/?seed=42&debug=fullbright${query}`);
  await page.waitForFunction(() => document.body.dataset.ready === 'true' && Boolean(window.__ofrenda?.player));
}

const state = (page: Page) => page.evaluate(() => window.__ofrenda!.player());

test('ArrowUp walks forward and ArrowLeft turns, with before and after screenshots', async ({ page, consoleErrors }) => {
  await boot(page);
  const start = await state(page);
  await page.screenshot({ path: 'artifacts/screenshots/05-before.png' });
  await page.keyboard.down('ArrowUp');
  await page.waitForTimeout(1000);
  await page.keyboard.up('ArrowUp');
  const moved = await state(page);
  expect(start.z - moved.z).toBeGreaterThan(0.9);
  expect(Math.abs(moved.x - start.x)).toBeLessThan(0.05);
  await page.screenshot({ path: 'artifacts/screenshots/05-after-walk.png' });

  await page.keyboard.down('ArrowLeft');
  await page.waitForTimeout(500);
  await page.keyboard.up('ArrowLeft');
  const turned = await state(page);
  expect(turned.yaw - moved.yaw).toBeGreaterThan(0.6);
  await page.screenshot({ path: 'artifacts/screenshots/05-after-turn.png' });
  expect(consoleErrors).toEqual([]);
});

test('E opens a nearby unlocked door and reports a locked one', async ({ page }) => {
  await boot(page, '&skip=act1');
  // Stand in front of the closed Act 1 exit and press E.
  const exit = 'd:-1,0:E';
  expect(await page.evaluate((id) => window.__ofrenda!.house.getDoor(id)?.state, exit)).toBe('closed');
  await page.evaluate(() => window.__ofrenda!.standFacingDoor('d:-1,0:E', 'b'));
  await expect.poll(() => page.evaluate(() => window.__ofrenda!.prompt())).toContain('E');
  await page.keyboard.press('e');
  await expect.poll(() => page.evaluate((id) => window.__ofrenda!.house.getDoor(id)?.state, exit)).toBe('open');
  await page.waitForTimeout(700);
  await page.screenshot({ path: 'artifacts/screenshots/05-door-open.png' });

  // A locked key room, from the corridor side.
  const locked = await page.evaluate(() => window.__ofrenda!.house.keyRooms().find((k) => k.locked)!);
  await page.evaluate((id) => window.__ofrenda!.standFacingDoor(id, 'outside'), locked.doorId!);
  await page.keyboard.press('e');
  await expect.poll(() => page.evaluate(() => window.__ofrenda!.events())).toContainEqual({ name: 'doorLocked', doorId: locked.doorId });
  expect(await page.evaluate((id) => window.__ofrenda!.house.getDoor(id)?.state, locked.doorId!)).toBe('locked');

  // With the key, E unlocks and opens it.
  await page.evaluate((key) => window.__ofrenda!.giveKey(key), locked.keyId);
  await page.keyboard.press('e');
  await expect.poll(() => page.evaluate((id) => window.__ofrenda!.house.getDoor(id)?.state, locked.doorId!)).toBe('open');
});

test('arrow keys do nothing while controls are disabled', async ({ page }) => {
  await boot(page);
  await page.evaluate(() => window.__ofrenda!.setControlsEnabled(false));
  const before = await state(page);
  await page.keyboard.down('ArrowUp');
  await page.keyboard.down('ArrowLeft');
  await page.waitForTimeout(600);
  await page.keyboard.up('ArrowUp');
  await page.keyboard.up('ArrowLeft');
  expect(await state(page)).toEqual(before);
  await page.evaluate(() => window.__ofrenda!.setControlsEnabled(true));
  await page.keyboard.down('ArrowUp');
  await page.waitForTimeout(300);
  await page.keyboard.up('ArrowUp');
  expect((await state(page)).z).toBeLessThan(before.z);
});

test('Page Up and Page Down look up and down within the clamp', async ({ page }) => {
  await boot(page);
  await page.keyboard.down('PageUp');
  await page.waitForTimeout(3000);
  await page.keyboard.up('PageUp');
  const up = await state(page);
  expect(up.pitch).toBeGreaterThan(1.3);
  expect(up.pitch).toBeLessThanOrEqual((80 * Math.PI) / 180 + 1e-6);
  await page.keyboard.down('PageDown');
  await page.waitForTimeout(500);
  await page.keyboard.up('PageDown');
  expect((await state(page)).pitch).toBeLessThan(up.pitch);
});

test('the E prompt shows only when something is in range and in view', async ({ page }) => {
  await boot(page, '&skip=act1');
  await page.evaluate(() => window.__ofrenda!.standFacingDoor('d:-1,0:E', 'b'));
  await expect.poll(() => page.evaluate(() => window.__ofrenda!.prompt())).toContain('E');
  // Turn round: the door is behind.
  await page.keyboard.down('ArrowLeft');
  await page.waitForTimeout(1500);
  await page.keyboard.up('ArrowLeft');
  await expect.poll(() => page.evaluate(() => window.__ofrenda!.prompt())).toBe('');
});
