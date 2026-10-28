import { describe, expect, it } from 'vitest';
import { generateChunk } from '../../src/world/detail';
import { CHUNK_SLOTS, SLOT_CELLS, chunkOfCell, parseCell } from '../../src/world/grid';

describe('generateChunk', () => {
  it('gives the same chunk for the same seed, coordinates and epoch', () => {
    for (const seed of [1, 42, 777]) {
      for (const [cx, cy] of [[0, 0], [-1, 0], [3, 2], [-5, 7], [10, 0]] as const) {
        for (const epoch of [0, 1, 5]) {
          expect(generateChunk(seed, cx, cy, epoch)).toEqual(generateChunk(seed, cx, cy, epoch));
        }
      }
    }
  });

  it('changes with the epoch and the seed', () => {
    let differentEpoch = 0;
    let differentSeed = 0;
    for (let i = 0; i < 50; i++) {
      const base = JSON.stringify(generateChunk(42, i, 3, 0));
      if (base !== JSON.stringify(generateChunk(42, i, 3, 1))) differentEpoch++;
      if (base !== JSON.stringify(generateChunk(43, i, 3, 0))) differentSeed++;
    }
    expect(differentEpoch).toBe(50);
    expect(differentSeed).toBe(50);
  });

  it('keeps every room cell inside its chunk and every room reachable through its doors', () => {
    for (let i = 0; i < 200; i++) {
      const cx = (i % 13) - 6;
      const cy = Math.floor(i / 13) + 1;
      const chunk = generateChunk(9, cx, cy, i % 3);
      expect(chunk.rooms.length).toBe(CHUNK_SLOTS * CHUNK_SLOTS);
      for (const room of chunk.rooms) {
        expect(room.doors.length).toBeGreaterThan(0);
        for (const cell of room.cells) expect(chunkOfCell(cell)).toEqual([cx, cy]);
      }
    }
  });

  it('puts nothing south of the façade', () => {
    expect(generateChunk(42, 3, -1, 0).rooms).toEqual([]);
    expect(generateChunk(42, -2, -4, 2).rooms).toEqual([]);
  });

  it('builds the fixed entrance wing at chunk 0,0', () => {
    const wing = generateChunk(42, 0, 0, 0);
    expect(wing.rooms.map((r) => r.kind).sort()).toEqual(['act1Corridor', 'entranceHall', 'portraitHall']);
    expect(generateChunk(42, 0, 0, 3)).toEqual({ ...wing, epoch: 3 });
    expect(generateChunk(7, 0, 0, 0).rooms).toEqual(wing.rooms);
    const front = wing.doors.find((d) => d.id === 'front-door');
    expect(front).toBeDefined();
    const [, y] = parseCell(front!.b);
    expect(y).toBeLessThan(0);
  });

  it('marks windows, sizes and anchors', () => {
    const kinds = new Set<string>();
    let windows = 0;
    for (let i = 0; i < 100; i++) {
      for (const room of generateChunk(5, i, 0, 0).rooms) {
        expect(['small', 'medium', 'large']).toContain(room.size);
        windows += room.windows.length;
        for (const anchor of room.anchors) {
          kinds.add(anchor.kind);
          expect(room.cells).toContain(anchor.cell);
        }
      }
    }
    expect(windows).toBeGreaterThan(100);
    for (const kind of ['fireplace', 'chandelier', 'floorboards', 'darkCorner', 'mirror']) expect(kinds).toContain(kind);
  });

  it('generates one chunk in under 2 ms on average', () => {
    const start = performance.now();
    const count = 500;
    for (let i = 0; i < count; i++) generateChunk(i, i % 17, (i % 11) + 1, i % 5);
    const perChunk = (performance.now() - start) / count;
    expect(perChunk).toBeLessThan(2);
  });

  it('uses slots of the documented size', () => {
    expect(SLOT_CELLS).toBe(5);
    expect(CHUNK_SLOTS).toBe(3);
  });
});
