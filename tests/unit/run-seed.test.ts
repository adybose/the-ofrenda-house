import { describe, expect, it } from 'vitest';
import { hashSeed } from '../../src/core/rng';
import { readRunSeed } from '../../src/core/run-seed';

describe('readRunSeed', () => {
  it('uses a numeric ?seed= as the seed itself', () => {
    expect(readRunSeed(new URL('http://localhost/?seed=42'))).toEqual({ seed: 42, fromUrl: true });
  });

  it('hashes a text ?seed=', () => {
    expect(readRunSeed(new URL('http://localhost/?seed=elena'))).toEqual({ seed: hashSeed('elena'), fromUrl: true });
  });

  it('keeps working alongside other debug flags', () => {
    expect(readRunSeed(new URL('http://localhost/?skip=act1&seed=7'))).toEqual({ seed: 7, fromUrl: true });
  });

  it('chooses a fresh unsigned 32-bit seed when there is none', () => {
    for (const url of ['http://localhost/', 'http://localhost/?seed=']) {
      const { seed, fromUrl } = readRunSeed(new URL(url));
      expect(fromUrl).toBe(false);
      expect(Number.isInteger(seed)).toBe(true);
      expect(seed).toBeGreaterThanOrEqual(0);
      expect(seed).toBeLessThanOrEqual(0xffffffff);
    }
  });
});
