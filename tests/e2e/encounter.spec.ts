import type { Page } from '@playwright/test';
import { expect, imageStats, test } from './fixtures';
import { mockModel, next, walkIn } from './encounter-helpers';

async function boot(page: Page, extra = '') {
  await page.goto(`/?seed=42&skip=act1&debug=encounter,hooks&mute=1${extra}`);
  await page.waitForFunction(() => document.body.dataset.ready === 'true' && Boolean(window.__encounter));
}

/** The first unlocked key room whose spirit holds a clue. */
async function pickRoom(page: Page) {
  return page.evaluate(() => {
    const room = window.__encounter!.keyRooms().find((k) => !k.locked && k.doorId && window.__encounter!.clueCount(k.characterId) > 0)!;
    return { characterId: room.characterId, doorId: room.doorId! };
  });
}

test('a whole encounter played with keys only: appear, who are you, riddle, reward; the clue is in the journal', async ({ page }) => {
  let answer = '';
  const mock = await mockModel(page, () => answer);
  await boot(page);
  const room = await pickRoom(page);
  answer = await page.evaluate((id) => window.__encounter!.riddleAnswer(id), room.characterId);
  await walkIn(page, room.doorId);
  const started = Date.now();

  // Appear.
  await expect(page.locator('#dialogue-text')).toContainText('Who walks', { timeout: 8000 });
  await expect.poll(() => page.evaluate(() => window.__encounter!.spiritFade())).toBeGreaterThan(0.95);
  await page.screenshot({ path: 'artifacts/screenshots/11-encounter-appear.png' });
  await next(page);

  // Who are you?
  await expect(page.locator('#dialogue-options button')).not.toHaveCount(0, { timeout: 8000 });
  await page.screenshot({ path: 'artifacts/screenshots/11-encounter-who-are-you.png' });
  await page.keyboard.press('Digit1');
  await expect(page.locator('#dialogue-text')).toContainText('So you say', { timeout: 8000 });
  await next(page);

  // The riddle.
  await expect(page.locator('#dialogue-options button')).toHaveCount(4, { timeout: 8000 });
  await page.screenshot({ path: 'artifacts/screenshots/11-encounter-riddle.png' });
  await page.keyboard.press('Digit1');

  // The reward.
  await expect(page.locator('#dialogue-text')).toContainText('hear what I know', { timeout: 8000 });
  await page.screenshot({ path: 'artifacts/screenshots/11-encounter-reward.png' });
  await next(page);
  await expect.poll(() => page.evaluate(() => window.__encounter!.active())).toBe(false);

  const names = (await page.evaluate(() => window.__ofrenda!.events())).map((e) => e.name);
  expect(names).toContain('encounterStarted');
  expect(names).toContain('clueAwarded');
  expect(names).not.toContain('riddleFailed');
  const ended = (await page.evaluate(() => window.__ofrenda!.events())).find((e) => e.name === 'encounterEnded');
  expect(ended).toMatchObject({ characterId: room.characterId, outcome: 'reward' });

  // The clue is in the journal.
  await page.keyboard.press('KeyJ');
  const cards = await page.evaluate((id) => window.__encounter!.clueCount(id), room.characterId);
  await expect(page.locator('#journal .clue-card')).toHaveCount(cards);
  await page.keyboard.press('KeyJ');

  // The spirit's lines were prepared before the player walked in.
  expect(mock.prefetchAt.length).toBeGreaterThan(0);
  expect(mock.prefetchAt[0]!).toBeLessThan(started);

  // Once only: leaving and coming back starts nothing.
  await walkIn(page, room.doorId).catch(() => undefined);
  const starts = (await page.evaluate(() => window.__ofrenda!.events())).filter((e) => e.name === 'encounterStarted');
  expect(starts).toHaveLength(1);
});

test('a spirit is translucent: the background shows through it, and the torch brightens it', async ({ page }) => {
  let answer = '';
  await mockModel(page, () => answer);
  await boot(page, '&debug=fullbright');
  const room = await pickRoom(page);
  answer = await page.evaluate((id) => window.__encounter!.riddleAnswer(id), room.characterId);
  await walkIn(page, room.doorId);
  await expect.poll(() => page.evaluate(() => window.__encounter!.spiritFade())).toBeGreaterThan(0.95);
  await page.evaluate(() => (document.getElementById('dialogue')!.style.visibility = 'hidden'));
  await page.waitForTimeout(200);
  await page.screenshot({ path: 'artifacts/screenshots/11-spirit-translucent.png' });

  // The spirit alone, on black and on white. An opaque figure looks the same on both; the more the
  // background shows through, the brighter it is on white.
  const region = (await page.evaluate(() => window.__encounter!.spiritRegion()))!;
  const shoot = async (colour: number) => {
    await page.evaluate((c) => window.__encounter!.isolateSpirit(c), colour);
    await page.waitForTimeout(200);
    return (await imageStats(page, await page.screenshot(), { spirit: region })).spirit!.mean;
  };
  const onBlack = await shoot(0x000000);
  const onWhite = await shoot(0xffffff);
  await page.evaluate(() => window.__encounter!.isolateSpirit(undefined));
  console.log(`translucency: spirit region on black ${onBlack.toFixed(1)}, on white ${onWhite.toFixed(1)}`);
  // It is there on black, and the white comes through it.
  expect(onBlack).toBeGreaterThan(8);
  expect(onWhite - onBlack).toBeGreaterThan(80);

  // The torch beam on it brightens it.
  expect(await page.evaluate(() => window.__encounter!.spiritLit())).toBeLessThan(0.1);
  await page.keyboard.press('KeyF');
  await expect.poll(() => page.evaluate(() => window.__encounter!.spiritLit()), { timeout: 4000 }).toBeGreaterThan(0.5);
});
