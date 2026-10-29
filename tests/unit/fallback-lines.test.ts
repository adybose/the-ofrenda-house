import { describe, expect, it } from 'vitest';
import { generateCase } from '../../src/case/generate';
import { fallbackLine } from '../../src/dialogue/fallback-lines';
import { STEPS } from '../../server/llm/types';

describe('fallback lines, shared by the server and the game', () => {
  it('give every step of every spirit a line, and a riddle with the right answer exactly once', () => {
    for (let seed = 0; seed < 200; seed++) {
      const caseFile = generateCase(seed);
      for (const character of caseFile.characters.filter((c) => c.role !== 'patriarch')) {
        for (const step of STEPS.filter((s) => s !== 'taunt')) {
          const response = fallbackLine(seed, caseFile, character, { step, trust: 50, lastChoiceCategory: 'honest' });
          expect(response.source).toBe('fallback');
          expect(response.line.length, `${seed} ${character.id} ${step}`).toBeGreaterThan(0);
          if (step === 'riddle') {
            const riddle = response.riddle!;
            expect(riddle.options).toHaveLength(4);
            expect(riddle.options.filter((o) => o === character.riddle.answer)).toHaveLength(1);
            expect(riddle.options[riddle.correctIndex]).toBe(character.riddle.answer);
          }
          if (step === 'reward') for (const fact of caseFile.facts.filter((f) => f.holderId === character.id)) expect(response.line).toContain(fact.text);
        }
      }
    }
  });
});
