import { NEAR_BLACK, expect, imageStats, test } from './fixtures';

test('boots to a full-window near-black canvas with no console errors', async ({ page, consoleErrors }) => {
  await page.goto('/');
  const canvas = page.locator('canvas');
  await expect(canvas).toHaveCount(1);
  await page.waitForFunction(() => document.body.dataset.ready === 'true');

  const viewport = page.viewportSize();
  const box = await canvas.boundingBox();
  expect(box).toEqual({ x: 0, y: 0, width: viewport?.width, height: viewport?.height });

  const screenshot = await page.screenshot({ path: 'artifacts/screenshots/00-boot.png' });
  expect(screenshot.byteLength).toBeGreaterThan(0);

  // The house is near-black at the start: ambient light is faint (spec 06) and the flashlight starts off.
  const { all } = await imageStats(page, screenshot);
  expect(all!.mean).toBeLessThanOrEqual(NEAR_BLACK.mean);
  expect(all!.p99).toBeLessThanOrEqual(NEAR_BLACK.p99);

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
