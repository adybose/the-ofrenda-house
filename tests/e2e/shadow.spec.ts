import type { Page } from '@playwright/test';
import { mockModel, winEncounter } from './encounter-helpers';
import { expect, test } from './fixtures';

// Spec 12: La Sombra chases a player in the dark, confronts one with light, never enters a lit
// sanctuary, catches a player it reaches in the dark (after spec 26's 1.5 s grasp), and brings a chandelier down ahead of them.

async function boot(page: Page, debug = 'hooks,shadow,items') {
  // Never the real model or Piper: its taunts fall back to the hand-written ones.
  await page.route('**/api/shadow/taunt', (route) => route.fulfill({ status: 503, body: '{}' }));
  await page.route('**/api/tts', (route) => route.fulfill({ status: 503, body: '{}' }));
  await page.goto(`/?seed=42&skip=act1&debug=${debug}&mute=1`);
  await page.waitForFunction(() => document.body.dataset.ready === 'true' && Boolean(window.__shadow));
}

const distance = (page: Page) => page.evaluate(() => window.__shadow!.distance());
const mode = (page: Page) => page.evaluate(() => window.__shadow!.mode());

/** Turns the player to face La Sombra. */
async function face(page: Page) {
  await page.evaluate(() => {
    const [sx, sz] = window.__shadow!.position();
    const p = window.__ofrenda!.player();
    window.__ofrenda!.place(p.x, p.z, Math.atan2(-(sx - p.x), -(sz - p.z)));
  });
}

test('in the dark it closes in', async ({ page }) => {
  await boot(page);
  expect(await page.evaluate(() => window.__ofrenda!.flashlight().on)).toBe(false);
  expect(await page.evaluate(() => window.__shadow!.summon(9, 'chasing'))).toBe(true);
  const before = (await distance(page))!;
  await page.waitForTimeout(3000);
  const after = await distance(page);
  console.log(`dark chase: ${before.toFixed(1)} m, then ${after?.toFixed(1)} m 3 s later`);
  expect(after === null || after < before - 3).toBe(true);
});

test('a struck match turns a chase into a threat from a distance, and then it withdraws', async ({ page }) => {
  await boot(page);
  await page.evaluate(() => window.__items!.goTo('stand:act1-corridor'));
  await page.keyboard.press('KeyE');
  await expect.poll(() => page.evaluate(() => window.__items!.state().hasMatchbox)).toBe(true);
  expect(await page.evaluate(() => window.__shadow!.summon(10, 'chasing'))).toBe(true);
  await page.waitForTimeout(500);
  await page.keyboard.press('KeyM');
  await expect.poll(() => mode(page)).toBe('confronting');
  await expect(page.locator('#caption')).toContainText('La Sombra:');
  await face(page);
  await page.keyboard.press('KeyF');
  const nearest: number[] = [];
  for (let i = 0; i < 10 && (await mode(page)) === 'confronting'; i++) {
    nearest.push((await distance(page)) ?? Infinity);
    if (i === 4) await page.screenshot({ path: 'artifacts/screenshots/12-confront.png' });
    await page.waitForTimeout(250);
  }
  console.log(`confronting: nearest ${Math.min(...nearest).toFixed(1)} m`);
  expect(Math.min(...nearest)).toBeGreaterThanOrEqual(3);
  await expect.poll(() => mode(page), { timeout: 5000 }).toBe('withdrawn');
  const names = (await page.evaluate(() => window.__ofrenda!.events())).map((e) => e.name);
  expect(names).not.toContain('caughtByShadow');
});

