import { describe, expect, it } from 'vitest';
import { DINING_MAX_DISTANCE, DIR_STEP, SLOT_CELLS, parseCell, slotOfCell } from '../../src/world/grid';
import type { CellId, Dir } from '../../src/world/types';
import { createRng, newHouse, visibleAround, wander } from './house-helpers';
import type { House } from '../../src/world/house';

function snapshot(house: House, cells: Iterable<CellId>, roomIds: Iterable<string>): string {
  const rooms: Record<string, unknown> = {};
  for (const cell of cells) rooms[`cell:${cell}`] = house.roomAt(cell);
  for (const id of roomIds) rooms[`room:${id}`] = house.getRoom(id);
  return JSON.stringify(rooms);
}

describe('reshuffle protection', () => {
  it('never changes visible cells, pinned cells, the player room or the rooms next to it', () => {
    let changedSomething = 0;
    for (let seed = 0; seed < 100; seed++) {
      const house = newHouse(seed);
      const rng = createRng(seed).fork('protect-test');
      let player = house.startCell;
      const pinned: CellId[] = [];
      for (let i = 0; i < 10; i++) {
        player = wander(house, rng, player, 3);
        if (rng.chance(0.3)) {
          const pin = wander(house, rng, player, 2);
          pinned.push(pin);
          house.pinCells([pin]);
        }
        const visible = visibleAround(house, player, 1);
        const nearRooms = [...house.distancesFrom(player, 1).keys()];
        const watched = [...visible, ...pinned];
        const before = snapshot(house, watched, nearRooms);
        const far = JSON.stringify([...house.distancesFrom(player, 6).keys()].sort());
        house.reshuffle(visible, player);
        expect(snapshot(house, watched, nearRooms), `seed ${seed} reshuffle ${i}`).toBe(before);
        if (JSON.stringify([...house.distancesFrom(player, 6).keys()].sort()) !== far) changedSomething++;
      }
    }
    // The house really does rearrange beyond what is protected.
    expect(changedSomething).toBeGreaterThan(900);
  });

  it('reports reshuffled loaded chunks as unloaded and loaded again', () => {
    const house = newHouse(42);
    house.update(house.startCell);
    const diff = house.reshuffle(new Set(), house.startCell);
    expect(diff.loaded.length).toBeGreaterThan(0);
    expect(diff.loaded.map((c) => c.id).sort()).toEqual([...diff.unloaded].sort());
    expect(diff.unloaded).not.toContain('0,0');
  });
});

describe('key rooms in the built house', () => {
  it('appear as key rooms with their spirit, style and a single door, before and after reshuffles', () => {
    for (let seed = 0; seed < 50; seed++) {
      const house = newHouse(seed);
      const rng = createRng(seed).fork('key-built');
      let player = house.startCell;
      for (let i = 0; i < 4; i++) {
        for (const state of house.keyRooms().filter((k) => k.roomId)) {
          const room = house.getRoom(state.roomId!);
          expect(room?.kind, `seed ${seed} ${state.characterId}`).toBe('key');
          expect(room?.characterId).toBe(state.characterId);
          expect(room?.style).toBe(state.style);
          expect(room?.doors).toEqual([state.doorId]);
          expect(house.roomAt(room!.cells[0]!)?.id).toBe(room!.id);
        }
        player = wander(house, rng, player, 3);
        house.reshuffle(visibleAround(house, player, 1), player);
      }
    }
  });
});

describe('visited key rooms', () => {
  it('stay where the player found them, with the same cells, through 50 reshuffles (200 seeds)', () => {
    for (let seed = 0; seed < 200; seed++) {
      const house = newHouse(seed);
      const rng = createRng(seed).fork('visited-test');
      let player = house.startCell;
      const kept = new Map<string, string>();
      for (let i = 0; i < 50; i++) {
        player = wander(house, rng, player, 3);
        const here = house.roomAt(player);
        if (here?.kind === 'key' && here.characterId && !kept.has(here.id)) {
          house.markVisited(here.characterId);
          kept.set(here.id, JSON.stringify(here.cells));
        }
        house.reshuffle(visibleAround(house, player, 2), player);
        for (const [id, cells] of kept) {
          const room = house.getRoom(id);
          expect(room?.kind, `seed ${seed} ${id}`).toBe('key');
          expect(JSON.stringify(room!.cells)).toBe(cells);
          expect(house.roomAt(JSON.parse(cells)[0])?.id).toBe(id);
        }
      }
    }
  }, 60_000);
});

