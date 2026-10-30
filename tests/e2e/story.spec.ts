import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';

// Spec 14: the title and prologue, the scripted Act 1, the clock, and the four endings.

async function quiet(page: Page) {
  // Never the real model or Piper.
  await page.route('**/api/tts', (route) => route.fulfill({ status: 503, body: '{}' }));
  await page.route('**/api/shadow/taunt', (route) => route.fulfill({ status: 503, body: '{}' }));
  await page.route('**/api/health', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true,"ollama":false,"piper":false}' }));
}

async function open(page: Page, query: string) {
  await quiet(page);
  await page.goto(`/?seed=42&mute=1&${query}`);
  await page.waitForFunction(() => document.body.dataset.ready === 'true' && Boolean(window.__ofrenda));
}

const names = (page: Page) => page.evaluate(() => window.__ofrenda!.events().map((e) => e.name));
/** Stands the player at the middle of a cell, facing `yaw` (0 north, π/2 west). */
const stand = (page: Page, cell: [number, number], yaw = 0) =>
  page.evaluate(([[x, y], yaw]) => window.__ofrenda!.place((x + 0.5) * 1.5, -(y + 0.5) * 1.5, yaw), [cell, yaw] as const);

test('the title, the prologue, and the door locking behind the player', async ({ page, consoleErrors }) => {
  await open(page, 'debug=hooks&title=1');
  await expect(page.locator('#title')).toContainText('The Ofrenda House');
  await expect(page.locator('#title')).toContainText('Click to enter');
  await expect(page.locator('#title')).toContainText('Ollama not found');
  await page.locator('#title').click();
  await expect(page.locator('#title')).toHaveCount(0);
  await expect(page.locator('#story-caption')).toHaveText('11 pm, 1 November.');

  // Up the path and in: the door slams and locks.
  await page.evaluate(() => window.__ofrenda!.place(11.25, 4, 0));
  await page.keyboard.down('ArrowUp');
  await expect.poll(() => page.evaluate(() => window.__ofrenda!.arrival().stage), { timeout: 8000 }).toBe('inside');
  await page.keyboard.up('ArrowUp');
  expect(await page.evaluate(() => window.__ofrenda!.house.getDoor('front-door')?.state)).toBe('sealed');
  await expect(page.locator('#hint')).toContainText('F: switch on your torch');
  await page.waitForTimeout(1500);
  await page.screenshot({ path: 'artifacts/screenshots/14-locked-in.png' });

  // The door won't open.
  await page.evaluate(() => window.__ofrenda!.standFacingDoor('front-door', 'a'));
  await page.waitForTimeout(200);
  await page.keyboard.press('KeyE');
  await expect.poll(() => names(page)).toContain('doorSealed');
  expect(consoleErrors).toEqual([]);
});

test('Act 1: the shifting faces, the bat, the patriarch’s chase, the dead end, and midnight', async ({ page }) => {
  test.setTimeout(60_000);
  await open(page, 'skip=prologue&debug=hooks,scares');
  expect(await page.evaluate(() => window.__story!.stage())).toBe('entrance');

  await stand(page, [7, 6]);
  await expect.poll(() => page.evaluate(() => window.__story!.stage())).toBe('portraits');
  await expect.poll(() => names(page), { timeout: 5000 }).toContain('lightning');

  await stand(page, [7, 9]);
  await expect.poll(async () => (await page.evaluate(() => window.__ofrenda!.events())).some((e) => e.name === 'scareFired' && e.kind === 'bat')).toBe(true);

  await stand(page, [7, 12]);
  await expect(page.locator('#patriarch-line')).toContainText('Who are you? How dare you enter my house?');
  await expect(page.locator('#hint')).toContainText('hold Shift to run');
  await page.keyboard.down('Shift');
  await page.keyboard.down('ArrowUp');
  await page.waitForTimeout(400);
  await page.keyboard.up('ArrowUp');
  await page.keyboard.up('Shift');

  // Out through the back door on the left and down the corridor, walking (no teleports): the player
  // must always stand in a room, and the way back walls itself up behind them.
  const cell = () => page.evaluate(() => {
    const p = window.__ofrenda!.player();
    return `${Math.floor(p.x / 1.5)},${Math.floor(-p.z / 1.5)}`;
  });
  const inRoom = () => page.evaluate(() => {
    const p = window.__ofrenda!.player();
    return window.__ofrenda!.house.roomAt(`${Math.floor(p.x / 1.5)},${Math.floor(-p.z / 1.5)}`)?.id ?? null;
  });
  const visited: (string | null)[] = [];
  await stand(page, [5, 12], Math.PI / 2);
  await page.keyboard.down('ArrowUp');
  for (let i = 0; i < 60 && (await cell()) !== '2,12'; i++) {
    visited.push(await inRoom());
    await page.waitForTimeout(100);
  }
  await page.keyboard.up('ArrowUp');
  expect(await cell()).toBe('2,12');
  // Turn down the corridor (from the middle of the corner, as a player walking on to the far wall would).
  await stand(page, [2, 12], Math.PI);
  await page.keyboard.down('ArrowUp');
  for (let i = 0; i < 80 && !(await page.locator('#dialogue-text').textContent())?.includes('Another one'); i++) {
    visited.push(await inRoom());
    await page.waitForTimeout(100);
  }
  await page.keyboard.up('ArrowUp');
  expect(visited).not.toContain(null);
  expect(await page.evaluate(() => window.__ofrenda!.house.getDoor('d:0,2:E')?.state ?? 'gone')).toBe('gone');

  // The dead end: he speaks his piece, and the clock strikes midnight.
  await expect(page.locator('#dialogue-text')).toContainText('Another one. The house took you, as it took the others.', { timeout: 8000 });
  await page.keyboard.press('Space');
  await page.waitForTimeout(80);
  await page.keyboard.press('Space');
  await expect.poll(() => names(page), { timeout: 5000 }).toContain('midnight');
  expect(await page.evaluate(() => window.__story!.stage())).toBe('act2');
  await expect(page.locator('#thought')).toHaveText('There must be a candle somewhere here.', { timeout: 6000 });
  await page.screenshot({ path: 'artifacts/screenshots/14-dead-end.png' });
  expect(await page.evaluate(() => window.__ofrenda!.house.getDoor('d:-1,0:E')?.state)).toBe('closed');
});

for (const kind of ['true', 'escape', 'possessed', 'trapped'] as const) {
  test(`the ${kind} ending`, async ({ page }) => {
    await open(page, `skip=act1&debug=hooks&shadow=0&ending=${kind}`);
    const screen = page.locator(`#ending[data-kind="${kind}"]`);
    await expect(screen).toBeVisible();
    await expect(screen.getByRole('button', { name: 'Play again (new household)' })).toBeVisible();
    await expect(screen.getByRole('button', { name: 'Replay this seed' })).toBeVisible();
    if (kind === 'possessed') await expect(screen).toContainText('You lost. You were possessed by the spirit of La Sombra.');
    await page.waitForTimeout(2200);
    await page.screenshot({ path: `artifacts/screenshots/14-ending-${kind}.png` });
  });
}

test('the clock: a candle and the time, and the hour struck', async ({ page }) => {
  await open(page, 'skip=act1&debug=hooks&shadow=0&clock=02:59');
  await expect(page.locator('#hud-clock')).toContainText('2:59 am');
  await expect.poll(async () => (await page.evaluate(() => window.__ofrenda!.events())).find((e) => e.name === 'hourStruck'), { timeout: 8000 }).toMatchObject({ hour: 3 });
  await expect(page.locator('#hud-clock')).toContainText('3:0');
});
