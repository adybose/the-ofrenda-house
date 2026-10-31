import { describe, expect, it } from 'vitest';
import { FRIGHTS, bpm, createFear, fearReducer, type FearEvent } from '../../src/story/fear';

const run = (...events: FearEvent[]) => events.reduce(fearReducer, createFear());

describe('fear', () => {
  it('jumps with a fright and eases off over seconds', () => {
    const scared = run({ type: 'spike', amount: FRIGHTS.scare });
    expect(scared.level).toBeCloseTo(0.55);
    const later = fearReducer(scared, { type: 'tick', dt: 10 });
    expect(later.level).toBeLessThan(0.25);
    expect(later.level).toBeGreaterThan(0.15);
    expect(fearReducer(later, { type: 'tick', dt: 60 }).level).toBeLessThan(0.01);
  });

  it('stacks frights, never past 1', () => {
    const s = run({ type: 'spike', amount: 0.55 }, { type: 'spike', amount: 0.55 }, { type: 'spike', amount: 1 });
    expect(s.level).toBe(1);
    expect(run({ type: 'spike', amount: 0.55 }, { type: 'spike', amount: 0.3 }).level).toBeCloseTo(0.7);
  });

  it('is held high through a chase, and eases once it is over', () => {
    let s = run({ type: 'floor', level: FRIGHTS.chase });
    for (let i = 0; i < 20; i++) s = fearReducer(s, { type: 'tick', dt: 1 });
    expect(s.level).toBeCloseTo(0.85);
    s = fearReducer(s, { type: 'floor', level: 0 });
    s = fearReducer(s, { type: 'tick', dt: 10 });
    expect(s.level).toBeLessThan(0.35);
  });

  it('beats from 68 to 160 a minute', () => {
    expect(bpm(0)).toBe(68);
    expect(bpm(1)).toBe(160);
    expect(bpm(0.5)).toBe(114);
    expect(bpm(-1)).toBe(68);
    expect(bpm(2)).toBe(160);
  });
});
