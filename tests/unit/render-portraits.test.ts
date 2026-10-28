import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { generateCase } from '../../src/case/generate';
import { createRng } from '../../src/core/rng';
import { PORTRAIT_VARIANTS, generatePortrait } from '../../src/render/portraits';

const hash = (data: Uint8ClampedArray) => createHash('sha256').update(data).digest('hex');

describe('generatePortrait', () => {
  const caseFile = generateCase(42);

  it('gives identical pixels for the same character, variant and seed', () => {
    for (const character of caseFile.characters) {
      for (const variant of PORTRAIT_VARIANTS) {
        const a = generatePortrait(character, variant, createRng(42).fork(`portrait:${character.id}`));
        const b = generatePortrait(character, variant, createRng(42).fork(`portrait:${character.id}`));
        expect(hash(a.data)).toBe(hash(b.data));
      }
    }
  });

  it('gives a different picture for every character in a household', () => {
    for (const seed of [1, 42, 300]) {
      const household = generateCase(seed).characters;
      const hashes = household.map((c) => hash(generatePortrait(c, 'normal', createRng(seed).fork(`portrait:${c.id}`)).data));
      expect(new Set(hashes).size).toBe(household.length);
    }
  });

  it('gives every variant its own picture', () => {
    const character = caseFile.characters.find((c) => c.id === caseFile.killerId)!;
    const hashes = PORTRAIT_VARIANTS.map((v) => hash(generatePortrait(character, v, createRng(42).fork('p')).data));
    expect(new Set(hashes).size).toBe(PORTRAIT_VARIANTS.length);
    expect(PORTRAIT_VARIANTS).toEqual(['normal', 'empty', 'smile', 'elena', 'player']);
  });

  it('is a small opaque image', () => {
    const image = generatePortrait(caseFile.characters[0]!, 'normal', createRng(1));
    expect(image.width).toBeLessThanOrEqual(64);
    expect(image.height).toBeLessThanOrEqual(80);
    expect(image.data.length).toBe(image.width * image.height * 4);
  });
});
