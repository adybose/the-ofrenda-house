import { describe, expect, it } from 'vitest';
import { wallsUpAt } from '../../src/story/act1';
import { parseCell } from '../../src/world/grid';
import { newHouse } from './house-helpers';

describe('the Act 1 corridor walling up behind the player', () => {
  it('only happens where the player still stands in the corridor afterwards, with the dead end ahead', () => {
    for (let seed = 0; seed < 50; seed++) {
      const house = newHouse(seed);
      house.update(house.startCell);
      const before = house.getRoom('act1-corridor')!.cells;
      const triggers = before.filter((c) => wallsUpAt(...parseCell(c)));
      expect(triggers.length).toBeGreaterThan(0);
      house.shiftCorridorBehind();
      for (const cell of triggers) {
        expect(house.roomAt(cell)?.id, `seed ${seed} ${cell}`).toBe('act1-corridor');
        for (const end of ['2,3', '2,2', '1,2', '0,2']) expect(house.pathBetween(cell, end)).not.toBeNull();
      }
      // The way back is gone.
      expect(house.getDoor('d:0,2:E')).toBeUndefined();
    }
  });

  it('never fires in the cells by the back door, which the wall takes away', () => {
    for (const cell of ['4,12', '3,12', '2,12', '2,11'] as const) expect(wallsUpAt(...parseCell(cell))).toBe(false);
  });
});
