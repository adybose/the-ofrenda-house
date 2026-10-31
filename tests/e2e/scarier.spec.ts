import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';

// Spec 24: scarier nights.

async function open(page: Page, query: string) {
  await page.route('**/api/tts', (route) => route.fulfill({ status: 503, body: '{}' }));
  await page.route('**/api/shadow/taunt', (route) => route.fulfill({ status: 503, body: '{}' }));
  await page.goto(`/?seed=42&skip=act1&mute=1&${query}`);
  await page.waitForFunction(() => document.body.dataset.ready === 'true' && Boolean(window.__ofrenda));
}

const bpmShown = (page: Page) => page.evaluate(() => Number(document.querySelector('#hud-heart')?.textContent?.match(/(\d+) bpm/)?.[1] ?? 0));

test('a fright sends the heart racing, and the heart on the HUD shows it', async ({ page }) => {
  await open(page, 'debug=hooks,scares&shadow=0');
  await expect.poll(() => bpmShown(page)).toBeLessThan(80);
  const calm = await page.evaluate(() => parseFloat(getComputedStyle(document.querySelector('#hud-heart span')!).animationDuration));
  await page.evaluate(() => window.__scares!.fire('bat'));
  await expect.poll(() => bpmShown(page)).toBeGreaterThan(110);
  const racing = await page.evaluate(() => parseFloat(getComputedStyle(document.querySelector('#hud-heart span')!).animationDuration));
  expect(racing).toBeLessThan(calm * 0.75);
  await page.screenshot({ path: 'artifacts/screenshots/24-heart.png', clip: { x: 0, y: 640, width: 400, height: 80 } });
});

test('opening a door startles bats, and they bring the chandelier down in front of the player', async ({ page }) => {
  await open(page, 'debug=hooks,scares&shadow=0&doorscare=batsChandelier');
  const door = await page.evaluate(() => {
    const house = window.__ofrenda!.house;
    for (const room of house.loadedChunks().flatMap((c) => c.rooms)) {
      if (!room.anchors.some((a) => a.kind === 'chandelier')) continue;
      for (const id of room.doors) {
        const d = house.getDoor(id);
        if (!d || d.state !== 'closed') continue;
        const outside = room.cells.includes(d.a) ? d.b : d.a;
        if (!house.roomAt(outside)) continue;
        return { id, side: room.cells.includes(d.a) ? ('b' as const) : ('a' as const) };
      }
    }
    return undefined;
  });
  expect(door).toBeDefined();
  await page.evaluate(({ id, side }) => window.__ofrenda!.standFacingDoor(id, side), door!);
  await page.keyboard.press('KeyF');
  await page.waitForTimeout(300);
  await page.keyboard.press('KeyE');
  await page.waitForTimeout(250);
  await page.screenshot({ path: 'artifacts/screenshots/24-door-bats.png' });
  await expect.poll(async () => (await page.evaluate(() => window.__ofrenda!.events())).some((e) => e.name === 'chandelierFell'), { timeout: 4000 }).toBe(true);
  const log = await page.evaluate(() => window.__ofrenda!.events());
  expect(log.filter((e) => e.name === 'scareFired' && e.kind === 'bat').length).toBeGreaterThanOrEqual(1);
  const fell = log.find((e) => e.name === 'chandelierFell')!;
  const player = await page.evaluate(() => window.__ofrenda!.player());
  const [cx, , cz] = fell.position as [number, number, number];
  const ahead = (cx - player.x) * -Math.sin(player.yaw) + (cz - player.z) * -Math.cos(player.yaw);
  const d = Math.hypot(cx - player.x, cz - player.z);
  // The room's own chandelier, ahead of the player in the room they opened.
  expect(d).toBeGreaterThanOrEqual(2);
  expect(d).toBeLessThanOrEqual(5);
  expect(ahead).toBeGreaterThan(1.8);
  await page.screenshot({ path: 'artifacts/screenshots/24-door-chandelier.png' });
});

