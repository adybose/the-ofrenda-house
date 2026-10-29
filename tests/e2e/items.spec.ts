import type { Page } from '@playwright/test';
import { mockModel, next, walkIn } from './encounter-helpers';
import { expect, imageStats, test } from './fixtures';

// Spec 18: the candle and matchbox at the Act 1 dead end; a solved spirit's candle and key.

async function boot(page: Page, debug = 'hooks,items') {
  await page.goto(`/?seed=42&skip=act1&debug=${debug}&mute=1`);
  await page.waitForFunction(() => document.body.dataset.ready === 'true' && Boolean(window.__items));
}

const prompt = (page: Page) => page.locator('#interact-prompt');
const lower: [number, number, number, number] = [0.25, 0.35, 0.75, 1];

test('at the dead end: take the matches and the candle, strike a match and light it', async ({ page, consoleErrors }) => {
  await boot(page);
  // The HUD's own text would count as light; this measures the scene.
  await page.addStyleTag({ content: '.hud-slot, #journal-button, #interact-prompt { visibility: hidden !important; }' });
  expect(await page.evaluate(() => window.__items!.goTo('stand:act1-corridor'))).toBe(true);
  await page.evaluate(() => window.__ofrenda!.frames(10));
  await expect(prompt(page)).toContainText('Take the matches');
  // By torchlight: the stand, its candle and the matchbox.
  await page.keyboard.down('PageDown');
  await page.waitForTimeout(250);
  await page.keyboard.up('PageDown');
  await page.keyboard.press('KeyF');
  await page.evaluate(() => window.__ofrenda!.frames(10));
  await page.screenshot({ path: 'artifacts/screenshots/18-dead-end-torch.png' });
  await page.keyboard.press('KeyF');
  await page.evaluate(() => window.__ofrenda!.frames(5));
  expect(await page.evaluate(() => window.__ofrenda!.flashlight().on)).toBe(false);
  const dark = (await imageStats(page, await page.screenshot({ path: 'artifacts/screenshots/18-dead-end.png' }), { lower })).lower!;

  await page.keyboard.press('KeyE');
  await expect.poll(() => page.evaluate(() => window.__items!.state().hasMatchbox)).toBe(true);
  await expect(page.locator('#hud-matches')).toHaveText('Matches: 8');
  await expect(prompt(page)).toContainText('Take the candle');
  await page.keyboard.press('KeyE');
  await expect.poll(() => page.evaluate(() => window.__items!.state().hand)).toBe('candle:stand:act1-corridor');
  expect(await page.evaluate(() => window.__items!.inLight())).toBe(false);

  await page.keyboard.press('KeyM');
  await expect.poll(() => page.evaluate(() => window.__items!.state().matches)).toBe(7);
  const state = await page.evaluate(() => window.__items!.state());
  expect(state.candles[state.hand!]!.lit).toBe(true);
  expect(await page.evaluate(() => window.__items!.inLight())).toBe(true);
  await page.evaluate(() => window.__ofrenda!.frames(10));
  const lit = (await imageStats(page, await page.screenshot({ path: 'artifacts/screenshots/18-candle-lit.png' }), { lower })).lower!;
  expect(lit.mean).toBeGreaterThan(dark.mean + 8);

  const names = (await page.evaluate(() => window.__ofrenda!.events())).map((e) => e.name);
  expect(names).toEqual(expect.arrayContaining(['itemPickedUp', 'matchStruck', 'candleLit']));
  expect(consoleErrors).toEqual([]);
});