test('it never comes into a solved spirit’s room while its candle burns', async ({ page }) => {
  test.setTimeout(60_000);
  let answer = '';
  await mockModel(page, () => answer);
  await boot(page, 'hooks,shadow,items,encounter');
  const room = await page.evaluate(() => {
    const k = window.__encounter!.keyRooms().find((r) => !r.locked && r.doorId && window.__encounter!.clueCount(r.characterId) > 0)!;
    return { characterId: k.characterId, doorId: k.doorId!, roomId: k.roomId! };
  });
  answer = await page.evaluate((id) => window.__encounter!.riddleAnswer(id), room.characterId);
  await winEncounter(page, room.doorId);
  await expect.poll(() => page.evaluate((id) => window.__items!.isSanctuary(id), room.roomId), { timeout: 8000 }).toBe(true);

  expect(await page.evaluate(() => window.__shadow!.summon(8, 'chasing'))).toBe(true);
  const cells = await page.evaluate((id) => window.__ofrenda!.house.getRoom(id)!.cells, room.roomId);
  for (let i = 0; i < 25; i++) {
    const [x, z] = await page.evaluate(() => window.__shadow!.position());
    expect(cells).not.toContain(`${Math.floor(x / 1.5)},${Math.floor(-z / 1.5)}`);
    await page.waitForTimeout(200);
  }
  const names = (await page.evaluate(() => window.__ofrenda!.events())).map((e) => e.name);
  expect(names).not.toContain('caughtByShadow');
  await face(page);
  await page.screenshot({ path: 'artifacts/screenshots/12-sanctuary.png' });
});

test('caught in the dark: the screen goes black and the player is possessed', async ({ page }) => {
  await boot(page);
  expect(await page.evaluate(() => window.__shadow!.summon(2.5, 'chasing'))).toBe(true);
  await expect.poll(() => mode(page), { timeout: 6000 }).toBe('grasping');
  await expect.poll(() => mode(page), { timeout: 3000 }).toBe('caught');
  await expect(page.locator('#ending[data-kind="possessed"]')).toContainText('You lost. You were possessed by the spirit of La Sombra.');
  await page.waitForTimeout(4000);
  await page.screenshot({ path: 'artifacts/screenshots/12-caught.png' });
  const names = (await page.evaluate(() => window.__ofrenda!.events())).map((e) => e.name);
  expect(names).toContain('caughtByShadow');
});

test('a painting comes down off the wall the player faces, a step or two ahead, never on them', async ({ page }) => {
  await boot(page);
  await page.evaluate(() => window.__ofrenda!.viewRoom('filler'));
  await page.keyboard.press('KeyF');
  // Walk up until a wall is 1.2 to 3 m ahead: only then can a painting fall (spec 24).
  let fired = false;
  for (let i = 0; i < 12 && !fired; i++) {
    fired = await page.evaluate(() => window.__shadow!.hazard('crash'));
    if (!fired) {
      await page.evaluate(() => {
        const p = window.__ofrenda!.player();
        window.__ofrenda!.place(p.x - Math.sin(p.yaw) * 0.4, p.z - Math.cos(p.yaw) * 0.4, p.yaw);
      });
      await page.evaluate(() => window.__ofrenda!.frames(2));
    }
  }
  expect(fired).toBe(true);
  // Mid-fall: it comes off the wall half a second after the creak.
  await page.waitForTimeout(700);
  await page.screenshot({ path: 'artifacts/screenshots/12-painting.png' });
  await expect.poll(async () => (await page.evaluate(() => window.__ofrenda!.events())).some((e) => e.name === 'hazard')).toBe(true);
  const hazard = (await page.evaluate(() => window.__ofrenda!.events())).find((e) => e.name === 'hazard')!;
  const player = await page.evaluate(() => window.__ofrenda!.player());
  const [hx, , hz] = hazard.position as [number, number, number];
  const d = Math.hypot(hx - player.x, hz - player.z);
  const ahead = (hx - player.x) * -Math.sin(player.yaw) + (hz - player.z) * -Math.cos(player.yaw);
  console.log(`painting: ${d.toFixed(2)} m from the player, ${ahead.toFixed(2)} m ahead`);
  expect(hazard.kind).toBe('crash');
  expect(d).toBeGreaterThanOrEqual(1.1);
  expect(d).toBeLessThanOrEqual(3.1);
  expect(ahead).toBeGreaterThan(0);
});
