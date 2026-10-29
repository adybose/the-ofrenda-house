import { expect, test } from './fixtures';

test('the ghost voice chains render a test WAV offline: not silent, no NaN, no clipping, no static', async ({ page }) => {
  await page.goto('/?seed=42&debug=hooks&mute=1');
  await page.waitForFunction(() => document.body.dataset.ready === 'true' && Boolean(window.__ofrenda));
  const flatness: Record<string, number> = {};
  for (const kind of ['spirit', 'shadow'] as const) {
    const stats = await page.evaluate((k) => window.__ofrenda!.renderGhostVoice(k), kind);
    flatness[kind] = stats.flatness;
    expect(stats.hasNaN, kind).toBe(false);
    expect(stats.rms, `${kind} is silent`).toBeGreaterThan(0.01);
    expect(stats.peak, `${kind} clips`).toBeLessThanOrEqual(1);
    console.log(`${kind}: peak ${stats.peak.toFixed(3)} rms ${stats.rms.toFixed(4)} flatness ${stats.flatness.toFixed(4)}`);
  }
  // La Sombra's old breath layer sounded like radio static: its voice must be no noisier than a spirit's.
  expect(flatness.shadow!).toBeLessThanOrEqual(Math.max(flatness.spirit! * 1.5, 0.01));
});