test('a solved spirit’s candle lights itself, its key lies beside it, and taking the candle ends the sanctuary', async ({ page }) => {
  test.setTimeout(60_000);
  let answer = '';
  await mockModel(page, () => answer);
  await boot(page, 'hooks,items,encounter');
  // An unlocked room whose spirit holds another room's key.
  const room = await page.evaluate(() => {
    const rooms = window.__encounter!.keyRooms();
    const holder = rooms.find((k) => !k.locked && k.doorId && rooms.some((other) => other.keyHolderId === k.characterId))!;
    return { characterId: holder.characterId, doorId: holder.doorId!, keyIds: rooms.filter((k) => k.keyHolderId === holder.characterId).map((k) => k.keyId) };
  });
  answer = await page.evaluate((id) => window.__encounter!.riddleAnswer(id), room.characterId);
  const stand = `stand:key:${room.characterId}`;
  expect(await page.evaluate((id) => window.__items!.state().candles[`candle:${id}`], stand)).toBeUndefined();

  await walkIn(page, room.doorId);
  await expect(page.locator('#dialogue-text')).toContainText('Who walks', { timeout: 8000 });
  await next(page);
  await expect(page.locator('#dialogue-options button')).not.toHaveCount(0, { timeout: 8000 });
  await page.keyboard.press('Digit1');
  await expect(page.locator('#dialogue-text')).toContainText('So you say', { timeout: 8000 });
  await next(page);
  await expect(page.locator('#dialogue-options button')).toHaveCount(4, { timeout: 8000 });
  await page.keyboard.press('Digit1');
  await expect(page.locator('#dialogue-text')).toContainText('hear what I know', { timeout: 8000 });
  await next(page);
  await expect.poll(() => page.evaluate(() => window.__encounter!.active())).toBe(false);

  // Once the spirit has gone: the candle burns and the key lies on the table.
  await expect.poll(() => page.evaluate((id) => window.__items!.state().tableKeys[id] ?? [], stand), { timeout: 8000 }).toEqual(room.keyIds);
  const state = await page.evaluate(() => window.__items!.state());
  expect(state.candles[`candle:${stand}`]!.lit).toBe(true);
  expect(await page.evaluate((id) => window.__items!.isSanctuary(id), `key:${room.characterId}`)).toBe(true);
  const keyEvents = (await page.evaluate(() => window.__ofrenda!.events())).filter((e) => e.name === 'keyAwarded');
  expect(keyEvents.map((e) => e.keyId)).toEqual(room.keyIds);

  await page.evaluate((id) => window.__items!.goTo(id), stand);
  await page.keyboard.down('PageDown');
  await page.waitForTimeout(250);
  await page.keyboard.up('PageDown');
  await page.evaluate(() => window.__ofrenda!.frames(10));
  await page.screenshot({ path: 'artifacts/screenshots/18-solved-candle-key.png' });
  await expect(prompt(page)).toContainText('Take the key');
  await page.keyboard.press('KeyE');
  await expect(page.locator('#hud-keys')).toHaveText(`Keys: ${room.keyIds.length}`);
  await page.keyboard.press('KeyJ');
  await expect(page.locator('#journal')).toContainText('Key to');
  await page.keyboard.press('KeyJ');

  // Carrying the candle away leaves the room dark, and La Sombra free to come in.
  await expect(prompt(page)).toContainText('Take the candle');
  await page.keyboard.press('KeyE');
  await expect.poll(() => page.evaluate((id) => window.__items!.isSanctuary(id), `key:${room.characterId}`)).toBe(false);
  expect(await page.evaluate(() => window.__items!.inLight())).toBe(true);
});

test('a key holder who falls silent still leaves its key, but its candle stays dark', async ({ page }) => {
  test.setTimeout(60_000);
  let answer = '';
  await mockModel(page, () => answer);
  await boot(page, 'hooks,items,encounter');
  const room = await page.evaluate(() => {
    const rooms = window.__encounter!.keyRooms();
    const holder = rooms.find((k) => !k.locked && k.doorId && rooms.some((other) => other.keyHolderId === k.characterId))!;
    return { characterId: holder.characterId, doorId: holder.doorId!, keyIds: rooms.filter((k) => k.keyHolderId === holder.characterId).map((k) => k.keyId) };
  });
  answer = await page.evaluate((id) => window.__encounter!.riddleAnswer(id), room.characterId);
  const stand = `stand:key:${room.characterId}`;

  await walkIn(page, room.doorId);
  await expect(page.locator('#dialogue-text')).toContainText('Who walks', { timeout: 8000 });
  await next(page);
  await expect(page.locator('#dialogue-options button')).not.toHaveCount(0, { timeout: 8000 });
  await page.keyboard.press('Digit1');
  await expect(page.locator('#dialogue-text')).toContainText('So you say', { timeout: 8000 });
  await next(page);
  // The right answer is the first option; the second is always wrong, on a second try too.
  for (let tries = 0; tries < 2 && (await page.evaluate(() => window.__encounter!.step())) === 'riddle'; tries++) {
    await expect(page.locator('#dialogue-options button').nth(1)).toBeVisible({ timeout: 8000 });
    await page.keyboard.press('Digit2');
    await page.waitForTimeout(300);
  }
  await expect(page.locator('#dialogue-text')).toContainText('Go away', { timeout: 8000 });
  await next(page);
  await expect.poll(() => page.evaluate(() => window.__encounter!.active())).toBe(false);

  await expect.poll(() => page.evaluate((id) => window.__items!.state().tableKeys[id] ?? [], stand), { timeout: 8000 }).toEqual(room.keyIds);
  const state = await page.evaluate(() => window.__items!.state());
  expect(state.candles[`candle:${stand}`]?.lit ?? false).toBe(false);
  expect(state.solved).toEqual([]);
  const names = (await page.evaluate(() => window.__ofrenda!.events())).map((e) => e.name);
  expect(names).toContain('riddleFailed');
});
