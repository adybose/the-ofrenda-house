import { expect, test } from './fixtures';

test('every named sound renders offline: not silent, no NaN, peak at or below 1.0', async ({ page }) => {
  await page.goto('/?seed=42&debug=hooks&mute=1');
  await page.waitForFunction(() => document.body.dataset.ready === 'true' && Boolean(window.__ofrenda));
  const names = await page.evaluate(() => window.__ofrenda!.soundNames());
  for (const sound of ['rain', 'wind', 'thunder', 'creak', 'slam', 'lock', 'unlock', 'footstepWood', 'footstepTile', 'footstepCarpet', 'flashlightClick', 'clock', 'clockTick', 'splat', 'stinger', 'whisper', 'bat', 'rat', 'cat', 'heartbeat']) {
    expect(names).toContain(sound);
  }
  for (const name of names) {
    const stats = await page.evaluate((n) => window.__ofrenda!.renderSound(n), name);
    expect(stats.hasNaN, name).toBe(false);
    expect(stats.peak, `${name} is silent`).toBeGreaterThan(0.01);
    expect(stats.peak, `${name} clips`).toBeLessThanOrEqual(1);
  }
});

test('the AudioContext is not running before the first click, and is after it', async ({ page }) => {
  await page.goto('/?seed=42&debug=hooks&mute=1');
  await page.waitForFunction(() => document.body.dataset.ready === 'true' && Boolean(window.__ofrenda));
  expect(await page.evaluate(() => window.__ofrenda!.audioState())).not.toBe('running');
  await page.mouse.click(400, 300);
  await expect.poll(() => page.evaluate(() => window.__ofrenda!.audioState())).toBe('running');
});

test('the ambience ducks while a voice plays', async ({ page }) => {
  await page.goto('/?seed=42&debug=hooks&mute=1');
  await page.waitForFunction(() => document.body.dataset.ready === 'true' && Boolean(window.__ofrenda));
  await page.mouse.click(400, 300);
  await expect.poll(() => page.evaluate(() => window.__ofrenda!.audioState())).toBe('running');
  await page.waitForTimeout(300);
  const before = await page.evaluate(() => window.__ofrenda!.ambienceGain());
  expect(before).toBeGreaterThan(0.9);
  await page.evaluate(() => window.__ofrenda!.testVoice(1.5));
  await expect.poll(() => page.evaluate(() => window.__ofrenda!.ambienceGain()), { timeout: 2000 }).toBeLessThan(0.6);
  await expect.poll(() => page.evaluate(() => window.__ofrenda!.ambienceGain()), { timeout: 5000 }).toBeGreaterThan(0.9);
});

test('?mute=1 keeps the master gain at 0', async ({ page }) => {
  await page.goto('/?seed=42&debug=hooks&mute=1');
  await page.waitForFunction(() => document.body.dataset.ready === 'true' && Boolean(window.__ofrenda));
  await page.mouse.click(400, 300);
  await expect.poll(() => page.evaluate(() => window.__ofrenda!.audioState())).toBe('running');
  expect(await page.evaluate(() => window.__ofrenda!.masterGain())).toBe(0);
});

test('the storm is quieter inside than out, and so is the thunder', async ({ page }) => {
  await page.goto('/?seed=42&debug=hooks&mute=1');
  await page.waitForFunction(() => document.body.dataset.ready === 'true' && Boolean(window.__ofrenda));
  await page.mouse.click(400, 300);
  await expect.poll(() => page.evaluate(() => window.__ofrenda!.audioState())).toBe('running');
  // The game starts outside (spec 16): the storm at full strength.
  await expect.poll(() => page.evaluate(() => window.__ofrenda!.audioLevels().storm)).toBeGreaterThan(0.9);
  const outside = await page.evaluate(() => window.__ofrenda!.audioLevels());
  await page.evaluate(() => window.__ofrenda!.setOutdoors(false));
  await expect.poll(() => page.evaluate(() => window.__ofrenda!.audioLevels().storm), { timeout: 5000 }).toBeLessThan(outside.storm / 2);
  const inside = await page.evaluate(() => window.__ofrenda!.audioLevels());
  expect(inside.thunder).toBeLessThan(outside.thunder);
  expect(inside.thunder).toBeGreaterThan(0.4);
});

test('the grandfather clock ticks while the player is in its room, and stops outside it', async ({ page }) => {
  await page.goto('/?seed=42&debug=hooks&mute=1&skip=prologue');
  await page.waitForFunction(() => document.body.dataset.ready === 'true' && Boolean(window.__ofrenda));
  await page.mouse.click(400, 300);
  await expect.poll(() => page.evaluate(() => window.__ofrenda!.audioState())).toBe('running');
  await expect.poll(() => page.evaluate(() => window.__ofrenda!.ticking())).toBe(true);
  // Into the portrait hall, through the archway.
  await page.evaluate(() => window.__ofrenda!.place(11.25, -12, 0));
  await expect.poll(() => page.evaluate(() => window.__ofrenda!.ticking())).toBe(false);
  await page.evaluate(() => window.__ofrenda!.place(11.25, -3, 0));
  await expect.poll(() => page.evaluate(() => window.__ofrenda!.ticking())).toBe(true);
});
