import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { createRng } from '../../src/core/rng';
import { TEXTURE_KINDS, generateTexture } from '../../src/render/textures';

const hash = (data: Uint8ClampedArray) => createHash('sha256').update(data).digest('hex');

describe('generateTexture', () => {
  it('gives identical pixels for the same kind and seed', () => {
    for (const kind of TEXTURE_KINDS) {
      const a = generateTexture(kind, createRng(42).fork(kind));
      const b = generateTexture(kind, createRng(42).fork(kind));
      expect(hash(a.data), kind).toBe(hash(b.data));
    }
  });

  it('gives different pixels for different kinds and different seeds', () => {
    const hashes = TEXTURE_KINDS.map((kind) => hash(generateTexture(kind, createRng(42).fork(kind)).data));
    expect(new Set(hashes).size).toBe(TEXTURE_KINDS.length);
    let changed = 0;
    for (const kind of TEXTURE_KINDS) {
      if (hash(generateTexture(kind, createRng(1).fork(kind)).data) !== hash(generateTexture(kind, createRng(2).fork(kind)).data)) changed++;
    }
    // A few textures (like plain glass) may be flat; nearly all vary with the seed.
    expect(changed).toBeGreaterThan(TEXTURE_KINDS.length * 0.8);
  });

  it('is low resolution, opaque RGBA, 64 px wide and 64 or 128 px tall', () => {
    for (const kind of TEXTURE_KINDS) {
      const image = generateTexture(kind, createRng(3).fork(kind));
      expect(image.width).toBe(64);
      expect([64, 128]).toContain(image.height);
      expect(image.data.length).toBe(image.width * image.height * 4);
      for (let i = 3; i < image.data.length; i += 4) expect(image.data[i]).toBe(255);
    }
  });

  it('covers the surfaces the spec names', () => {
    for (const kind of ['wallDamask', 'wallStripes', 'floorboards', 'floorTiles', 'plaster', 'door', 'frame'] as const) {
      expect(TEXTURE_KINDS).toContain(kind);
    }
  });

  it('is not flat: every texture uses more than a handful of colours', () => {
    for (const kind of TEXTURE_KINDS) {
      const { data } = generateTexture(kind, createRng(5).fork(kind));
      const colours = new Set<number>();
      for (let i = 0; i < data.length; i += 4) colours.add((data[i]! << 16) | (data[i + 1]! << 8) | data[i + 2]!);
      expect(colours.size, kind).toBeGreaterThan(8);
    }
  });
});
