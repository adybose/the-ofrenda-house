import { expect, test } from './fixtures';

// Spec 23: a spirit's whisper from the way to the nearest room whose spirit the player hasn't met.

test('a whisper comes from the way to a spirit the player can reach, and the stranger notices', async ({ page }) => {
  await page.goto('/?seed=42&skip=act1&debug=hooks,encounter&mute=1&shadow=0&guide=3');
  await page.waitForFunction(() => document.body.dataset.ready === 'true' && Boolean(window.__encounter));
  await expect.poll(async () => (await page.evaluate(() => window.__ofrenda!.events())).some((e) => e.name === 'guideWhisper'), { timeout: 8000 }).toBe(true);
  const whisper = (await page.evaluate(() => window.__ofrenda!.events())).find((e) => e.name === 'guideWhisper')!;
  const room = await page.evaluate((id) => window.__encounter!.keyRooms().find((k) => k.characterId === id)!, whisper.characterId as string);
  expect(room.locked).toBe(false);
  const [wx, , wz] = whisper.position as [number, number, number];
  const { centre, player } = await page.evaluate((roomId) => {
    const cells = window.__ofrenda!.house.getRoom(roomId)!.cells;
    const [x, y] = cells[Math.floor(cells.length / 2)]!.split(',').map(Number) as [number, number];
    return { centre: [(x + 0.5) * 1.5, -(y + 0.5) * 1.5], player: window.__ofrenda!.player() };
  }, room.roomId!);
  const toRoom = (x: number, z: number) => Math.hypot(x - centre[0]!, z - centre[1]!);
  // It comes from the way there: nearer the room than the player stands.
  expect(toRoom(wx, wz)).toBeLessThan(toRoom(player.x, player.z));
  // After the first thought of the night, the stranger notices the whispers.
  await expect(page.locator('#thought')).toHaveText('Whispers… from that way. Someone is waiting there.', { timeout: 12_000 });
});
