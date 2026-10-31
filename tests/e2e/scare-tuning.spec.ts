import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';

// Spec 25: scare tuning.

async function open(page: Page, query: string) {
  await page.route('**/api/tts', (route) => route.fulfill({ status: 503, body: '{}' }));
  await page.route('**/api/shadow/taunt', (route) => route.fulfill({ status: 503, body: '{}' }));
  await page.goto(`/?seed=42&skip=act1&mute=1&${query}`);
  await page.waitForFunction(() => document.body.dataset.ready === 'true' && Boolean(window.__ofrenda));
}

test('a jump scare brings the suspense score in', async ({ page }) => {
  await open(page, 'debug=hooks,scares&shadow=0');
  await page.mouse.click(400, 300);
  await expect.poll(() => page.evaluate(() => window.__ofrenda!.audioState())).toBe('running');
  expect((await page.evaluate(() => window.__ofrenda!.audioLevels())).score.drone).toBeLessThan(0.005);
  await page.evaluate(() => window.__scares!.fire('bat'));
  await expect.poll(() => page.evaluate(() => window.__ofrenda!.audioLevels().score.drone), { timeout: 5000 }).toBeGreaterThan(0.02);
  await expect.poll(() => page.evaluate(() => window.__ofrenda!.audioLevels().score.strings), { timeout: 5000 }).toBeGreaterThan(0.002);
});

test('bats from an opened door fly straight into the player’s face', async ({ page }) => {
  await open(page, 'debug=hooks,scares&shadow=0&doorscare=bats');
  const door = await page.evaluate(() => {
    const house = window.__ofrenda!.house;
    for (const chunk of house.loadedChunks()) {
      for (const d of chunk.doors) {
        if (d.state !== 'closed' || !house.roomAt(d.a) || !house.roomAt(d.b) || d.id === 'front-door') continue;
        if (house.keyRooms().some((k) => k.doorId === d.id)) continue;
        return { id: d.id, side: 'a' as const };
      }
    }
    return undefined;
  });
  expect(door).toBeDefined();
  await page.evaluate(({ id, side }) => window.__ofrenda!.standFacingDoor(id, side), door!);
  await page.keyboard.press('KeyF');
  await page.waitForTimeout(300);
  await page.evaluate(() => window.__scares!.closestBat());
  await page.keyboard.press('KeyE');
  // Keeps the frame from the moment it is closest.
  let closest = Infinity;
  for (let i = 0; i < 20 && closest >= 0.6; i++) {
    const shot = await page.screenshot();
    closest = Math.min(closest, await page.evaluate(() => window.__scares!.closestBat()));
    if (closest < 0.6) (await import('node:fs')).writeFileSync('artifacts/screenshots/25-bat-in-face.png', shot);
  }
  console.log(`closest bat: ${closest.toFixed(2)} m`);
  expect(closest).toBeLessThan(0.6);
});

test('La Sombra brings down the chandelier of the room ahead, in front of the player', async ({ page }) => {
  await open(page, 'debug=hooks,shadow&shadow=0');
  // A spot in a room 3 to 4.5 m from its chandelier, facing it.
  const spot = await page.evaluate(() => {
    const house = window.__ofrenda!.house;
    const centre = (x: number, y: number) => [(x + 0.5) * 1.5, -(y + 0.5) * 1.5] as const;
    for (const room of house.loadedChunks().flatMap((c) => c.rooms)) {
      const anchor = room.anchors.find((a) => a.kind === 'chandelier');
      if (!anchor) continue;
      const [cx, cy] = anchor.cell.split(',').map(Number) as [number, number];
      for (const [dx, dy] of [[0, 3], [0, -3], [3, 0], [-3, 0], [0, 2], [0, -2], [2, 0], [-2, 0]] as [number, number][]) {
        if (!room.cells.includes(`${cx + dx},${cy + dy}`)) continue;
        const [px, pz] = centre(cx + dx, cy + dy);
        const [tx, tz] = centre(cx, cy);
        return { x: px, z: pz, yaw: Math.atan2(-(tx - px), -(tz - pz)), chandelier: [tx, tz] };
      }
    }
    return undefined;
  });
  expect(spot).toBeDefined();
  await page.evaluate(({ x, z, yaw }) => window.__ofrenda!.place(x, z, yaw), spot!);
  await page.evaluate(() => window.__ofrenda!.frames(3));
  await page.keyboard.press('KeyF');
  expect(await page.evaluate(() => window.__shadow!.hazard('crash'))).toBe(true);
  await page.waitForTimeout(800);
  await page.screenshot({ path: 'artifacts/screenshots/25-sombra-chandelier.png' });
  await expect.poll(async () => (await page.evaluate(() => window.__ofrenda!.events())).some((e) => e.name === 'chandelierFell'), { timeout: 3000 }).toBe(true);
  const fell = (await page.evaluate(() => window.__ofrenda!.events())).find((e) => e.name === 'chandelierFell')!;
  const [fx, , fz] = fell.position as [number, number, number];
  expect(Math.hypot(fx - spot!.chandelier[0]!, fz - spot!.chandelier[1]!)).toBeLessThan(0.1);
  const d = Math.hypot(fx - spot!.x, fz - spot!.z);
  expect(d).toBeGreaterThanOrEqual(2);
  expect(d).toBeLessThanOrEqual(5.5);
});

