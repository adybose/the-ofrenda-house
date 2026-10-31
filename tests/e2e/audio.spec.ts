import { expect, test } from './fixtures';

test('every named sound renders offline: not silent, no NaN, peak at or below 1.0', async ({ page }) => {
  await page.goto('/?seed=42&debug=hooks&mute=1');
  await page.waitForFunction(() => document.body.dataset.ready === 'true' && Boolean(window.__ofrenda));
  const names = await page.evaluate(() => window.__ofrenda!.soundNames());
  for (const sound of ['rain', 'wind', 'thunder', 'creak', 'slam', 'lock', 'unlock', 'footstepWood', 'footstepTile', 'footstepCarpet', 'flashlightClick', 'clock', 'clockTick', 'splat', 'stinger', 'whisper', 'bat', 'rat', 'cat', 'catScream', 'heartbeat', 'pulse', 'laugh', 'shatter', 'gust']) {
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

test('the rain stands well above the wind, overhead thunder opens with a loud crack, the stinger is a heavy piano slam', async ({ page }) => {
  await page.goto('/?seed=42&debug=hooks&mute=1');
  await page.waitForFunction(() => document.body.dataset.ready === 'true' && Boolean(window.__ofrenda));
  const render = (name: string, param?: number) =>
    page.evaluate(([n, p]) => window.__ofrenda!.renderSound(n as never, p as number | undefined), [name, param] as const);
  const rain = await render('rain');
  const wind = await render('wind');
  expect(rain.rms).toBeGreaterThan(wind.rms * 3);
  // The first half second of a close strike: was 0.31 when it opened with a faint clap.
  const overhead = await render('thunder', 0.95);
  expect(overhead.onsetRms).toBeGreaterThan(0.45);
  // The stinger (spec 25): a low piano cluster slammed down, heavy, loudest at once, ringing out.
  const stinger = await render('stinger');
  expect((stinger.lowRms / stinger.rms) ** 2, 'share of energy under 150 Hz').toBeGreaterThan(0.4);
  const loudest = stinger.envelope.indexOf(Math.max(...stinger.envelope));
  expect(loudest * 0.05, 'loudest at the attack').toBeLessThan(0.25);
  expect(stinger.onsetRms).toBeGreaterThan(0.05);
  expect(stinger.audibleFor).toBeGreaterThan(2.5);
  expect(stinger.audibleFor).toBeLessThan(6);
});

test('overhead thunder fades gradually and long; the slam is a short, sharp wooden thud', async ({ page }) => {
  await page.goto('/?seed=42&debug=hooks&mute=1');
  await page.waitForFunction(() => document.body.dataset.ready === 'true' && Boolean(window.__ofrenda));
  const thunder = await page.evaluate(() => window.__ofrenda!.renderSound('thunder', 0.95));
  expect(thunder.audibleFor).toBeGreaterThan(6);
  // Half-second windows from 0.5 s to 6 s: none falls under 40% of the one before.
  const fall = thunder.windows.slice(1, 12);
  for (let i = 1; i < fall.length; i++) expect(fall[i]!, `window ${i + 1}`).toBeGreaterThan(fall[i - 1]! * 0.4);
  // A wooden door, not a plucked string (rang on) or a bass drum (87% bass, 0.55 s): short and sharp,
  // and a little deeper than the first wooden version (57% bass).
  const slam = await page.evaluate(() => window.__ofrenda!.renderSound('slam'));
  expect(slam.audibleFor).toBeLessThan(0.2);
  expect(slam.envelope.indexOf(Math.max(...slam.envelope))).toBe(0);
  expect(slam.lowRms).toBeGreaterThan(slam.rms * 0.6);
  expect(slam.lowRms).toBeLessThan(slam.rms * 0.85);
  expect(slam.peak).toBeGreaterThan(0.6);
});

/** After its loudest moment, a sound only fades: no frame more than 15% above the one before. */
function tapers(envelope: number[], audibleFor: number): void {
  const frames = envelope.slice(0, Math.ceil(audibleFor / 0.05));
  const top = frames.indexOf(Math.max(...frames));
  for (let i = top + 1; i < frames.length; i++) expect(frames[i]!, `frame ${i}`).toBeLessThanOrEqual(frames[i - 1]! * 1.15);
}

test('the cats sound like voices: the meow tapers away; the scream is a shrill meow, not a whistle or a chainsaw', async ({ page }) => {
  await page.goto('/?seed=42&debug=hooks&mute=1');
  await page.waitForFunction(() => document.body.dataset.ready === 'true' && Boolean(window.__ofrenda));
  // Spectral flatness: the whistling cats were 0.001 to 0.002, the chainsaw scream 0.15; rain is 0.55.
  const meow = await page.evaluate(() => window.__ofrenda!.renderSound('cat'));
  expect(meow.flatness).toBeGreaterThan(0.004);
  expect(meow.flatness).toBeLessThan(0.1);
  tapers(meow.envelope, meow.audibleFor);
  // Shriller: brighter than the 1326 Hz centroid it had.
  expect(meow.centroid).toBeGreaterThan(1326 * 1.15);
  const frames = meow.envelope.slice(0, Math.ceil(meow.audibleFor / 0.05));
  expect(Math.max(...frames.slice(Math.floor(frames.length * 0.75)))).toBeLessThan(Math.max(...frames) * 0.35);

  const scream = await page.evaluate(() => window.__ofrenda!.renderSound('catScream'));
  expect(scream.peak).toBeGreaterThan(0.5);
  expect(scream.flatness).toBeGreaterThan(0.004);
  expect(scream.flatness).toBeLessThan(0.05);
  const cry = scream.envelope.slice(0, Math.ceil(scream.audibleFor / 0.05));
  expect(cry.indexOf(Math.max(...cry))).toBeLessThan(cry.length / 3);
  tapers(scream.envelope, scream.audibleFor);
  // Shriller: brighter than the 2415 Hz centroid it had.
  expect(scream.centroid).toBeGreaterThan(2415 * 1.15);
});

test('carpet footsteps are soft but heard, and every whisper version plays', async ({ page }) => {
  await page.goto('/?seed=42&debug=hooks&mute=1');
  await page.waitForFunction(() => document.body.dataset.ready === 'true' && Boolean(window.__ofrenda));
  // Was 0.106.
  expect((await page.evaluate(() => window.__ofrenda!.renderSound('footstepCarpet'))).peak).toBeGreaterThan(0.2);
  for (let version = 1; version <= 6; version++) {
    const stats = await page.evaluate((v) => window.__ofrenda!.renderSound('whisper', v), version);
    expect(stats.hasNaN, `whisper ${version}`).toBe(false);
    expect(stats.peak, `whisper ${version} is silent`).toBeGreaterThan(0.05);
    expect(stats.peak, `whisper ${version} clips`).toBeLessThanOrEqual(1);
  }
});
