import { expect, test } from './fixtures';

test('?debug=map draws a top-down map of the house', async ({ page, consoleErrors }) => {
  await page.goto('/?seed=42&debug=map');
  await page.waitForFunction(() => document.body.dataset.mapReady === 'true');
  const coloured = await page.evaluate(() => {
    const canvas = document.querySelector<HTMLCanvasElement>('#debug-map');
    const data = canvas?.getContext('2d')?.getImageData(0, 0, canvas.width, canvas.height).data;
    let count = 0;
    for (let i = 0; data && i < data.length; i += 4) if ((data[i] ?? 0) + (data[i + 1] ?? 0) + (data[i + 2] ?? 0) > 60) count++;
    return count;
  });
  expect(coloured).toBeGreaterThan(10_000);
  await page.screenshot({ path: 'artifacts/screenshots/03-map.png' });
  expect(consoleErrors).toEqual([]);
});
