import { expect, test } from './fixtures';

test('boots to a full-window black canvas with no console errors', async ({ page, consoleErrors }) => {
  await page.goto('/');
  const canvas = page.locator('canvas');
  await expect(canvas).toHaveCount(1);
  await page.waitForFunction(() => document.body.dataset.ready === 'true');

  const viewport = page.viewportSize();
  const box = await canvas.boundingBox();
  expect(box).toEqual({ x: 0, y: 0, width: viewport?.width, height: viewport?.height });

  const screenshot = await page.screenshot({ path: 'artifacts/screenshots/00-boot.png' });
  expect(screenshot.byteLength).toBeGreaterThan(0);

  // Decode the screenshot in the page and check every pixel is black.
  const brightest = await page.evaluate(async (base64) => {
    const image = new Image();
    image.src = `data:image/png;base64,${base64}`;
    await image.decode();
    const probe = document.createElement('canvas');
    probe.width = image.width;
    probe.height = image.height;
    const context = probe.getContext('2d');
    if (!context) throw new Error('no 2d context');
    context.drawImage(image, 0, 0);
    const { data } = context.getImageData(0, 0, image.width, image.height);
    let max = 0;
    for (let i = 0; i < data.length; i += 4) {
      max = Math.max(max, data[i] ?? 0, data[i + 1] ?? 0, data[i + 2] ?? 0);
    }
    return max;
  }, screenshot.toString('base64'));
  expect(brightest).toBe(0);

  expect(consoleErrors).toEqual([]);
});

test('canvas follows the window when it is resized', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => document.body.dataset.ready === 'true');
  await page.setViewportSize({ width: 800, height: 450 });
  await expect
    .poll(async () => page.locator('canvas').boundingBox())
    .toEqual({ x: 0, y: 0, width: 800, height: 450 });
  const aspect = await page.evaluate(() => document.body.dataset.cameraAspect);
  expect(Number(aspect)).toBeCloseTo(800 / 450, 3);
});
