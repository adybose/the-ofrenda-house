import { describe, expect, it } from 'vitest';
import { createRng } from '../../src/core/rng';
import { WHISPER_ONSETS, WHISPER_VOWELS, slipTimes, stickSlip, whisperScore } from '../../src/audio/noise';

const RATE = 44_100;

/** The spread of a list (coefficient of variation). */
function spread(values: number[]): number {
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  return Math.sqrt(values.reduce((a, b) => a + (b - mean) ** 2, 0) / values.length) / mean;
}

describe('stick-slip friction', () => {
  it('is the same for the same seed', () => {
    const rate = () => 120;
    expect(slipTimes(createRng(5), 1, rate)).toEqual(slipTimes(createRng(5), 1, rate));
  });

  it('slips at an uneven rate, so it creaks instead of ringing as a tone', () => {
    const times = slipTimes(createRng(5), 1, () => 200);
    const gaps = times.slice(1).map((t, i) => t - times[i]!);
    expect(spread(gaps)).toBeGreaterThan(0.2);
    // Still roughly the asked-for rate on average.
    expect(times.length).toBeGreaterThan(100);
    expect(times.length).toBeLessThan(400);
  });

  it('slows down when the rate falls: a squeal opening out into separate cracks', () => {
    const times = slipTimes(createRng(6), 1.2, (t) => 400 * (30 / 400) ** (t / 1.2));
    const early = times.filter((t) => t < 0.3).length;
    const late = times.filter((t) => t > 0.9).length;
    expect(early).toBeGreaterThan(late * 3);
  });

  it('renders as pulses within ±1, silent between slips when they are slow', () => {
    const samples = stickSlip(createRng(7), RATE, 1, () => 20, () => 1);
    let peak = 0;
    let quiet = 0;
    for (const v of samples) {
      peak = Math.max(peak, Math.abs(v));
      if (Math.abs(v) < 0.001) quiet++;
    }
    expect(peak).toBeGreaterThan(0.1);
    expect(peak).toBeLessThanOrEqual(1);
    expect(quiet / samples.length).toBeGreaterThan(0.5);
  });
});

describe('whisper score', () => {
  it('is the same for the same seed', () => {
    expect(whisperScore(createRng(9), 2)).toEqual(whisperScore(createRng(9), 2));
  });

  it('speaks at a human pace, with sibilants and vowels, and fits its length', () => {
    for (let seed = 1; seed <= 8; seed++) {
      const seconds = 2.2;
      const score = whisperScore(createRng(seed), seconds);
      const perSecond = score.length / seconds;
      expect(perSecond, `seed ${seed}`).toBeGreaterThanOrEqual(3);
      expect(perSecond, `seed ${seed}`).toBeLessThanOrEqual(6);
      for (const s of score) {
        expect(s.start + s.onsetLength + s.vowelLength).toBeLessThanOrEqual(seconds);
        expect(Object.keys(WHISPER_VOWELS)).toContain(s.vowel);
        if (s.onset) expect(Object.keys(WHISPER_ONSETS)).toContain(s.onset);
      }
      expect(score.some((s) => s.onset === 's' || s.onset === 'sh'), `seed ${seed}`).toBe(true);
      expect(new Set(score.map((s) => s.vowel)).size, `seed ${seed}`).toBeGreaterThan(1);
    }
  });

  it('swells in the middle of the phrase', () => {
    const score = whisperScore(createRng(4), 2.4);
    const mid = Math.max(...score.filter((s) => s.start > 0.6 && s.start < 1.8).map((s) => s.level));
    expect(mid).toBeGreaterThan(score[0]!.level);
    expect(mid).toBeGreaterThan(score.at(-1)!.level);
  });
});
