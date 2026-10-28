import type { Page } from '@playwright/test';
import { expect, imageStats, test } from './fixtures';

type Kind = 'filler' | 'key' | 'corridor';

async function boot(page: Page, query: string) {
  await page.goto(`/?seed=42&${query}`);
  await page.waitForFunction(() => document.body.dataset.ready === 'true' && Boolean(window.__ofrenda));
}

/** Mean brightness (0-255) of a screenshot. */
async function brightness(page: Page, png: Buffer): Promise<number> {
  return (await imageStats(page, png)).all!.mean;
}

for (const kind of ['filler', 'key', 'corridor'] as Kind[]) {
  test(`renders a ${kind} room in fullbright`, async ({ page, consoleErrors }) => {
    await boot(page, 'debug=fullbright');
    const found = await page.evaluate((k) => window.__ofrenda!.viewRoom(k), kind);
    expect(found, `no ${kind} room found`).toBeTruthy();
    await page.evaluate(() => window.__ofrenda!.frames(3));
    const png = await page.screenshot({ path: `artifacts/screenshots/04-${kind}.png` });
    expect(await brightness(page, png)).toBeGreaterThan(25);
    expect(consoleErrors).toEqual([]);
  });
}

test('returns to the same GPU memory after walking away from chunks and back', async ({ page }) => {
  await boot(page, 'debug=fullbright');
  const baseline = await page.evaluate(async () => {
    const o = window.__ofrenda!;
    o.moveTo(o.house.startCell);
    await o.frames(3);
    return o.memory();
  });
  const away = await page.evaluate(async () => {
    const o = window.__ofrenda!;
    o.moveTo('300,300');
    await o.frames(3);
    return o.memory();
  });
  const back = await page.evaluate(async () => {
    const o = window.__ofrenda!;
    o.moveTo(o.house.startCell);
    await o.frames(3);
    return o.memory();
  });
  expect(away).not.toEqual(baseline);
  expect(back).toEqual(baseline);
});

test('draws a typical room in at most 150 draw calls', async ({ page }) => {
  await boot(page, 'debug=fullbright');
  await page.evaluate((k) => window.__ofrenda!.viewRoom(k), 'filler' as Kind);
  const calls = await page.evaluate(async () => {
    await window.__ofrenda!.frames(2);
    return window.__ofrenda!.drawCalls();
  });
  expect(calls).toBeGreaterThan(0);
  expect(calls).toBeLessThanOrEqual(150);
});

test('shows a sheet of every portrait and variant', async ({ page, consoleErrors }) => {
  await page.goto('/?seed=42&debug=portraits');
  await page.waitForFunction(() => document.body.dataset.portraitsReady === 'true');
  await page.screenshot({ path: 'artifacts/screenshots/04-portraits.png' });
  expect(consoleErrors).toEqual([]);
});
