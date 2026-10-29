import { describe, expect, it } from 'vitest';
import { REPLIES } from '../../src/dialogue/replies';
import { applyReply, initialTrust, trust, trustBucket } from '../../src/dialogue/trust';

const reply = (category: 'honest' | 'evasive' | 'lie', trustDelta: number) => ({ id: `${category}${trustDelta}`, text: '', category, trustDelta });

describe('trust', () => {
  it('starts every spirit at 50 and adds each reply\'s change', () => {
    let state = initialTrust();
    expect(state.toldTheTruth).toBe(true);
    state = applyReply(state, 'cook', reply('honest', 12));
    expect(state.trust.cook).toBe(62);
    state = applyReply(state, 'cook', reply('evasive', -5));
    expect(state.trust.cook).toBe(57);
    // Another spirit is untouched.
    expect(state.trust.gardener).toBeUndefined();
    state = applyReply(state, 'gardener', reply('honest', 8));
    expect(state.trust.gardener).toBe(58);
  });

  it('clamps trust to 0..100', () => {
    let state = initialTrust();
    for (let i = 0; i < 10; i++) state = applyReply(state, 'doctor', reply('honest', 20));
    expect(state.trust.doctor).toBe(100);
    for (let i = 0; i < 20; i++) state = applyReply(state, 'doctor', reply('lie', -12));
    expect(state.trust.doctor).toBe(0);
  });

  it('buckets trust as wary below 35, warm from 70, neutral between', () => {
    expect([0, 34, 35, 69, 70, 100].map(trustBucket)).toEqual(['wary', 'wary', 'neutral', 'neutral', 'warm', 'warm']);
    expect(trust.bucket).toBe(trustBucket);
    expect(trust.apply).toBe(applyReply);
  });

  it('keeps toldTheTruth through honest and evasive replies, and loses it for good after any lie', () => {
    let state = initialTrust();
    state = applyReply(state, 'cook', reply('honest', 10));
    state = applyReply(state, 'gardener', reply('evasive', -5));
    expect(state.toldTheTruth).toBe(true);
    state = applyReply(state, 'doctor', reply('lie', -8));
    expect(state.toldTheTruth).toBe(false);
    state = applyReply(state, 'cook', reply('honest', 20));
    expect(state.toldTheTruth).toBe(false);
  });

  it('does not change the state it was given', () => {
    const before = initialTrust();
    applyReply(before, 'cook', REPLIES[0]!);
    expect(before).toEqual(initialTrust());
  });
});
