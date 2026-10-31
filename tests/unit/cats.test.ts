import { describe, expect, it } from 'vitest';
import { CAT_ODDS, placeCats } from '../../src/scares/cats';
import { furnishRoom } from '../../src/world/furniture';
import { newHouse } from './house-helpers';

describe('cats', () => {
  it('sit on furniture tops in about one ordinary room in seven, the same for a seed', () => {
    let rooms = 0;
    let cats = 0;
    for (let seed = 0; seed < 60; seed++) {
      const house = newHouse(seed);
      house.update(house.startCell);
      for (const room of house.loadedChunks().flatMap((c) => c.rooms)) {
        const furniture = furnishRoom(room, seed);
        const seats = placeCats(room, furniture, seed);
        expect(placeCats(room, furniture, seed)).toEqual(seats);
        if (!room.id.startsWith('r:') || room.kind === 'corridor') {
          expect(seats).toEqual([]);
          continue;
        }
        if (!furniture.some((f) => ['table', 'sideTable', 'nightstand', 'desk', 'piano', 'toyChest', 'sewingTable', 'washstand'].includes(f.kind))) continue;
        rooms++;
        for (const seat of seats) {
          cats++;
          // On top of a piece of furniture, inside its footprint.
          const under = furniture.find((f) => Math.abs(f.x - seat.x) <= f.w / 2 + 0.01 || Math.abs(f.z - seat.z) <= f.w / 2 + 0.01);
          expect(under).toBeDefined();
          expect(seat.y).toBeGreaterThan(0.4);
          if (seat.vase) expect(seat.vase.y).toBe(seat.y);
        }
      }
    }
    expect(cats / rooms).toBeGreaterThan(CAT_ODDS - 0.06);
    expect(cats / rooms).toBeLessThan(CAT_ODDS + 0.06);
  });

  it('sit everywhere they can with `all` (debug)', () => {
    const house = newHouse(42);
    house.update(house.startCell);
    for (const room of house.loadedChunks().flatMap((c) => c.rooms)) {
      const furniture = furnishRoom(room, 42);
      const fits = room.id.startsWith('r:') && room.kind !== 'corridor' && furniture.some((f) => ['table', 'sideTable', 'nightstand', 'desk', 'piano', 'toyChest', 'sewingTable', 'washstand'].includes(f.kind));
      expect(placeCats(room, furniture, 42, true).length).toBe(fits ? 1 : 0);
    }
  });
});