/** A closed door between two rooms near the start, and the side to stand on. */
async function closedDoor(page: Page) {
  return page.evaluate(() => {
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
}

const shadowMode = (page: Page) => page.evaluate(() => window.__shadow!.mode());

test('La Sombra steps out as a door opens: in the torchlight it laughs, speaks and flees', async ({ page }) => {
  await open(page, 'debug=hooks,shadow&sombra=door');
  const door = (await closedDoor(page))!;
  await page.evaluate(({ id, side }) => window.__ofrenda!.standFacingDoor(id, side), door);
  await page.keyboard.press('KeyF');
  await page.waitForTimeout(300);
  await page.keyboard.press('KeyE');
  await expect.poll(async () => (await page.evaluate(() => window.__ofrenda!.events())).some((e) => e.name === 'shadowLaughed'), { timeout: 5000, intervals: [50] }).toBe(true);
  await page.waitForTimeout(150);
  await page.screenshot({ path: 'artifacts/screenshots/24-sombra-door.png' });
  await expect(page.locator('#caption')).toContainText('La Sombra:');
  const near = (await page.evaluate(() => window.__shadow!.distance()))!;
  await page.waitForTimeout(1200);
  const later = await page.evaluate(() => window.__shadow!.distance());
  // It flees: further away, or already gone.
  expect(later === null || later > near + 1).toBe(true);
});

test('La Sombra steps out as a door opens: in the dark it charges', async ({ page }) => {
  await open(page, 'debug=hooks,shadow&sombra=door');
  const door = (await closedDoor(page))!;
  await page.evaluate(({ id, side }) => window.__ofrenda!.standFacingDoor(id, side), door);
  await page.waitForTimeout(300);
  await page.keyboard.press('KeyE');
  await expect.poll(() => shadowMode(page), { timeout: 5000 }).toBe('chasing');
  await page.waitForTimeout(400);
  await page.screenshot({ path: 'artifacts/screenshots/24-sombra-eyes.png' });
  const first = (await page.evaluate(() => window.__shadow!.distance()))!;
  await page.waitForTimeout(800);
  expect((await page.evaluate(() => window.__shadow!.distance())) ?? 0).toBeLessThan(first);
});

test('when the light goes out, the darkness draws La Sombra, and it says so', async ({ page }) => {
  test.setTimeout(45_000);
  await open(page, 'debug=hooks,shadow');
  await page.keyboard.press('KeyF');
  await page.waitForTimeout(800);
  await page.keyboard.press('KeyF');
  await expect(page.locator('#caption')).toContainText('La Sombra:', { timeout: 14_000 });
  const words = (await page.locator('#caption').textContent())!.replace('La Sombra: ', '');
  const dark = ['I can see your darkness.', 'I can smell your fear.', 'Your light is gone. I am not.', 'In the dark, you are mine.', 'Do you hear me breathing? I hear you.', 'Darkness suits you, little thief.', 'No flame now. Only me.', 'The dark is my house too.', 'Your heart is so loud in the dark.', 'There you are. I knew you would come to me.', 'Shh. Let the dark hold you.', 'Every shadow is my hand.'];
  expect(dark).toContain(words);
  expect(['hunting', 'chasing']).toContain(await shadowMode(page));
});

test('a cat sits on the furniture with glowing eyes; opening its door, it screams and a vase shatters', async ({ page }) => {
  await open(page, 'debug=hooks,scares&shadow=0&cats=all');
  const seats = await page.evaluate(() => window.__scares!.cats());
  expect(seats.length).toBeGreaterThan(0);

  // Watching one from across its room, in the dark.
  const seat = seats[0]!;
  await page.evaluate((s) => {
    const step = { N: [0, 1], E: [1, 0], S: [0, -1], W: [-1, 0] }[s.wall] as [number, number];
    const [px, pz] = [s.x - step[0] * 2.6, s.z + step[1] * 2.6];
    window.__ofrenda!.place(px, pz, Math.atan2(-(s.x - px), -(s.z - pz)));
  }, seat);
  await page.waitForTimeout(500);
  await page.screenshot({ path: 'artifacts/screenshots/24-cat-eyes.png' });

  // A cat behind a closed door: open it.
  const target = await page.evaluate((cats) => {
    const house = window.__ofrenda!.house;
    for (const c of cats) {
      const room = house.getRoom(c.roomId);
      for (const id of room?.doors ?? []) {
        const d = house.getDoor(id);
        if (!d || d.state !== 'closed') continue;
        const outside = room!.cells.includes(d.a) ? d.b : d.a;
        if (!house.roomAt(outside)) continue;
        return { id, side: room!.cells.includes(d.a) ? ('b' as const) : ('a' as const), roomId: c.roomId };
      }
    }
    return undefined;
  }, seats);
  expect(target).toBeDefined();
  await page.evaluate(({ id, side }) => window.__ofrenda!.standFacingDoor(id, side), target!);
  await page.keyboard.press('KeyF');
  await page.waitForTimeout(300);
  await page.keyboard.press('KeyE');
  await expect.poll(async () => (await page.evaluate(() => window.__ofrenda!.events())).some((e) => e.name === 'scareFired' && e.kind === 'cat'), { timeout: 3000 }).toBe(true);
  await expect.poll(async () => (await page.evaluate(() => window.__ofrenda!.events())).some((e) => e.name === 'vaseShattered'), { timeout: 3000 }).toBe(true);
  expect((await page.evaluate(() => window.__scares!.cats())).some((c) => c.roomId === target!.roomId)).toBe(false);
});
