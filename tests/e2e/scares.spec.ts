import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';

// Spec 13: a bat, a rat and a cat burst out of the dark with a stinger; a forced scare ignores the
// cooldown.

async function boot(page: Page) {
  await page.goto('/?seed=42&skip=act1&debug=hooks,scares&mute=1&shadow=0');
  await page.waitForFunction(() => document.body.dataset.ready === 'true' && Boolean(window.__scares));
  await page.addStyleTag({ content: '#thought { visibility: hidden !important; }' });
  await page.evaluate(() => window.__ofrenda!.viewRoom('filler'));
  await page.keyboard.press('KeyF');
  await page.evaluate(() => window.__ofrenda!.frames(5));
}

for (const [kind, call, wait] of [
  ['bat', 'bat', 250],
  ['rat', 'rat', 250],
  ['cat', 'catScream', 400],
] as const) {
  test(`a ${kind} bursts out, mid-flight, with a stinger and its call`, async ({ page, consoleErrors }) => {
    await boot(page);
    if (kind !== 'bat') {
      // Look down at the floor ahead, into the beam.
      await page.keyboard.down('PageDown');
      await page.waitForTimeout(200);
      await page.keyboard.up('PageDown');
    }
    expect(await page.evaluate((k) => window.__scares!.fire(k), kind)).toBe(true);
    await page.waitForTimeout(wait);
    expect(await page.evaluate(() => window.__scares!.active())).toBeGreaterThanOrEqual(1);
    await page.screenshot({ path: `artifacts/screenshots/13-${kind}.png` });
    const fired = (await page.evaluate(() => window.__ofrenda!.events())).findLast((e) => e.name === 'scareFired');
    expect(fired).toMatchObject({ kind, sounds: ['stinger', call] });
    await expect.poll(() => page.evaluate(() => window.__scares!.active()), { timeout: 4000 }).toBe(0);
    expect(consoleErrors).toEqual([]);
  });
}

test('the cooldown holds back the next scare, but a story script can force one', async ({ page }) => {
  await boot(page);
  const before = (await page.evaluate(() => window.__ofrenda!.events())).filter((e) => e.name === 'scareFired').length;
  expect(await page.evaluate(() => window.__scares!.fire('bat'))).toBe(true);
  expect(await page.evaluate(() => window.__scares!.trip('rat'))).toBe(false);
  expect(await page.evaluate(() => window.__scares!.fire('cat', true))).toBe(true);
  const kinds = (await page.evaluate(() => window.__ofrenda!.events())).filter((e) => e.name === 'scareFired').map((e) => e.kind);
  expect(kinds.slice(before)).toEqual(['bat', 'cat']);
});

test('a creature hiding in a room bursts out when the player comes in and turns the torch on it', async ({ page }) => {
  await boot(page);
  await expect.poll(async () => (await page.evaluate(() => window.__ofrenda!.events())).some((e) => e.name === 'scareFired'), { timeout: 3000 }).toBe(true);
  const fired = (await page.evaluate(() => window.__ofrenda!.events())).find((e) => e.name === 'scareFired')!;
  const triggers = await page.evaluate(() => window.__scares!.triggers());
  const [x, , z] = fired.position as [number, number, number];
  // It came from one of the triggers placed in the room, not from a script.
  expect(triggers.some((t) => t.kind === fired.kind && Math.abs(t.x - x) < 1e-6 && Math.abs(t.z - z) < 1e-6)).toBe(true);
});
