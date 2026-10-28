import { describe, expect, it } from 'vitest';
import { createRng, hashSeed, STREAMS, type Rng } from '../../src/core/rng';

function draw(rng: Rng, count: number): number[] {
  return Array.from({ length: count }, () => rng.float());
}

describe('createRng determinism', () => {
  it('gives the same first 10,000 values for the same seed', () => {
    expect(draw(createRng(42), 10_000)).toEqual(draw(createRng(42), 10_000));
    expect(draw(createRng('ofrenda'), 10_000)).toEqual(draw(createRng('ofrenda'), 10_000));
  });

  it('gives different sequences for different seeds', () => {
    expect(draw(createRng(42), 10)).not.toEqual(draw(createRng(43), 10));
    expect(draw(createRng('abc'), 10)).not.toEqual(draw(createRng('abd'), 10));
  });

  it('keeps the pinned first values for seed 42, so an algorithm change is caught', () => {
    expect(draw(createRng(42), 5)).toEqual(PINNED_SEED_42);
  });

  it('returns floats in [0, 1)', () => {
    for (const value of draw(createRng(7), 100_000)) {
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });
});

describe('hashSeed', () => {
  it('keeps unsigned 32-bit integers as they are', () => {
    expect(hashSeed(42)).toBe(42);
    expect(hashSeed(0)).toBe(0);
    expect(hashSeed(0xffffffff)).toBe(0xffffffff);
  });

  it('hashes strings and other numbers to stable unsigned 32-bit seeds', () => {
    for (const seed of ['hello', '', 'día de muertos', -1, 1.5, 2 ** 40]) {
      const hashed = hashSeed(seed);
      expect(Number.isInteger(hashed)).toBe(true);
      expect(hashed).toBeGreaterThanOrEqual(0);
      expect(hashed).toBeLessThanOrEqual(0xffffffff);
      expect(hashSeed(seed)).toBe(hashed);
    }
    expect(hashSeed('hello')).not.toBe(hashSeed('hellp'));
  });

  it('exposes the hashed seed on the generator', () => {
    expect(createRng(42).seed).toBe(42);
    expect(createRng('hello').seed).toBe(hashSeed('hello'));
  });
});

describe('fork', () => {
  it('drawing from one fork never changes another', () => {
    const untouched = draw(createRng(42).fork('b'), 100);

    const parent = createRng(42);
    const a = parent.fork('a');
    draw(a, 5_000);
    expect(draw(parent.fork('b'), 100)).toEqual(untouched);
  });

  it('depends only on the parent seed and label, not on draws from the parent', () => {
    const fresh = createRng(42).fork(STREAMS.case);
    const used = createRng(42);
    draw(used, 1_000);
    expect(draw(used.fork(STREAMS.case), 50)).toEqual(draw(fresh, 50));
  });

  it('gives the same stream for the same label and different streams for different labels', () => {
    const rng = createRng(42);
    expect(draw(rng.fork('house'), 50)).toEqual(draw(rng.fork('house'), 50));
    expect(draw(rng.fork('house'), 50)).not.toEqual(draw(rng.fork('case'), 50));
    expect(draw(rng.fork('house'), 50)).not.toEqual(draw(createRng(42), 50));
  });

  it('can fork forks deterministically', () => {
    const one = createRng(9).fork('house').fork('chunk:3,4');
    const two = createRng(9).fork('house').fork('chunk:3,4');
    expect(draw(one, 20)).toEqual(draw(two, 20));
  });

  it('has a distinct stream for every standard label', () => {
    const rng = createRng(42);
    const firsts = Object.values(STREAMS).map((label) => rng.fork(label).float());
    expect(new Set(firsts).size).toBe(Object.values(STREAMS).length);
  });
});

describe('int', () => {
  it('stays inside its inclusive bounds and reaches both ends', () => {
    const rng = createRng(1);
    const seen = new Set<number>();
    for (let i = 0; i < 100_000; i++) {
      const value = rng.int(-3, 3);
      expect(Number.isInteger(value)).toBe(true);
      expect(value).toBeGreaterThanOrEqual(-3);
      expect(value).toBeLessThanOrEqual(3);
      seen.add(value);
    }
    expect([...seen].sort((x, y) => x - y)).toEqual([-3, -2, -1, 0, 1, 2, 3]);
  });

  it('passes a loose chi-square uniformity test over 100,000 draws', () => {
    const rng = createRng(2024);
    const buckets = new Array<number>(10).fill(0);
    const draws = 100_000;
    for (let i = 0; i < draws; i++) {
      const value = rng.int(0, 9);
      buckets[value] = (buckets[value] ?? 0) + 1;
    }
    const expected = draws / 10;
    const chiSquare = buckets.reduce((sum, observed) => sum + (observed - expected) ** 2 / expected, 0);
    // 9 degrees of freedom: 27.88 is the p = 0.001 critical value.
    expect(chiSquare).toBeLessThan(27.88);
  });

  it('returns min when min equals max', () => {
    expect(createRng(3).int(5, 5)).toBe(5);
  });

  it('throws on reversed or non-integer bounds', () => {
    const rng = createRng(3);
    expect(() => rng.int(5, 4)).toThrow();
    expect(() => rng.int(0.5, 4)).toThrow();
  });
});

describe('chance', () => {
  it('is never true at 0 and always true at 1', () => {
    const rng = createRng(4);
    for (let i = 0; i < 1_000; i++) {
      expect(rng.chance(0)).toBe(false);
      expect(rng.chance(1)).toBe(true);
    }
  });

  it('is true about p of the time', () => {
    const rng = createRng(5);
    let hits = 0;
    for (let i = 0; i < 100_000; i++) if (rng.chance(0.3)) hits++;
    expect(hits / 100_000).toBeCloseTo(0.3, 2);
  });
});

describe('pick, weighted and shuffle', () => {
  it('pick returns an item from the list without mutating it', () => {
    const items = Object.freeze(['patriarch', 'painter', 'matriarch']);
    const rng = createRng(6);
    for (let i = 0; i < 100; i++) expect(items).toContain(rng.pick(items));
    expect(items).toEqual(['patriarch', 'painter', 'matriarch']);
  });

  it('pick throws on an empty list', () => {
    expect(() => createRng(6).pick([])).toThrow();
  });

  it('weighted follows the weights and never picks a zero weight', () => {
    const items = Object.freeze([
      Object.freeze({ value: 'usually', weight: 3 }),
      Object.freeze({ value: 'sometimes', weight: 1 }),
      Object.freeze({ value: 'never', weight: 0 }),
    ]);
    const rng = createRng(8);
    const counts: Record<string, number> = { usually: 0, sometimes: 0, never: 0 };
    for (let i = 0; i < 40_000; i++) {
      const value = rng.weighted(items);
      counts[value] = (counts[value] ?? 0) + 1;
    }
    expect(counts.never).toBe(0);
    expect((counts.usually ?? 0) / 40_000).toBeCloseTo(0.75, 1);
    expect(items[0]).toEqual({ value: 'usually', weight: 3 });
  });

  it('weighted throws on an empty list, a zero total or a negative weight', () => {
    const rng = createRng(8);
    expect(() => rng.weighted([])).toThrow();
    expect(() => rng.weighted([{ value: 'a', weight: 0 }])).toThrow();
    expect(() => rng.weighted([{ value: 'a', weight: 2 }, { value: 'b', weight: -1 }])).toThrow();
  });

  it('shuffle returns a permutation in a new array and leaves the input alone', () => {
    const items = Object.freeze([1, 2, 3, 4, 5, 6, 7, 8]);
    const shuffled = createRng(10).shuffle(items);
    expect(shuffled).not.toBe(items);
    expect([...shuffled].sort((x, y) => x - y)).toEqual([...items]);
    expect(items).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(createRng(10).shuffle(items)).toEqual(shuffled);
  });

  it('shuffle gives every order of three items over many runs', () => {
    const rng = createRng(11);
    const orders = new Set<string>();
    for (let i = 0; i < 600; i++) orders.add(rng.shuffle(['a', 'b', 'c']).join(''));
    expect(orders.size).toBe(6);
  });

  it('shuffle of an empty list is an empty list', () => {
    expect(createRng(12).shuffle([])).toEqual([]);
  });
});

// Taken from the first implementation (sfc32 seeded through splitmix32).
// If this fails, the algorithm changed and every saved seed now replays differently.
const PINNED_SEED_42 = [
  0.2072944741230458, 0.6512069271411747, 0.9914641629438847, 0.2893015253357589, 0.41498349350877106,
];
