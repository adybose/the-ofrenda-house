import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';

// Spec 25: scare tuning.

async function open(page: Page, query: string) {
  await page.route('**/api/tts', (route) => route.fulfill({ status: 503, body: '{}' }));
  await page.route('**/api/shadow/taunt', (route) => route.fulfill({ status: 503, body: '{}' }));
  await page.goto(`/?seed=42&skip=act1&mute=1&${query}`);
  await page.waitForFunction(() => document.body.dataset.ready === 'true' && Boolean(window.__ofrenda));
}

test('a jump scare brings the suspense score in', async ({ page }) => {
  await open(page, 'debug=hooks,scares&shadow=0');
  await page.mouse.click(400, 300);
  await expect.poll(() => page.evaluate(() => window.__ofrenda!.audioState())).toBe('running');
  expect((await page.evaluate(() => window.__ofrenda!.audioLevels())).score.drone).toBeLessThan(0.005);
  await page.evaluate(() => window.__scares!.fire('bat'));
  await expect.poll(() => page.evaluate(() => window.__ofrenda!.audioLevels().score.drone), { timeout: 5000 }).toBeGreaterThan(0.02);
  await expect.poll(() => page.evaluate(() => window.__ofrenda!.audioLevels().score.strings), { timeout: 5000 }).toBeGreaterThan(0.002);
});
