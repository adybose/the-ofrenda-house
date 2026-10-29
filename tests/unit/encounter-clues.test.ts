import { describe, expect, it } from 'vitest';
import { generateCase } from '../../src/case/generate';
import { REPLIES } from '../../src/dialogue/replies';
import { encounterReducer, encounterSetup, startEncounter } from '../../src/story/encounter';
import { createHouse } from '../../src/world/house';

describe('the clue cards a player can collect', () => {
  it('hold exactly one lie, the killer\'s, contradicting a true card from another spirit (1,000 seeds)', () => {
    const honest = REPLIES.find((r) => r.category === 'honest')!;
    for (let seed = 0; seed < 1000; seed++) {
      const caseFile = generateCase(seed);
      const house = createHouse(seed, caseFile);
      const collected: string[] = [];
      // Every spirit with a key room, each riddle answered right.
      for (const keyRoom of house.keyRooms()) {
        const setup = encounterSetup(caseFile, house.keyRooms(), keyRoom.characterId);
        let state = startEncounter({ ...setup, trust: 50 });
        for (const event of [{ type: 'greeted' }, { type: 'replied', reply: honest }, { type: 'reacted' }, { type: 'answered', index: 0, correctIndex: 0 }] as const) {
          state = encounterReducer(state, event);
          for (const emit of state.emits) if (emit.name === 'clueAwarded') collected.push(emit.factId);
        }
      }
      const cards = collected.map((id) => caseFile.facts.find((f) => f.id === id)!);
      const lies = cards.filter((f) => f.isLie);
      expect(lies, `seed ${seed}`).toHaveLength(1);
      const lie = lies[0]!;
      expect(lie.holderId, `seed ${seed}`).toBe(caseFile.killerId);
      const contradicted = cards.find((f) => f.id === caseFile.lie.contradictsFactId);
      expect(contradicted, `seed ${seed}: the contradicted card is collectable`).toBeDefined();
      expect(contradicted!.isLie).toBe(false);
      expect(contradicted!.holderId).not.toBe(caseFile.killerId);
    }
  });
});
