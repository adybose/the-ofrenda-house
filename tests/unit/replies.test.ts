import { describe, expect, it } from 'vitest';
import { generateCase } from '../../src/case/generate';
import { createRng, STREAMS } from '../../src/core/rng';
import { REPLIES, draw } from '../../src/dialogue/replies';

describe('who-are-you replies', () => {
  it('draw 3 or 4 different replies, at least one honest, the same for the same seed', () => {
    for (let seed = 0; seed < 1000; seed++) {
      for (const character of generateCase(seed).characters) {
        const replies = draw(createRng(seed).fork(STREAMS.dialogue), character.id);
        expect(replies.length, `${seed} ${character.id}`).toBeGreaterThanOrEqual(3);
        expect(replies.length).toBeLessThanOrEqual(4);
        expect(new Set(replies.map((r) => r.id)).size).toBe(replies.length);
        expect(replies.some((r) => r.category === 'honest'), `${seed} ${character.id}`).toBe(true);
        expect(draw(createRng(seed).fork(STREAMS.dialogue), character.id)).toEqual(replies);
      }
    }
  });

  it('give each spirit its own draw, and use every kind of reply over a run', () => {
    const rng = () => createRng(42).fork(STREAMS.dialogue);
    const sets = generateCase(42).characters.map((c) => draw(rng(), c.id).map((r) => r.id).join());
    expect(new Set(sets).size).toBeGreaterThan(1);
    const seen = new Set<string>();
    for (let seed = 0; seed < 50; seed++) for (const c of generateCase(seed).characters) for (const r of draw(createRng(seed).fork(STREAMS.dialogue), c.id)) seen.add(r.category);
    expect([...seen].sort()).toEqual(['evasive', 'honest', 'lie']);
  });

  it('reward honesty and cost lies: the family answer gains the most', () => {
    for (const r of REPLIES) {
      if (r.category === 'honest') expect(r.trustDelta, r.text).toBeGreaterThan(0);
      if (r.category === 'evasive') expect(r.trustDelta, r.text).toBeLessThanOrEqual(0);
      if (r.category === 'lie') expect(r.trustDelta, r.text).toBeLessThan(0);
    }
    const family = REPLIES.find((r) => r.text === 'Your family, I think.')!;
    expect(family.category).toBe('honest');
    expect(Math.max(...REPLIES.map((r) => r.trustDelta))).toBe(family.trustDelta);
    expect(REPLIES.find((r) => r.text === 'A traveller lost in the storm.')?.category).toBe('honest');
    expect(REPLIES.find((r) => r.text === 'None of your business.')?.category).toBe('evasive');
  });
});
