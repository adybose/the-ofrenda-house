import { NEAR_BLACK, expect, imageStats, test } from './fixtures';

test('boots to a full-window, dim night exterior with no console errors', async ({ page, consoleErrors }) => {
  await page.goto('/?mute=1');
  const canvas = page.locator('canvas');
  await expect(canvas).toHaveCount(1);
  await page.waitForFunction(() => document.body.dataset.ready === 'true');

  const viewport = page.viewportSize();
  const box = await canvas.boundingBox();
  expect(box).toEqual({ x: 0, y: 0, width: viewport?.width, height: viewport?.height });

  // Normal play opens on the title screen (spec 14); past it, the exterior.
  await page.locator('#title').click();
  await page.waitForTimeout(300);
  const screenshot = await page.screenshot({ path: 'artifacts/screenshots/00-boot.png' });
  expect(screenshot.byteLength).toBeGreaterThan(0);

  // The game opens outside the mansion at night (spec 16): dim, but not black.
  const { all } = await imageStats(page, screenshot);
  expect(all!.mean).toBeGreaterThan(NEAR_BLACK.mean);
  expect(all!.mean).toBeLessThan(90);

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
