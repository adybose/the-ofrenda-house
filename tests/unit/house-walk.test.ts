import { describe, expect, it } from 'vitest';
import { LOAD_RADIUS, MAX_LOADED_CHUNKS, UNLOAD_RADIUS, chebyshev, chunkId, chunkOfCell, parseCell } from '../../src/world/grid';
import { createRng, legalSteps, newHouse } from './house-helpers';

describe('loading and unloading', () => {
  it('keeps at most the maximum loaded over a 500-cell walk and never unloads the player chunk', () => {
    let unloads = 0;
    for (const seed of [1, 2, 3, 42, 99]) {
      const house = newHouse(seed);
      house.endAct1();
      const rng = createRng(seed).fork('walk');
      // Start just through the Act 1 exit, in the endless part of the house.
      let cell = '-1,2';
      let heading = 0;
      let steps = 0;
      const visits = new Map<string, number>();
      const chunksVisited = new Set<string>();
      house.update(cell);
      while (steps < 500) {
        const options = legalSteps(house, cell);
        expect(options.length, `stuck at ${cell}`).toBeGreaterThan(0);
        // Keep walking roughly the same way, and prefer new ground, so the walk crosses chunks.
        if (rng.chance(0.1)) heading = rng.int(0, 3);
        const [x, y] = parseCell(cell);
        visits.set(cell, (visits.get(cell) ?? 0) + 1);
        const scored = options.map((o) => {
          const [ox, oy] = parseCell(o);
          const along = [oy - y, ox - x, y - oy, x - ox][heading]!;
          return { o, score: along + rng.float() * 1.5 - (visits.get(o) ?? 0) * 2 };
        });
        scored.sort((a, b) => b.score - a.score);
        cell = scored[0]!.o;
        steps++;

        const [pcx, pcy] = chunkOfCell(cell);
        const diff = house.update(cell);
        unloads += diff.unloaded.length;
        expect(diff.unloaded).not.toContain(chunkId(pcx, pcy));
        const loaded = house.loadedChunks();
        expect(loaded.length).toBeLessThanOrEqual(MAX_LOADED_CHUNKS);
        expect(loaded.map((c) => c.id)).toContain(chunkId(pcx, pcy));
        for (const chunk of loaded) expect(chebyshev(chunk.cx, chunk.cy, pcx, pcy)).toBeLessThanOrEqual(UNLOAD_RADIUS);
        for (let dx = -LOAD_RADIUS; dx <= LOAD_RADIUS; dx++) {
          for (let dy = -LOAD_RADIUS; dy <= LOAD_RADIUS; dy++) {
            if (pcy + dy >= 0) expect(loaded.map((c) => c.id)).toContain(chunkId(pcx + dx, pcy + dy));
          }
        }
        chunksVisited.add(chunkId(pcx, pcy));
      }
      expect(chunksVisited.size, `seed ${seed} never left its chunk`).toBeGreaterThan(1);
    }
    // The walks really do load and unload chunks.
    expect(unloads).toBeGreaterThan(0);
  });

  it('gives back the same chunk after unloading and reloading, with no reshuffle in between', () => {
    const house = newHouse(42);
    const first = house.update(house.startCell).loaded.find((c) => c.id === '-1,1');
    expect(first).toBeDefined();
    const before = JSON.stringify(first);
    // Walk the player's position far away and back by teleporting the update.
    house.update('200,200');
    expect(house.loadedChunks().map((c) => c.id)).not.toContain('-1,1');
    const again = house.update(house.startCell).loaded.find((c) => c.id === '-1,1');
    expect(JSON.stringify(again)).toBe(before);
  });
});
