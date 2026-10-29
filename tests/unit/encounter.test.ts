import { describe, expect, it } from 'vitest';
import { REPLIES, type Reply } from '../../src/dialogue/replies';
import { encounterReducer, startEncounter, type EncounterEvent, type EncounterState } from '../../src/story/encounter';

const honest = REPLIES.find((r) => r.id === 'family')!;
const lie = REPLIES.find((r) => r.category === 'lie')!;

const start = (trust = 50) => startEncounter({ characterId: 'cook', trust, factIds: ['f1'], keyIds: ['key:gardener'] });

function run(state: EncounterState, ...events: EncounterEvent[]): EncounterState {
  return events.reduce(encounterReducer, state);
}

const toRiddle = (state: EncounterState, reply: Reply = honest) => run(state, { type: 'greeted' }, { type: 'replied', reply }, { type: 'reacted' });

describe('the encounter reducer', () => {
  it('starts at the appearance and announces the encounter', () => {
    const state = start();
    expect(state.step).toBe('appear');
    expect(state.emits).toEqual([{ name: 'encounterStarted', characterId: 'cook' }]);
  });

  it('only allows the steps in order: appear, who are you, reaction, riddle', () => {
    let state = start();
    // Skipping ahead does nothing.
    for (const event of [{ type: 'replied', reply: honest }, { type: 'reacted' }, { type: 'answered', index: 0, correctIndex: 0 }, { type: 'ended' }] as EncounterEvent[]) {
      const next = encounterReducer(state, event);
      expect(next.step, event.type).toBe('appear');
      expect(next.emits).toEqual([]);
    }
    state = encounterReducer(state, { type: 'greeted' });
    expect(state.step).toBe('whoAreYou');
    expect(encounterReducer(state, { type: 'greeted' }).step).toBe('whoAreYou');
    state = encounterReducer(state, { type: 'replied', reply: honest });
    expect(state.step).toBe('reaction');
    expect(state.trust).toBe(70);
    state = encounterReducer(state, { type: 'reacted' });
    expect(state.step).toBe('riddle');
  });

  it('rewards a right answer with the clue and the key, then ends', () => {
    let state = run(toRiddle(start()), { type: 'answered', index: 2, correctIndex: 2 });
    expect(state.step).toBe('reward');
    expect(state.emits).toEqual([
      { name: 'clueAwarded', factId: 'f1' },
      { name: 'keyAwarded', keyId: 'key:gardener' },
    ]);
    state = encounterReducer(state, { type: 'ended' });
    expect(state.step).toBe('done');
    expect(state.emits).toEqual([{ name: 'encounterEnded', characterId: 'cook', outcome: 'reward' }]);
  });

  it('gives a second try, once, with the wrong option removed, only when trust is warm', () => {
    // Warm: 50 + 20 = 70.
    let state = run(toRiddle(start()), { type: 'answered', index: 1, correctIndex: 3 });
    expect(state.step).toBe('riddle');
    expect(state.secondTry).toBe(true);
    expect(state.removed).toEqual([1]);
    expect(state.emits).toEqual([]);
    // The second try can still be won...
    expect(encounterReducer(state, { type: 'answered', index: 3, correctIndex: 3 }).step).toBe('reward');
    // ...but a second wrong answer is silence.
    state = encounterReducer(state, { type: 'answered', index: 0, correctIndex: 3 });
    expect(state.step).toBe('silence');

    // Wary or neutral: straight to silence.
    const cold = run(toRiddle(start(), lie), { type: 'answered', index: 1, correctIndex: 3 });
    expect(cold.trust).toBeLessThan(70);
    expect(cold.step).toBe('silence');
  });

  it('falls silent with no clue or key, and raises riddleFailed', () => {
    let state = run(toRiddle(start(20)), { type: 'answered', index: 0, correctIndex: 1 });
    expect(state.step).toBe('silence');
    expect(state.emits).toEqual([{ name: 'riddleFailed', characterId: 'cook' }]);
    state = encounterReducer(state, { type: 'ended' });
    expect(state.emits).toEqual([{ name: 'encounterEnded', characterId: 'cook', outcome: 'silence' }]);
    // Nothing more happens after the end.
    expect(encounterReducer(state, { type: 'answered', index: 1, correctIndex: 1 }).step).toBe('done');
  });

  it('awards nothing extra for a spirit with no clue and no key', () => {
    const state = run(toRiddle(startEncounter({ characterId: 'gardener', trust: 50, factIds: [], keyIds: [] })), { type: 'answered', index: 0, correctIndex: 0 });
    expect(state.step).toBe('reward');
    expect(state.emits).toEqual([]);
  });
});