describe('spirit rooms a short walk away (spec 23)', () => {
  it('are mostly placed 5 to 7 doors from the player, and brought back within 7 when they drift (200 seeds)', () => {
    let placed = 0;
    let inBand = 0;
    let checks = 0;
    let near = 0;
    let nearish = 0;
    const doorsTo = (house: ReturnType<typeof newHouse>, from: CellId) => house.distancesFrom(from, 14);
    for (let seed = 0; seed < 200; seed++) {
      const house = newHouse(seed);
      const rng = createRng(seed).fork('band-test');
      let player: CellId = '1,2';
      let where = new Map(house.keyRooms().map((k) => [k.characterId, k.roomId && house.getRoom(k.roomId)?.cells[0]]));
      const count = (from: CellId, moved: (id: string) => boolean) => {
        const d = doorsTo(house, from);
        for (const k of house.keyRooms()) {
          if (!moved(k.characterId) || !k.roomId) continue;
          placed++;
          const doors = d.get(k.roomId);
          if (doors !== undefined && doors >= 5 && doors <= 7) inBand++;
        }
      };
      count(player, () => true);
      for (let i = 0; i < 30; i++) {
        player = wander(house, rng, player, 3);
        const here = house.roomAt(player);
        if (here?.kind === 'key' && here.characterId) house.markVisited(here.characterId);
        const visible = visibleAround(house, player, 2);
        house.reshuffle(visible, player);
        const now = new Map(house.keyRooms().map((k) => [k.characterId, k.roomId && house.getRoom(k.roomId)?.cells[0]]));
        count(player, (id) => now.get(id as never) !== where.get(id as never));
        where = now;
        const d = doorsTo(house, player);
        for (const k of house.keyRooms()) {
          if (k.visited || !k.roomId) continue;
          const cells = house.getRoom(k.roomId)?.cells ?? [];
          if (cells.some((c) => visible.has(c))) continue;
          checks++;
          if ((d.get(k.roomId) ?? Infinity) <= 7) near++;
          if ((d.get(k.roomId) ?? Infinity) <= 9) nearish++;
        }
      }
    }
    expect(inBand / placed, `${inBand}/${placed} placed 5-7 doors away`).toBeGreaterThanOrEqual(0.75);
    expect(near / checks, `${near}/${checks} within 7 doors after reshuffles`).toBeGreaterThanOrEqual(0.85);
    expect(nearish / checks, `${nearish}/${checks} within 9 doors after reshuffles`).toBeGreaterThanOrEqual(0.95);
  }, 120_000);
});

describe('the front door', () => {
  it('stays sealed until unsealFrontDoor()', () => {
    const house = newHouse(42);
    expect(house.getDoor('front-door')?.state).toBe('sealed');
    house.update(house.startCell);
    for (let i = 0; i < 5; i++) house.reshuffle(new Set(), house.startCell);
    house.unlock('front-door');
    house.endAct1();
    expect(house.getDoor('front-door')?.state).toBe('sealed');
    house.unsealFrontDoor();
    expect(house.getDoor('front-door')?.state).toBe('closed');
  });
});

describe('the Act 1 corridor', () => {
  it('starts as a dead end with a sealed far door, walls up behind on shift, and opens into the house after Act 1', () => {
    const house = newHouse(42);
    const corridor = house.getRoom('act1-corridor')!;
    const exitId = corridor.doors.find((id) => id !== 'd:0,2:E')!;
    expect(house.getDoor(exitId)?.state).toBe('sealed');
    expect(corridor.doors).toContain('d:0,2:E');

    house.update(house.startCell);
    house.shiftCorridorBehind();
    expect(house.getRoom('act1-corridor')!.doors).not.toContain('d:0,2:E');
    expect(house.getRoom('portrait-hall')!.doors).not.toContain('d:0,2:E');

    house.endAct1();
    expect(house.getDoor(exitId)?.state).not.toBe('sealed');
  });

  it('has one portrait per character in the portrait hall, the patriarch at the end', () => {
    for (const seed of [1, 42, 300]) {
      const house = newHouse(seed);
      const portraits = house.getRoom('portrait-hall')!.anchors.filter((a) => a.kind === 'portrait');
      const ids = portraits.map((p) => p.characterId);
      expect(new Set(ids).size).toBe(ids.length);
      expect(ids).toContain('patriarch');
      expect(portraits.find((p) => p.characterId === 'patriarch')?.side).toBe('N');
      expect(ids.length).toBeGreaterThanOrEqual(7);
    }
  });
});

