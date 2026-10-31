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
