import { describe, expect, it } from 'vitest';
import { FRONT_DOOR_CELL, dawnOutcome, pathHome } from '../../src/story/dawn-rules';
import { DIR_STEP, parseCell } from '../../src/world/grid';
import type { House } from '../../src/world/house';
import type { CellId } from '../../src/world/types';
import { createRng, newHouse, visibleAround, wander } from './house-helpers';

/** Each step goes to a neighbouring cell, within a room or through a door that isn't locked or sealed. */
function walkable(house: House, path: readonly CellId[]): boolean {
  for (let i = 1; i < path.length; i++) {
    const [x0, y0] = parseCell(path[i - 1]!);
    const [x1, y1] = parseCell(path[i]!);
    if (!Object.values(DIR_STEP).some(([dx, dy]) => x0 + dx === x1 && y0 + dy === y1)) return false;
    if (house.roomAt(path[i - 1]!)?.id === house.roomAt(path[i]!)?.id) continue;
    const door = house.doorBetween(path[i - 1]!, path[i]!);
    if (!door || door.state === 'locked' || door.state === 'sealed') return false;
  }
  return true;
}

describe('dawn', () => {
  it('sets the player free for the killer’s name, and traps them for anyone else', () => {
    expect(dawnOutcome('cook' as never, 'cook' as never)).toBe('free');
    expect(dawnOutcome('doctor' as never, 'cook' as never)).toBe('trapped');
  });

  it('finds the way home to the front door from anywhere, once the Act 1 wall is down (200 seeds × 50 reshuffles)', () => {
    for (let seed = 0; seed < 200; seed++) {
      const house = newHouse(seed);
      const rng = createRng(seed).fork('dawn-test');
      house.update(house.startCell);
      house.shiftCorridorBehind();
      house.endAct1();
      let player: CellId = '1,2';
      house.update(player);
      for (let i = 0; i < 50; i++) {
        player = wander(house, rng, player, 3);
        house.update(player);
        const here = house.roomAt(player);
        if (here?.kind === 'key' && here.characterId) house.markVisited(here.characterId);
        house.reshuffle(visibleAround(house, player, 2), player);
      }
      house.freeze();
      house.reopenAct1Corridor();
      house.unsealFrontDoor();
      const locked = new Set(house.keyRooms().filter((k) => k.locked && k.roomId).map((k) => k.roomId!));
      const cells = house
        .loadedChunks()
        .flatMap((c) => c.rooms)
        .filter((r) => !locked.has(r.id))
        .flatMap((r) => r.cells);
      for (let i = 0; i < 5; i++) {
        const from = rng.pick(cells);
        const path = pathHome(house, from);
        expect(path.at(-1), `seed ${seed} from ${from}`).toBe(FRONT_DOOR_CELL);
        expect(path[0]).toBe(from);
        expect(walkable(house, path)).toBe(true);
      }
    }
  }, 120_000);

  it('stops the rooms moving once frozen', () => {
    const house = newHouse(42);
    house.update(house.startCell);
    house.endAct1();
    const player: CellId = '1,2';
    const rooms = () => JSON.stringify(house.loadedChunks().map((c) => [c.id, c.epoch, c.rooms.map((r) => r.id)]));
    const before = rooms();
    house.freeze();
    for (let i = 0; i < 10; i++) expect(house.reshuffle(new Set(), player)).toEqual({ loaded: [], unloaded: [] });
    expect(rooms()).toBe(before);
  });
});
