import { describe, expect, it } from 'vitest';
import { generateCase } from '../../src/case/generate';
import { edgeCells, parseCell } from '../../src/world/grid';
import { createHouse } from '../../src/world/house';
import { furnishRoom } from '../../src/world/furniture';
import { CELL_SIZE } from '../../src/world/units';
import type { Room } from '../../src/world/types';

function roomsFor(seed: number): Room[] {
  const house = createHouse(seed, generateCase(seed));
  const rooms: Room[] = [];
  for (let cy = 0; cy < 3; cy++) for (let cx = -2; cx <= 2; cx++) rooms.push(...house.chunkAt(cx, cy).rooms);
  for (const k of house.keyRooms()) if (k.roomId) rooms.push(house.getRoom(k.roomId)!);
  return rooms;
}

/** Cells a door opens onto, plus the cell in front of it inside the room. */
function doorwayCells(room: Room): Set<string> {
  const cells = new Set<string>();
  for (const id of room.doors) {
    const [a, b] = id === 'front-door' ? ['7,0', '7,-1'] : edgeCells(id.slice(2));
    for (const cell of [a, b]) {
      if (!room.cells.includes(cell)) continue;
      cells.add(cell);
      const [x, y] = parseCell(cell);
      const [ox, oy] = parseCell(cell === a ? b : a);
      cells.add(`${x + (x - ox)},${y + (y - oy)}`);
    }
  }
  return cells;
}

describe('furnishRoom', () => {
  it('is deterministic', () => {
    for (const room of roomsFor(42)) expect(furnishRoom(room, 42)).toEqual(furnishRoom(room, 42));
  });

  it('keeps furniture inside the room, off the doorways and apart from each other', () => {
    let placed = 0;
    for (const seed of [1, 42, 99]) {
      for (const room of roomsFor(seed)) {
        const cells = new Set(room.cells);
        const doorway = doorwayCells(room);
        const items = furnishRoom(room, seed);
        placed += items.length;
        for (const item of items) {
          for (const cell of item.cells) {
            expect(cells.has(cell), `${room.id} ${item.kind} outside`).toBe(true);
            expect(doorway.has(cell), `${room.id} ${item.kind} blocks a door`).toBe(false);
          }
          // The footprint in metres sits over its cells.
          const [x, y] = parseCell(item.cells[0]!);
          expect(item.x).toBeGreaterThanOrEqual(x * CELL_SIZE - 3 * CELL_SIZE);
          expect(item.x).toBeLessThanOrEqual((x + 4) * CELL_SIZE);
          expect(item.z).toBeLessThanOrEqual(-(y - 3) * CELL_SIZE);
        }
        const used = items.flatMap((i) => i.cells);
        expect(new Set(used).size, `${room.id} overlaps`).toBe(used.length);
      }
    }
    expect(placed).toBeGreaterThan(100);
  });

  it('leaves corridors walkable: nothing but the Act 1 dead end’s candle stand (spec 18)', () => {
    for (const room of roomsFor(7).filter((r) => r.kind === 'corridor' || r.kind === 'act1Corridor')) {
      expect(furnishRoom(room, 7).map((f) => f.kind)).toEqual(room.kind === 'act1Corridor' ? ['candleStand'] : []);
    }
  });
});