describe('the dining room', () => {
  it('does not exist until revealed, then sits 2 to 6 doors away, out of sight and ahead of the player', () => {
    let ahead = 0;
    const trials = 200;
    for (let seed = 0; seed < trials; seed++) {
      const house = newHouse(seed);
      const rng = createRng(seed).fork('dining-test');
      let player = house.startCell;
      for (let i = 0; i < 5; i++) {
        player = wander(house, rng, player, 3);
        house.reshuffle(visibleAround(house, player, 2), player);
      }
      expect(house.diningRoom()).toBeUndefined();
      expect(house.loadedChunks().flatMap((c) => c.rooms).some((r) => r.kind === 'diningRoom')).toBe(false);

      const facing = rng.pick(['N', 'E', 'S', 'W'] as Dir[]);
      const visible = visibleAround(house, player, 1);
      house.revealDiningRoom(visible, player, facing);
      const dining = house.diningRoom();
      expect(dining, `seed ${seed}`).toBeDefined();
      const distance = house.distancesFrom(player, DINING_MAX_DISTANCE).get(dining!.id);
      expect(distance).toBeGreaterThanOrEqual(2);
      expect(distance).toBeLessThanOrEqual(DINING_MAX_DISTANCE);
      for (const cell of dining!.cells) expect(visible.has(cell)).toBe(false);

      const [px, py] = parseCell(player);
      const [fx, fy] = DIR_STEP[facing];
      const isAhead = (cell: CellId) => {
        const [sx, sy] = slotOfCell(...parseCell(cell));
        return (sx * SLOT_CELLS + 2 - px) * fx + (sy * SLOT_CELLS + 2 - py) * fy > 0;
      };
      if (isAhead(dining!.cells[0]!)) {
        ahead++;
      } else {
        // Behind the player is only allowed when no eligible room lies ahead.
        const eligibleAhead = [...house.distancesFrom(player, DINING_MAX_DISTANCE)].filter(([id, d]) => {
          const room = house.getRoom(id);
          if (!room || id === dining!.id || d < 2 || room.kind === 'key') return false;
          if (['entranceHall', 'portraitHall', 'act1Corridor'].includes(room.kind)) return false;
          return room.cells.every((c) => !visible.has(c)) && isAhead(room.cells[0]!);
        });
        expect(eligibleAhead, `seed ${seed} facing ${facing}`).toEqual([]);
      }

      // It stays put through later reshuffles.
      house.reshuffle(new Set(), player);
      expect(house.diningRoom()?.id).toBe(dining!.id);
      expect(house.diningRoom()?.cells).toEqual(dining!.cells);
    }
    // Most of the time there is room ahead.
    expect(ahead / trials).toBeGreaterThan(0.75);
  });
});

describe('pathBetween', () => {
  it('finds a walkable path through unlocked doors and respects blocked cells', () => {
    const house = newHouse(42);
    house.update(house.startCell);
    const path = house.pathBetween(house.startCell, '7,12');
    expect(path?.[0]).toBe(house.startCell);
    expect(path?.at(-1)).toBe('7,12');
    expect(house.pathBetween(house.startCell, '7,12', (c) => c === '7,5' || c === '7,4')).toBeNull();
    // The Act 1 exit is sealed, so the house beyond is out of reach.
    expect(house.pathBetween(house.startCell, '-3,2')).toBeNull();
    house.endAct1();
    expect(house.pathBetween(house.startCell, '-3,2')).not.toBeNull();
  });
});

describe('determinism of the whole house', () => {
  it('gives the same results for the same seed and the same calls', () => {
    const run = () => {
      const house = newHouse(7);
      const rng = createRng(7).fork('det');
      let player = house.startCell;
      const log: unknown[] = [house.keyRooms()];
      log.push(house.update(player));
      for (let i = 0; i < 10; i++) {
        player = wander(house, rng, player, 3);
        log.push(house.update(player), house.reshuffle(visibleAround(house, player, 1), player), house.keyRooms());
      }
      log.push(house.revealDiningRoom(new Set(), player, 'N'));
      return JSON.stringify(log);
    };
    expect(run()).toBe(run());
  });
});
