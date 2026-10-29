import { describe, expect, it } from 'vitest';
import { generateCase } from '../../src/case/generate';
import { solve } from '../../src/case/solve';
import { ENOUGH_RIDDLES, EXIT_KEY, accusationKey, accusationOptions, enoughClues } from '../../src/story/accusation';
import type { KeyRoomState } from '../../src/world/types';

describe('enough clues', () => {
  it('is enough when the cards leave one suspect, or after 4 riddles', () => {
    for (let seed = 0; seed < 100; seed++) {
      const caseFile = generateCase(seed);
      const all = caseFile.facts.map((f) => f.id);
      expect(enoughClues(caseFile, all, 1)).toBe(true);
      expect(enoughClues(caseFile, [], ENOUGH_RIDDLES - 1)).toBe(false);
      expect(enoughClues(caseFile, [], ENOUGH_RIDDLES)).toBe(true);
      // A hand of cards that still leaves two or more suspects is not enough on its own.
      const some = all.filter((_, i) => i % 3 === 0);
      if (solve(caseFile, some).length !== 1) expect(enoughClues(caseFile, some, 2)).toBe(false);
    }
  });
});

describe('the names offered', () => {
  it('are 3 or 4 people with secrets, always including the killer and never the patriarch (1,000 seeds)', () => {
    for (let seed = 0; seed < 1000; seed++) {
      const caseFile = generateCase(seed);
      const options = accusationOptions(caseFile);
      expect(options.length, `seed ${seed}`).toBeGreaterThanOrEqual(3);
      expect(options.length).toBeLessThanOrEqual(4);
      expect(options).toContain(caseFile.killerId);
      const patriarch = caseFile.characters.find((c) => c.role === 'patriarch')!;
      expect(options).not.toContain(patriarch.id);
      expect(new Set(options).size).toBe(options.length);
    }
  });
});

describe('the key an answer leaves', () => {
  const room = (keyId: string, locked: boolean): KeyRoomState => ({ characterId: keyId.slice(4) as never, style: 'study', keyId, locked, visited: false });
  const locked = [room('key:cook', false), room('key:doctor', true), room('key:gardener', true)];

  it('is the way out for the right name', () => {
    expect(accusationKey({ correct: true, locked, given: new Set() })).toBe(EXIT_KEY);
  });

  it('is the next still-locked room’s key not yet given, for a wrong name', () => {
    expect(accusationKey({ correct: false, locked, given: new Set() })).toBe('key:doctor');
    expect(accusationKey({ correct: false, locked, given: new Set(['key:doctor']) })).toBe('key:gardener');
  });

  it('is nothing once every locked room’s key is out, or nothing is locked', () => {
    expect(accusationKey({ correct: false, locked, given: new Set(['key:doctor', 'key:gardener']) })).toBeUndefined();
    expect(accusationKey({ correct: false, locked: [room('key:cook', false)], given: new Set() })).toBeUndefined();
  });
});
