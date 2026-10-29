import type { Page } from '@playwright/test';
import { mockModel, winEncounter } from './encounter-helpers';
import { expect, test } from './fixtures';

// Spec 20: the stranger's thoughts, low on the screen, as hints; never during an encounter.

async function boot(page: Page) {
  await page.goto('/?seed=42&skip=act1&debug=hooks,items,encounter&mute=1&shadow=0');
  await page.waitForFunction(() => document.body.dataset.ready === 'true' && Boolean(window.__items) && Boolean(window.__encounter));
}

const thought = (page: Page) => page.locator('#thought');

test('at the dead end: a thought about a candle, then, by the stand, one about the candle and matches', async ({ page, consoleErrors }) => {
  await boot(page);
  await expect(thought(page)).toHaveText('There must be a candle somewhere here.', { timeout: 5000 });
  await page.evaluate(() => window.__items!.goTo('stand:act1-corridor'));
  await expect(thought(page)).toHaveText('A candle, and matches. Might come in handy.', { timeout: 8000 });
  await page.screenshot({ path: 'artifacts/screenshots/20-thought.png' });
  // The first thought comes before the debug log is installed; the second is logged.
  const shown = (await page.evaluate(() => window.__ofrenda!.events())).filter((e) => e.name === 'thoughtShown').map((e) => e.id);
  expect(shown).toContain('seeCandle');
  expect(consoleErrors).toEqual([]);
});

test('no thought shows while a spirit speaks; afterwards, the candle that lit itself', async ({ page }) => {
  test.setTimeout(60_000);
  let answer = '';
  await mockModel(page, () => answer);
  await boot(page);
  const room = await page.evaluate(() => {
    const k = window.__encounter!.keyRooms().find((r) => !r.locked && r.doorId && window.__encounter!.clueCount(r.characterId) > 0)!;
    return { characterId: k.characterId, doorId: k.doorId! };
  });
  answer = await page.evaluate((id) => window.__encounter!.riddleAnswer(id), room.characterId);
  // Let the first thought finish, so anything shown later came while the encounter could have run.
  await page.waitForTimeout(5000);

  const during: string[] = [];
  const watch = setInterval(() => {
    void page
      .evaluate(() => (window.__encounter!.active() ? [getComputedStyle(document.getElementById('thought')!).opacity, document.getElementById('thought')!.dataset.id ?? ''] : undefined))
      .then((seen) => {
        if (seen && Number(seen[0]) > 0.05) during.push(seen[1]!);
      })
      .catch(() => undefined);
  }, 150);
  await winEncounter(page, room.doorId);
  clearInterval(watch);
  expect(during).toEqual([]);
  const shownDuring = await page.evaluate(() => {
    const log = window.__ofrenda!.events();
    const start = log.findIndex((e) => e.name === 'encounterActive' && e.active === true);
    const end = log.findIndex((e, i) => i > start && e.name === 'encounterActive' && e.active === false);
    return log.slice(start, end).filter((e) => e.name === 'thoughtShown').map((e) => e.id);
  });
  expect(shownDuring).toEqual([]);
  await expect(thought(page)).toHaveText("Its candle lit by itself. La Sombra won't come in while it burns.", { timeout: 10_000 });
});
