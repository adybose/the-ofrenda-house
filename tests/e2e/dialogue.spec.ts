import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';

const LONG = 'Who walks in my house on the night of the dead? Closer, stranger, and tell me why you are here, and what you have brought with you.';

async function open(page: Page, extra = '') {
  await page.goto(`/?seed=42&debug=dialogue,hooks&demo=0&mute=1${extra}`);
  await page.waitForFunction(() => document.body.dataset.ready === 'true' && Boolean(window.__dialogue));
}

const text = (page: Page) => page.locator('#dialogue-text').innerText();

test('a line types out progressively', async ({ page }) => {
  await open(page);
  await page.evaluate((line) => window.__dialogue!.say('Doña Esperanza', line), LONG);
  await page.waitForTimeout(250);
  const first = (await text(page)).length;
  await page.screenshot({ path: 'artifacts/screenshots/dialogue-typing-1.png' });
  await page.waitForTimeout(400);
  const second = (await text(page)).length;
  await page.screenshot({ path: 'artifacts/screenshots/dialogue-typing-2.png' });
  expect(first).toBeGreaterThan(0);
  expect(second).toBeGreaterThan(first);
  expect(second).toBeLessThan(LONG.length);
  await expect(page.locator('#dialogue-speaker')).toHaveText('Doña Esperanza');
  // Space shows the rest at once.
  await page.keyboard.press('Space');
  await expect(page.locator('#dialogue-text')).toHaveText(LONG);
});

test('number keys choose, but only once the line has finished typing; a click chooses too', async ({ page }) => {
  await open(page);
  await page.evaluate((line) => window.__dialogue!.ask(line, ['First answer', 'Second answer', 'Third answer']), LONG);
  // Mid-typewriter: ignored.
  await page.keyboard.press('Digit1');
  await page.waitForTimeout(100);
  expect(await page.evaluate(() => window.__dialogue!.picked())).toBeUndefined();
  await expect(page.locator('#dialogue-options button')).toHaveCount(3, { timeout: 8000 });
  await page.screenshot({ path: 'artifacts/screenshots/dialogue-choices.png' });
  await page.keyboard.press('Digit2');
  await expect.poll(() => page.evaluate(() => window.__dialogue!.picked())).toBe('1');

  await page.evaluate(() => window.__dialogue!.ask('Well?', ['Yes', 'No', 'Perhaps', 'Never']));
  await expect(page.locator('#dialogue-options button')).toHaveCount(4, { timeout: 5000 });
  await page.locator('#dialogue-options button').nth(2).click();
  await expect.poll(() => page.evaluate(() => window.__dialogue!.picked())).toBe('2');
});

test('with /api/tts answering 503, a spoken line still appears in full', async ({ page }) => {
  await page.route('**/api/tts', (route) => route.fulfill({ status: 503, body: '{"error":"speech unavailable"}' }));
  await open(page);
  await page.mouse.click(400, 300);
  await page.evaluate(() => window.__dialogue!.say('Severo Santibáñez', 'Who walks in my house?', true));
  await expect(page.locator('#dialogue-text')).toHaveText('Who walks in my house?', { timeout: 5000 });
  await expect(page.locator('#dialogue-more')).toBeVisible();
});

test('arrow keys do not move the player while dialogue is open', async ({ page }) => {
  await open(page, '&skip=prologue');
  const before = await page.evaluate(() => window.__ofrenda!.player());
  await page.evaluate(() => window.__dialogue!.say('Don Emilio', 'Stand still.'));
  await page.keyboard.down('ArrowUp');
  await page.waitForTimeout(700);
  await page.keyboard.up('ArrowUp');
  const during = await page.evaluate(() => window.__ofrenda!.player());
  expect([during.x, during.z]).toEqual([before.x, before.z]);
  // And once it closes, they walk again: the test above means something.
  await page.evaluate(() => window.__dialogue!.close());
  await page.keyboard.down('ArrowUp');
  await page.waitForTimeout(700);
  await page.keyboard.up('ArrowUp');
  const after = await page.evaluate(() => window.__ofrenda!.player());
  expect(Math.hypot(after.x - before.x, after.z - before.z)).toBeGreaterThan(0.3);
});

test('J opens the journal with clue cards grouped by kind, a card can be doubted, J closes it', async ({ page }) => {
  await open(page, '&skip=prologue');
  await page.evaluate(() => window.__dialogue!.giveClues());
  await page.keyboard.press('KeyJ');
  await expect(page.locator('#journal')).toBeVisible();
  for (const kind of ['motive', 'means', 'opportunity', 'alibi']) {
    const cards = page.locator(`#journal [data-kind="${kind}"] .clue-card`);
    expect(await cards.count(), kind).toBeGreaterThan(0);
  }
  await expect(page.locator('#journal .met li')).not.toHaveCount(0);
  await expect(page.locator('#journal .keys li')).toHaveCount(1);
  const card = page.locator('#journal .clue-card').first();
  await card.click();
  await expect(card).toHaveClass(/doubted/);
  await page.screenshot({ path: 'artifacts/screenshots/journal.png' });
  expect(await page.evaluate(() => window.__dialogue!.paused())).toBe(true);
  await page.keyboard.press('KeyJ');
  await expect(page.locator('#journal')).toBeHidden();
  expect(await page.evaluate(() => window.__dialogue!.paused())).toBe(false);
});

test('a clue card toast does not cover the choices', async ({ page }) => {
  await open(page);
  await page.evaluate(() => window.__dialogue!.ask('Take it.', ['Thank you', 'No', 'Why?']));
  await expect(page.locator('#dialogue-options button')).toHaveCount(3, { timeout: 5000 });
  await page.evaluate(() => window.__dialogue!.giveClues(1));
  const toast = await page.locator('#clue-toast').boundingBox();
  const options = await page.locator('#dialogue-options').boundingBox();
  expect(toast && options).toBeTruthy();
  expect(toast!.y + toast!.height).toBeLessThan(options!.y);
  await page.screenshot({ path: 'artifacts/screenshots/dialogue-clue-toast.png' });
});

test('a Journal button opens the journal, shows a dot for a new clue, and the clue pop-up points to the journal', async ({ page }) => {
  await open(page, '&skip=prologue');
  const button = page.locator('#journal-button');
  await expect(button).toBeVisible();
  await expect(button).toContainText('Journal (J)');
  await expect(page.locator('#journal-button .badge')).toBeHidden();
  await page.evaluate(() => window.__dialogue!.giveClues(1));
  await expect(page.locator('#clue-toast')).toContainText('Kept in your journal (J)');
  await expect(page.locator('#journal-button .badge')).toBeVisible();
  await page.screenshot({ path: 'artifacts/screenshots/journal-button.png' });
  await button.click();
  await expect(page.locator('#journal')).toBeVisible();
  await expect(button).toBeHidden();
  await page.keyboard.press('KeyJ');
  await expect(page.locator('#journal')).toBeHidden();
  await expect(button).toBeVisible();
  await expect(page.locator('#journal-button .badge')).toBeHidden();
});
