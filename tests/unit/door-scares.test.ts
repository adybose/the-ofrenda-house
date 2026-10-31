import { describe, expect, it } from 'vitest';
import { createRng } from '../../src/core/rng';
import { CHANDELIER_SHARE, DOOR_SCARE_CHANCE, doorScare, paintingSpot } from '../../src/scares/door-scares';
import type { Room } from '../../src/world/types';
import { newHouse } from './house-helpers';

const room = (chandelier: boolean): Room => ({
  id: 'r:1,1:0',
  kind: 'parlour',
  size: 'large',
  chunkId: '0,0',
  cells: Array.from({ length: 25 }, (_, i) => `${5 + (i % 5)},${5 + Math.floor(i / 5)}`),
  doors: ['d:1,0:N'],
  windows: [],
  anchors: chandelier ? [{ kind: 'chandelier', cell: '7,7' }] : [],
});

describe('door scares', () => {
  it('come about 55% of the time, the chandelier only where one hangs, the same for a seed', () => {
    expect(DOOR_SCARE_CHANCE).toBe(0.55);
    const rng = createRng(3);
    const counts = { none: 0, bats: 0, batsChandelier: 0, rats: 0 };
    for (let i = 0; i < 2000; i++) counts[doorScare(room(i % 2 === 0), rng) ?? 'none']++;
    expect(1 - counts.none / 2000).toBeGreaterThan(DOOR_SCARE_CHANCE - 0.04);
    expect(1 - counts.none / 2000).toBeLessThan(DOOR_SCARE_CHANCE + 0.04);
    expect(counts.batsChandelier).toBeGreaterThan(0);
    const plain = createRng(4);
    for (let i = 0; i < 500; i++) expect(doorScare(room(false), plain)).not.toBe('batsChandelier');
    const a = Array.from({ length: 50 }, (_, i) => doorScare(room(true), createRng(9).fork(String(i))));
    const b = Array.from({ length: 50 }, (_, i) => doorScare(room(true), createRng(9).fork(String(i))));
    expect(a).toEqual(b);
  });

  it('bring the chandelier down about 70% of the time where one hangs (spec 25)', () => {
    const rng = createRng(5);
    let scares = 0;
    let falls = 0;
    for (let i = 0; i < 4000; i++) {
      const scare = doorScare(room(true), rng);
      if (!scare) continue;
      scares++;
      if (scare === 'batsChandelier') falls++;
    }
    expect(falls / scares).toBeGreaterThan(CHANDELIER_SHARE - 0.04);
    expect(falls / scares).toBeLessThan(CHANDELIER_SHARE + 0.04);
  });

  it('can be forced for tests, never with a chandelier that isn’t there', () => {
    expect(doorScare(room(true), createRng(1), 'batsChandelier')).toBe('batsChandelier');
    expect(doorScare(room(false), createRng(1), 'batsChandelier')).toBe('bats');
    expect(doorScare(room(false), createRng(1), 'rats')).toBe('rats');
  });
});

describe('where a painting can fall', () => {
  // The 5×5 room above spans x 7.5..15 m and z -7.5..-15 m (cells 5..9 by 5..9); its door is in the south wall at x 7.
  it('only on a plain wall straight ahead, 1.2 to 3 m away', () => {
    const r = room(false);
    // Facing north (yaw 0) from 2 m below the north wall: the wall is ahead.
    const spot = paintingSpot(r, { x: 11.25, z: -13, yaw: 0 })!;
    expect(spot.side).toBe('N');
    expect(spot.z).toBeCloseTo(-15, 1);
    // Too close, too far, or facing the doorway: nothing.
    expect(paintingSpot(r, { x: 11.25, z: -14.5, yaw: 0 })).toBeUndefined();
    expect(paintingSpot(r, { x: 11.25, z: -8, yaw: 0 })).toBeUndefined();
    expect(paintingSpot(r, { x: 11.25, z: -9.5, yaw: Math.PI })).toBeUndefined();
  });

  it('is always on the player’s own room’s wall, in real houses', () => {
    const house = newHouse(42);
    house.update(house.startCell);
    let found = 0;
    for (const r of house.loadedChunks().flatMap((c) => c.rooms)) {
      for (const cell of r.cells) {
        const [x, y] = cell.split(',').map(Number) as [number, number];
        for (const yaw of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) {
          const spot = paintingSpot(r, { x: (x + 0.5) * 1.5, z: -(y + 0.5) * 1.5, yaw });
          if (!spot) continue;
          found++;
          expect(r.cells).toContain(spot.cell);
          const d = Math.hypot(spot.x - (x + 0.5) * 1.5, spot.z + (y + 0.5) * 1.5);
          expect(d).toBeGreaterThanOrEqual(1.2);
          expect(d).toBeLessThanOrEqual(3);
        }
      }
    }
    expect(found).toBeGreaterThan(50);
  });
});
