import { describe, expect, it } from 'vitest';
import { flashlightIntensity } from '../../src/lighting/flicker';

interface Options {
  level?: number;
  flicker?: number;
  killedUntil?: number;
  cutUntil?: number;
}

function sample(options: Options, from = 0, seconds = 10) {
  const values: number[] = [];
  for (let t = from; t < from + seconds; t += 1 / 60) {
    values.push(
      flashlightIntensity({ time: t, level: options.level ?? 1, flicker: options.flicker ?? 0, killedUntil: options.killedUntil ?? 0, cutUntil: options.cutUntil ?? 0 }),
    );
  }
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance = values.reduce((a, b) => a + (b - mean) ** 2, 0) / values.length;
  return { values, mean, variance };
}

/** Dips per minute: runs of frames well below the level's usual brightness. */
function dipsPerMinute(level: number, minutes = 10) {
  const { values } = sample({ level }, 0, minutes * 60);
  const sorted = [...values].sort((a, b) => a - b);
  const usual = sorted[Math.floor(sorted.length * 0.5)]!;
  let dips = 0;
  let inDip = false;
  for (const v of values) {
    const low = v < usual * 0.7;
    if (low && !inDip) dips++;
    inDip = low;
  }
  return dips / minutes;
}

describe('flashlightIntensity', () => {
  it('flickers only now and then on a good battery', () => {
    const { mean, values } = sample({ level: 0.65 }, 0, 120);
    expect(mean).toBeGreaterThan(0.85);
    expect(Math.max(...values)).toBeLessThanOrEqual(1);
    expect(dipsPerMinute(0.7)).toBeGreaterThan(0.5);
    expect(dipsPerMinute(0.7)).toBeLessThan(6);
  });

  it('flickers more often as the battery runs down', () => {
    const rates = [0.7, 0.4, 0.15, 0.08].map((level) => dipsPerMinute(level));
    for (let i = 1; i < rates.length; i++) expect(rates[i]!).toBeGreaterThan(rates[i - 1]!);
  });

  it('dims as the battery runs down', () => {
    const means = [0.65, 0.4, 0.2, 0.1, 0.06].map((level) => sample({ level }, 0, 120).mean);
    for (let i = 1; i < means.length; i++) expect(means[i]!).toBeLessThan(means[i - 1]!);
    expect(means[3]!).toBeLessThanOrEqual(0.36);
  });

  it('flickers more as setFlicker rises', () => {
    const calm = sample({ flicker: 0 });
    const uneasy = sample({ flicker: 0.5 });
    const terrified = sample({ flicker: 1 });
    expect(uneasy.variance).toBeGreaterThan(calm.variance * 3);
    expect(terrified.variance).toBeGreaterThan(uneasy.variance);
    expect(terrified.mean).toBeLessThan(calm.mean);
  });

  it('is off while killed or cut out, then comes back', () => {
    for (const dead of [{ killedUntil: 3 }, { cutUntil: 3 }]) {
      expect(Math.max(...sample(dead, 0, 3).values)).toBe(0);
      expect(sample(dead, 3.01, 2).mean).toBeGreaterThan(0.8);
    }
  });

  it('is a pure function of its inputs', () => {
    const args = { time: 12.34, level: 0.4, flicker: 0.3, killedUntil: 0, cutUntil: 0 };
    expect(flashlightIntensity(args)).toBe(flashlightIntensity(args));
  });
});
