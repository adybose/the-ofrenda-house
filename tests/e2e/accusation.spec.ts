import type { Page } from '@playwright/test';
import { mockModel, next, walkIn } from './encounter-helpers';
import { expect, test } from './fixtures';

// Spec 21: with enough clues, a spirit set at peace asks who the killer is, laughs, and leaves a
// key: another locked room's for a wrong name, the way out for the right one.

async function boot(page: Page) {
  await page.goto('/?seed=42&skip=act1&debug=hooks,encounter,items&mute=1&shadow=0&clues=all');
  await page.waitForFunction(() => document.body.dataset.ready === 'true' && Boolean(window.__encounter) && Boolean(window.__items));
}

/** The first unlocked spirit's room, its riddle answered by the mock, played to the question. */
async function toTheQuestion(page: Page) {
  let answer = '';
  await mockModel(page, () => answer);
  await boot(page);
  const room = await page.evaluate(() => {
    const k = window.__encounter!.keyRooms().find((r) => !r.locked && r.doorId && window.__encounter!.clueCount(r.characterId) > 0)!;
    return { characterId: k.characterId, doorId: k.doorId! };
  });
  answer = await page.evaluate((id) => window.__encounter!.riddleAnswer(id), room.characterId);
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
  await expect(page.locator('#dialogue-text')).toContainText('who did this to us', { timeout: 8000 });
  const accusation = await page.evaluate(() => window.__encounter!.accusation());
  await expect(page.locator('#dialogue-options button')).toHaveCount(accusation.options.length, { timeout: 8000 });
  return { ...room, ...accusation, stand: `stand:key:${room.characterId}` };
}

/** Name someone, hear the laugh, and wait for the spirit to leave its keys. */
async function name(page: Page, who: string, stand: string) {
  await page.locator('#dialogue-options button', { hasText: who }).click();
  await expect(page.locator('#dialogue-text')).toContainText('Ha…', { timeout: 8000 });
  await next(page);
  await expect.poll(() => page.evaluate(() => window.__encounter!.active())).toBe(false);
  await expect.poll(() => page.evaluate((id) => (window.__items!.state().tableKeys[id] ?? []).length, stand), { timeout: 8000 }).toBeGreaterThan(0);
  return page.evaluate((id) => window.__items!.state().tableKeys[id]!, stand);
}

test('a wrong name: it laughs, and leaves the key to a room still locked', async ({ page }) => {
  test.setTimeout(60_000);
  const q = await toTheQuestion(page);
  expect(q.options.length).toBeGreaterThanOrEqual(3);
  expect(q.options.map((o) => o.id)).toContain(q.killerId);
  await page.screenshot({ path: 'artifacts/screenshots/21-question.png' });
  const wrong = q.options.find((o) => o.id !== q.killerId)!;
  const keys = await name(page, wrong.name, q.stand);

  const events = await page.evaluate(() => window.__ofrenda!.events());
  expect(events.find((e) => e.name === 'accused')).toMatchObject({ characterId: q.characterId, accusedId: wrong.id, correct: false });
  expect(events.some((e) => e.name === 'spiritLaughed')).toBe(true);
  const locked = await page.evaluate(() => window.__encounter!.keyRooms().filter((k) => k.locked).map((k) => k.keyId));
  expect(keys).not.toContain('key:exit');
  expect(keys.some((k) => locked.includes(k))).toBe(true);
  expect(new Set(keys).size).toBe(keys.length);
  expect(await page.evaluate(() => window.__encounter!.named())).toBe(false);
});

test('the right name: the key to the way out, the dining room, the finale and the ending', async ({ page }) => {
  test.setTimeout(90_000);
  const q = await toTheQuestion(page);
  const killer = q.options.find((o) => o.id === q.killerId)!;
  const keys = await name(page, killer.name, q.stand);
  expect(keys).toContain('key:exit');
  const events = await page.evaluate(() => window.__ofrenda!.events());
  expect(events.find((e) => e.name === 'accused')).toMatchObject({ accusedId: q.killerId, correct: true });
  expect(events.some((e) => e.name === 'exitKeyAwarded')).toBe(true);

  // Take the keys: the dining room appears, locked by the key to the way out.
  expect(await page.evaluate(() => window.__ofrenda!.house.diningRoom())).toBeUndefined();
  await page.evaluate((id) => window.__items!.goTo(id), q.stand);
  await page.keyboard.press('KeyE');
  await expect.poll(() => page.evaluate(() => window.__ofrenda!.house.diningRoom()?.id)).toBe('dining-room');
  const door = await page.evaluate(() => {
    const house = window.__ofrenda!.house;
    const dining = house.diningRoom()!;
    const id = dining.doors.find((d) => house.getDoor(d)?.keyId === 'key:exit')!;
    const d = house.getDoor(id)!;
    return { id, side: dining.cells.includes(d.a) ? ('b' as const) : ('a' as const) };
  });

  // Unlock it with the key and walk in.
  await page.evaluate(({ id, side }) => window.__ofrenda!.standFacingDoor(id, side), door);
  await page.waitForTimeout(300);
  await page.keyboard.press('KeyE');
  await expect.poll(() => page.evaluate((id) => window.__ofrenda!.house.getDoor(id)?.state, door.id)).toBe('open');
  await page.keyboard.down('ArrowUp');
  await expect(page.locator('#dialogue-text')).toContainText('You named the one who did this', { timeout: 10_000 });
  await page.keyboard.up('ArrowUp');
  await page.waitForTimeout(800);
  await page.screenshot({ path: 'artifacts/screenshots/21-finale.png' });
  await next(page);

  const told = await page.evaluate(() => window.__encounter!.toldTheTruth());
  await expect(page.locator('#ending')).toHaveAttribute('data-kind', told ? 'true' : 'escape', { timeout: 8000 });
  await page.waitForTimeout(2500);
  await page.screenshot({ path: 'artifacts/screenshots/21-ending.png' });
  const ending = (await page.evaluate(() => window.__ofrenda!.events())).find((e) => e.name === 'ending');
  expect(ending).toMatchObject({ kind: told ? 'true' : 'escape' });
});