test('walking by candlelight alone, La Sombra steps out ahead of the player', async ({ page }) => {
  test.setTimeout(60_000);
  await open(page, 'debug=hooks,shadow,items&sombra=candle');
  // The candle and matches at the Act 1 dead end: take them and light the candle; the torch stays off.
  expect(await page.evaluate(() => window.__items!.goTo('stand:act1-corridor'))).toBe(true);
  await page.evaluate(() => window.__ofrenda!.frames(5));
  await page.keyboard.press('KeyE');
  await expect.poll(() => page.evaluate(() => window.__items!.state().hasMatchbox)).toBe(true);
  await page.keyboard.press('KeyE');
  await expect.poll(() => page.evaluate(() => window.__items!.state().hand)).toBe('candle:stand:act1-corridor');
  await page.keyboard.press('KeyM');
  await expect.poll(() => page.evaluate(() => window.__items!.inLight())).toBe(true);
  expect(await page.evaluate(() => window.__ofrenda!.flashlight().on)).toBe(false);
  // Turn round from the stand and walk up the corridor, back and forth, until it comes.
  const start = await page.evaluate(() => window.__ofrenda!.player());
  const started = Date.now();
  let laughed = false;
  for (let leg = 0; leg < 12 && !laughed; leg++) {
    await page.evaluate(({ x, z, yaw }) => window.__ofrenda!.place(x, z, yaw), { ...start, yaw: start.yaw + Math.PI });
    await page.keyboard.down('ArrowUp');
    for (let i = 0; i < 6 && !laughed; i++) {
      await page.waitForTimeout(250);
      laughed = (await page.evaluate(() => window.__ofrenda!.events())).some((e) => e.name === 'shadowLaughed');
    }
    await page.keyboard.up('ArrowUp');
  }
  const seconds = (Date.now() - started) / 1000;
  console.log(`La Sombra stepped out after ${seconds.toFixed(1)} s by candlelight`);
  expect(laughed).toBe(true);
  expect(seconds).toBeLessThan(20);
  await page.waitForTimeout(150);
  await page.screenshot({ path: 'artifacts/screenshots/25-sombra-candle.png' });
});

test('the guide’s whisper comes from a few metres along the way', async ({ page }) => {
  await open(page, 'debug=hooks&shadow=0&guide=3');
  await expect.poll(async () => (await page.evaluate(() => window.__ofrenda!.events())).some((e) => e.name === 'guideWhisper'), { timeout: 8000 }).toBe(true);
  const whisper = (await page.evaluate(() => window.__ofrenda!.events())).find((e) => e.name === 'guideWhisper')!;
  const player = await page.evaluate(() => window.__ofrenda!.player());
  const [wx, , wz] = whisper.position as [number, number, number];
  const d = Math.hypot(wx - player.x, wz - player.z);
  console.log(`whisper ${d.toFixed(2)} m from the player`);
  expect(d).toBeLessThanOrEqual(4);
});
