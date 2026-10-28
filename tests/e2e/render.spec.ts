import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';

type Kind = 'filler' | 'key' | 'corridor';

async function boot(page: Page, query: string) {
  await page.goto(`/?seed=42&${query}`);
  await page.waitForFunction(() => document.body.dataset.ready === 'true' && Boolean(window.__ofrenda));
}

/** Mean brightness (0-255) of a screenshot, decoded in the page. */
async function brightness(page: Page, png: Buffer): Promise<number> {
  return page.evaluate(async (base64) => {
    const image = new Image();
    image.src = `data:image/png;base64,${base64}`;
    await image.decode();
    const canvas = document.createElement('canvas');
    canvas.width = image.width;
    canvas.height = image.height;
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(image, 0, 0);
    const { data } = ctx.getImageData(0, 0, image.width, image.height);
    let sum = 0;
    for (let i = 0; i < data.length; i += 4) sum += (data[i]! + data[i + 1]! + data[i + 2]!) / 3;
    return sum / (data.length / 4);
  }, png.toString('base64'));
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
