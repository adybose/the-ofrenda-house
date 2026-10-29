import type { Page } from '@playwright/test';
import { mockModel, next, walkIn } from './encounter-helpers';
import { expect, imageStats, test } from './fixtures';

// Spec 19: a spirit comes in through the wall behind its portrait, floats, glows in the dark,
// and leaves through the nearest wall.

async function boot(page: Page) {
  await page.goto('/?seed=42&skip=act1&debug=encounter,hooks&mute=1');
  await page.waitForFunction(() => document.body.dataset.ready === 'true' && Boolean(window.__encounter));
}

/** The first unlocked key room whose spirit holds a clue, and its riddle's answer for the mock. */
async function pickRoom(page: Page) {
  return page.evaluate(() => {
    const room = window.__encounter!.keyRooms().find((k) => !k.locked && k.doorId && window.__encounter!.clueCount(k.characterId) > 0)!;
    return { characterId: room.characterId, doorId: room.doorId!, roomId: room.roomId!, answer: window.__encounter!.riddleAnswer(room.characterId) };
  });
}

const hideOverlays = (page: Page) =>
  page.addStyleTag({ content: '#dialogue, .hud-slot, #journal-button, #interact-prompt, .clue-toast { visibility: hidden !important; }' });

test('it comes in through the wall behind its portrait, floating, and leaves through a wall', async ({ page }) => {
  test.setTimeout(60_000);
  let answer = '';
  await mockModel(page, () => answer);
  await boot(page);
  const room = await pickRoom(page);
  answer = room.answer;
  await page.keyboard.press('KeyF');

  const lowest: number[] = [];
  await walkIn(page, room.doorId);
  // Where it came from: beyond the room's wall; where it stops: inside the room.
  const entrance = (await page.evaluate(() => window.__encounter!.entrance()))!;
  const inRoom = (cell: string) => page.evaluate(({ cell, id }) => window.__ofrenda!.house.roomAt(cell)?.id === id, { cell, id: room.roomId });
  expect(await inRoom(entrance.from)).toBe(false);
  expect(await inRoom(entrance.to)).toBe(true);

  // Caught in the wall: its back still behind the portrait's wall, its front already in the room.
  expect((await page.evaluate(() => window.__encounter!.wallOffset()))!).toBeLessThan(0);
  await expect.poll(() => page.evaluate(() => window.__encounter!.wallOffset() ?? -1), { intervals: [30] }).toBeGreaterThan(-0.12);
  await page.screenshot({ path: 'artifacts/screenshots/19-spirit-entering.png' });
  console.log(`entering: ${(await page.evaluate(() => window.__encounter!.wallOffset()))!.toFixed(2)} m in front of the wall`);
  // It doesn't speak until it has come all the way in.
  expect(await page.locator('#dialogue-text').textContent()).not.toContain('Who walks');
  for (let i = 0; i < 12; i++) {
    lowest.push((await page.evaluate(() => window.__encounter!.spiritLowest()))!);
    await page.waitForTimeout(150);
  }
  await expect(page.locator('#dialogue-text')).toContainText('Who walks', { timeout: 8000 });
  expect(await page.evaluate(() => window.__encounter!.drift())).toBe(1);
  console.log(`spirit's lowest point: ${Math.min(...lowest).toFixed(3)} to ${Math.max(...lowest).toFixed(3)} m`);
  expect(Math.min(...lowest)).toBeGreaterThanOrEqual(0.25);
  expect(Math.max(...lowest)).toBeLessThanOrEqual(0.4);

  // Play it through to the reward, then catch it leaving.
  await next(page);
  await expect(page.locator('#dialogue-options button')).not.toHaveCount(0, { timeout: 8000 });
  await page.keyboard.press('Digit1');
  await expect(page.locator('#dialogue-text')).toContainText('So you say', { timeout: 8000 });
  await next(page);
  await expect(page.locator('#dialogue-options button')).toHaveCount(4, { timeout: 8000 });
  await page.keyboard.press('Digit1');
  await expect(page.locator('#dialogue-text')).toContainText('hear what I know', { timeout: 8000 });
  await next(page);
  await expect.poll(() => page.evaluate(() => window.__encounter!.leaving())).toBe(true);
  await page.waitForTimeout(700);
  await hideOverlays(page);
  await page.screenshot({ path: 'artifacts/screenshots/19-spirit-leaving.png' });
  await expect.poll(() => page.evaluate(() => window.__encounter!.leaving()), { timeout: 5000 }).toBe(false);
});

test('in total darkness the spirit still shows, by its halo', async ({ page }) => {
  let answer = '';
  await mockModel(page, () => answer);
  await boot(page);
  const room = await pickRoom(page);
  answer = room.answer;
  expect(await page.evaluate(() => window.__ofrenda!.flashlight().on)).toBe(false);
  await walkIn(page, room.doorId);
  await expect(page.locator('#dialogue-text')).toContainText('Who walks', { timeout: 8000 });
  await hideOverlays(page);
  await page.waitForTimeout(300);
  const region = (await page.evaluate(() => window.__encounter!.spiritRegion()))!;
  const stats = await imageStats(page, await page.screenshot({ path: 'artifacts/screenshots/19-spirit-dark.png' }), {
    spirit: region,
    topLeft: [0, 0, 0.12, 0.12],
    topRight: [0.88, 0, 1, 0.12],
    bottomLeft: [0, 0.88, 0.12, 1],
    bottomRight: [0.88, 0.88, 1, 1],
  });
  const corners = Math.max(stats.topLeft!.mean, stats.topRight!.mean, stats.bottomLeft!.mean, stats.bottomRight!.mean);
  console.log(`in the dark: spirit region ${stats.spirit!.mean.toFixed(1)}, brightest corner ${corners.toFixed(1)}`);
  expect(stats.spirit!.mean).toBeGreaterThan(15);
  expect(stats.spirit!.mean).toBeGreaterThan(corners * 3);
});
