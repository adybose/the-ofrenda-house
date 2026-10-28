import { describe, expect, it } from 'vitest';
import { contradicts, solve } from '../../src/case/solve';
import type { CharacterId, Claim, Fact, FactKind } from '../../src/case/types';

function fact(id: string, holderId: CharacterId, kind: FactKind, claim: Claim, isLie = false): Fact {
  return { id, holderId, kind, claim, isLie, text: id };
}

const motive = (subject: CharacterId): Claim => ({ attribute: 'motive', subject, secretId: `secret-${subject}` });
const means = (subject: CharacterId, value: boolean): Claim => ({ attribute: 'means', subject, value });
const opportunity = (subject: CharacterId, value: boolean): Claim => ({ attribute: 'opportunity', subject, value });

// A is the killer and lies about their own whereabouts; B is a red herring
// cleared by C; C and D are innocent witnesses.
const A: CharacterId = 'doctor';
const B: CharacterId = 'bookkeeper';
const C: CharacterId = 'housekeeper';
const D: CharacterId = 'painter';
const facts = [
  fact('motiveA', C, 'motive', motive(A)),
  fact('motiveB', D, 'motive', motive(B)),
  fact('meansA', D, 'means', means(A, true)),
  fact('oppA', C, 'opportunity', opportunity(A, true)),
  fact('lieA', A, 'alibi', opportunity(A, false), true),
  fact('clearB', C, 'alibi', opportunity(B, false)),
];
const caseFile = { facts };
const sorted = (ids: readonly string[]) => [...ids].sort();

describe('contradicts', () => {
  it('is true only for opposite claims about the same subject and attribute', () => {
    expect(contradicts(opportunity(A, true), opportunity(A, false))).toBe(true);
    expect(contradicts(means(A, true), means(A, false))).toBe(true);
    expect(contradicts(opportunity(A, true), opportunity(A, true))).toBe(false);
    expect(contradicts(opportunity(A, true), opportunity(B, false))).toBe(false);
    expect(contradicts(opportunity(A, true), means(A, false))).toBe(false);
    expect(contradicts(motive(A), opportunity(A, false))).toBe(false);
  });
});

describe('solve', () => {
  it('names only the killer once every fact is known', () => {
    expect(solve(caseFile)).toEqual([A]);
    expect(solve(caseFile, facts.map((f) => f.id))).toEqual([A]);
  });

  it('has no suspects before any motive is known', () => {
    expect(solve(caseFile, [])).toEqual([]);
    expect(solve(caseFile, ['meansA', 'oppA'])).toEqual([]);
  });

  it('counts everyone with a known motive who has not been cleared', () => {
    expect(sorted(solve(caseFile, ['motiveA', 'motiveB']))).toEqual(sorted([A, B]));
    expect(solve(caseFile, ['motiveA', 'motiveB', 'clearB'])).toEqual([A]);
  });

  it('does not clear someone on their own word alone, since they may be the liar', () => {
    expect(sorted(solve(caseFile, ['motiveA', 'motiveB', 'lieA']))).toEqual(sorted([A, B]));
  });

  it('clears the holder of a self-alibi once a contradiction proves the alibi false', () => {
    // Without clearB, B stays a suspect; the lie and oppA contradict, so the
    // killer must be A (the liar) or C (who holds no motive).
    expect(solve(caseFile, ['motiveA', 'motiveB', 'oppA', 'lieA'])).toEqual([A]);
  });

  it('still names the killer when the other half of the contradiction is a cleared suspect', () => {
    const withSuspectWitness = [
      fact('motiveA', C, 'motive', motive(A)),
      fact('motiveB', D, 'motive', motive(B)),
      fact('oppA', B, 'opportunity', opportunity(A, true)),
      fact('lieA', A, 'alibi', opportunity(A, false), true),
      fact('clearB', C, 'alibi', opportunity(B, false)),
    ];
    expect(solve({ facts: withSuspectWitness })).toEqual([A]);
  });

  it('rules out a suspect who can only escape the contradiction by giving up their own alibi', () => {
    // B holds both the truth about A and B's own alibi. Calling the truth a
    // lie leaves B's alibi standing; calling the alibi a lie leaves the
    // contradiction. Either way B is out.
    const selfCleared = [
      fact('motiveA', C, 'motive', motive(A)),
      fact('motiveB', D, 'motive', motive(B)),
      fact('oppA', B, 'opportunity', opportunity(A, true)),
      fact('lieA', A, 'alibi', opportunity(A, false), true),
      fact('clearB', B, 'alibi', opportunity(B, false)),
    ];
    expect(solve({ facts: selfCleared })).toEqual([A]);
  });

  it('ignores unknown fact ids', () => {
    expect(solve(caseFile, ['motiveA', 'nope'])).toEqual([A]);
  });
});
