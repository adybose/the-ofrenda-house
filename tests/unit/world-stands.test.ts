import { describe, expect, it } from 'vitest';
import { createRng } from '../../src/core/rng';
import { furnishRoom } from '../../src/world/furniture';
import { DIR_STEP, cellId, edgeCells, parseCell } from '../../src/world/grid';
import { standsOf } from '../../src/world/stands';
import type { Room } from '../../src/world/types';
import { newHouse, visibleAround, wander } from './house-helpers';

/** Every room in the loaded chunks around the player. */
const loadedRooms = (house: ReturnType<typeof newHouse>): Room[] => house.loadedChunks().flatMap((c) => c.rooms);

/** The cells a door opens from, inside this room. */
const doorwayCells = (room: Room) =>
  new Set(room.doors.filter((d) => d !== 'front-door').flatMap((d) => edgeCells(d.slice(2)).filter((c) => room.cells.includes(c))));

describe('candle stands', () => {
  it('puts a table with a candle under every spirit’s portrait, never in a doorway (200 seeds, with reshuffles)', () => {
    for (let seed = 0; seed < 200; seed++) {
      const house = newHouse(seed);
      const rng = createRng(seed).fork('stands-test');
      let player = house.startCell;
      for (let i = 0; i < 6; i++) {
        house.update(player);
        for (const room of loadedRooms(house).filter((r) => r.kind === 'key')) {
          const tables = room.anchors.filter((a) => a.kind === 'candleTable');
          const portraits = room.anchors.filter((a) => a.kind === 'portrait');
          expect(tables, `seed ${seed} ${room.id}`).toHaveLength(1);
          expect(portraits).toHaveLength(1);
          expect(portraits[0]).toMatchObject({ cell: tables[0]!.cell, side: tables[0]!.side, characterId: room.characterId });
          expect(room.anchors.some((a) => a.kind === 'spareCandle')).toBe(false);
          const [stand] = standsOf(room);
          expect(stand).toMatchObject({ id: `stand:${room.id}`, kind: 'table', characterId: room.characterId });
          expect(doorwayCells(room).has(stand!.cell)).toBe(false);
          // It stands against a wall, not in the open.
          const [x, y] = parseCell(stand!.cell);
          const [dx, dy] = DIR_STEP[stand!.wall];
          expect(room.cells.includes(cellId(x + dx, y + dy))).toBe(false);
        }
        player = wander(house, rng, player, 3);
        house.reshuffle(visibleAround(house, player, 2), player);
      }
    }
  }, 60_000);

  it('puts the candle and the matchbox at the Act 1 dead end', () => {
    const corridor = newHouse(42).getRoom('act1-corridor')!;
    const [stand] = standsOf(corridor);
    expect(stand).toMatchObject({ id: 'stand:act1-corridor', kind: 'stand', cell: '2,2', wall: 'S', matchbox: true });
  });

  it('gives about one ordinary room in six a spare candle on a plain wall', () => {
    let rooms = 0;
    let spare = 0;
    for (let seed = 0; seed < 100; seed++) {
      const house = newHouse(seed);
      house.update(house.startCell);
      for (const room of loadedRooms(house).filter((r) => r.id.startsWith('r:'))) {
        if (room.kind === 'corridor') {
          expect(standsOf(room)).toEqual([]);
          continue;
        }
        rooms++;
        const stands = standsOf(room);
        if (!stands.length) continue;
        spare++;
        expect(room.windows.some((w) => w.side === stands[0]!.wall && w.cell === stands[0]!.cell)).toBe(false);
        expect(doorwayCells(room).has(stands[0]!.cell)).toBe(false);
      }
    }
    expect(spare / rooms).toBeGreaterThan(0.1);
    expect(spare / rooms).toBeLessThan(0.25);
  });

  it('stands as furniture, so it is drawn and solid', () => {
    const house = newHouse(42);
    house.update(house.startCell);
    for (const room of [house.getRoom('act1-corridor')!, ...loadedRooms(house).filter((r) => standsOf(r).length)]) {
      const [stand] = standsOf(room);
      const piece = furnishRoom(room, 42).find((f) => f.kind === 'candleTable' || f.kind === 'candleStand');
      expect(piece).toMatchObject({ x: stand!.x, z: stand!.z, h: stand!.top, cells: [stand!.cell] });
    }
  });
});
