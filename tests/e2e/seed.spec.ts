import { expect, test } from './fixtures';

test('uses ?seed= from the URL as the run seed', async ({ page }) => {
  await page.goto('/?seed=42');
  await page.waitForFunction(() => document.body.dataset.ready === 'true');
  expect(await page.evaluate(() => document.body.dataset.seed)).toBe('42');
});

test('logs a fresh seed when the URL has none, so the run can be replayed', async ({ page }) => {
  const logs: string[] = [];
  page.on('console', (message) => logs.push(message.text()));
  await page.goto('/');
  await page.waitForFunction(() => document.body.dataset.ready === 'true');
  const seed = await page.evaluate(() => document.body.dataset.seed);
  expect(seed).toMatch(/^\d+$/);
  expect(logs.some((line) => line.includes(`?seed=${seed}`))).toBe(true);
});
