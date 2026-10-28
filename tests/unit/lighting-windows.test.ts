import { describe, expect, it } from 'vitest';
import { nearestWindow } from '../../src/lighting/windows';
import type { Room } from '../../src/world/types';
import { CELL_SIZE } from '../../src/world/units';

const room = (windows: Room['windows']): Room => ({
  id: 'r', kind: 'parlour', size: 'large', chunkId: '0,1', cells: [], doors: [], windows, anchors: [],
});

describe('nearestWindow', () => {
  it('finds the closest window and points out through it', () => {
    const rooms = [room([{ cell: '2,4', side: 'N' }, { cell: '10,4', side: 'E' }])];
    const near = nearestWindow(rooms, 2.5 * CELL_SIZE, -4 * CELL_SIZE, 30)!;
    expect(near.x).toBeCloseTo(2.5 * CELL_SIZE, 5);
    expect(near.z).toBeCloseTo(-5 * CELL_SIZE, 5);
    expect(near.outward).toEqual([0, -1]);
  });

  it('gives the outward direction for each wall', () => {
    const cases = [['N', [0, -1]], ['S', [0, 1]], ['E', [1, 0]], ['W', [-1, 0]]] as const;
    for (const [side, outward] of cases) {
      expect(nearestWindow([room([{ cell: '0,0', side }])], 0.75, -0.75, 30)?.outward).toEqual(outward);
    }
  });

  it('ignores windows beyond the range', () => {
    expect(nearestWindow([room([{ cell: '40,40', side: 'N' }])], 0, 0, 20)).toBeUndefined();
  });
});
