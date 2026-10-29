import type { Page } from '@playwright/test';
import { next } from './encounter-helpers';
import { expect, test } from './fixtures';

// Spec 22: at six, the patriarch's last question. The right name opens the way home; a wrong one
// traps the player.

async function toDawn(page: Page) {
  await page.route('**/api/tts', (route) => route.fulfill({ status: 503, body: '{}' }));
  await page.goto('/?seed=42&skip=act1&debug=hooks,encounter&mute=1&shadow=0&clock=05:59');
  await page.waitForFunction(() => document.body.dataset.ready === 'true' && Boolean(window.__dawn) && Boolean(window.__encounter));
  await expect(page.locator('#dialogue-text')).toContainText('One last time: who did this to us?', { timeout: 12_000 });
  const accusation = await page.evaluate(() => window.__encounter!.accusation());
  await expect(page.locator('#dialogue-options button')).toHaveCount(accusation.options.length, { timeout: 8000 });
  return accusation;
}

test('the right name at dawn: the house stops, petals lead home, and the front door lets the player out', async ({ page }) => {
  test.setTimeout(60_000);
  const { killerId, options } = await toDawn(page);
  await page.locator('#dialogue-options button', { hasText: options.find((o) => o.id === killerId)!.name }).click();
  await expect(page.locator('#dialogue-text')).toContainText('Ha…', { timeout: 8000 });
  await next(page);
  await expect(page.locator('#dialogue-text')).toContainText('Well done, you found the killer. You are free now.', { timeout: 8000 });
  await next(page);
  await expect.poll(() => page.evaluate(() => window.__dawn!.stage())).toBe('free');

  const answered = (await page.evaluate(() => window.__ofrenda!.events())).find((e) => e.name === 'dawnAnswered');
  expect(answered).toMatchObject({ accusedId: killerId, correct: true });
  expect(await page.evaluate(() => window.__dawn!.petals())).toBeGreaterThan(5);
  expect(await page.evaluate(() => window.__ofrenda!.house.getDoor('d:0,2:E')?.state)).toBe('open');
  expect(await page.evaluate(() => window.__ofrenda!.house.getDoor('front-door')?.state)).toBe('closed');
  await expect(page.locator('#thought')).toHaveText('The front door. I have to find my way back.', { timeout: 8000 });
  await page.keyboard.press('KeyF');
  // Up the corridor the petals follow, back towards the portrait hall.
  await page.evaluate(() => window.__ofrenda!.place(3.75, -5.25, 0));
  await page.keyboard.down('PageDown');
  await page.waitForTimeout(250);
  await page.keyboard.up('PageDown');
  await page.waitForTimeout(600);
  await page.screenshot({ path: 'artifacts/screenshots/22-petals.png' });

  // Out through the front door.
  await page.evaluate(() => window.__ofrenda!.standFacingDoor('front-door', 'a'));
  await page.waitForTimeout(300);
  await page.keyboard.press('KeyE');
  const told = await page.evaluate(() => window.__encounter!.toldTheTruth());
  await expect(page.locator('#ending')).toHaveAttribute('data-kind', told ? 'true' : 'escape', { timeout: 8000 });
  await page.waitForTimeout(2200);
  await page.screenshot({ path: 'artifacts/screenshots/22-free.png' });
});

test('a wrong name at dawn: the player joins the others on the walls', async ({ page }) => {
  const { killerId, options } = await toDawn(page);
  await page.locator('#dialogue-options button', { hasText: options.find((o) => o.id !== killerId)!.name }).click();
  await expect(page.locator('#dialogue-text')).toContainText('Ha…', { timeout: 8000 });
  await next(page);
  await expect(page.locator('#dialogue-text')).toContainText('Too bad, now you join the others who came before you.', { timeout: 8000 });
  await next(page);
  await expect(page.locator('#ending[data-kind="trapped"]')).toBeVisible({ timeout: 8000 });
  await page.waitForTimeout(2200);
  await page.screenshot({ path: 'artifacts/screenshots/22-trapped.png' });
  const answered = (await page.evaluate(() => window.__ofrenda!.events())).find((e) => e.name === 'dawnAnswered');
  expect(answered).toMatchObject({ correct: false });
});
