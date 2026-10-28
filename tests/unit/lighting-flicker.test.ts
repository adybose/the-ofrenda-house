import { describe, expect, it } from 'vitest';
import { flashlightIntensity } from '../../src/lighting/flicker';

function sample(options: { level?: number; flicker?: number; killedUntil?: number }, from = 0, seconds = 10) {
  const values: number[] = [];
  for (let t = from; t < from + seconds; t += 1 / 60) {
    values.push(flashlightIntensity({ time: t, level: options.level ?? 1, flicker: options.flicker ?? 0, killedUntil: options.killedUntil ?? 0 }));
  }
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance = values.reduce((a, b) => a + (b - mean) ** 2, 0) / values.length;
  return { values, mean, variance };
}

describe('flashlightIntensity', () => {
  it('flickers only a little on a good battery', () => {
    const { mean, values } = sample({});
    expect(mean).toBeGreaterThan(0.9);
    expect(Math.min(...values)).toBeGreaterThan(0.8);
    expect(Math.max(...values)).toBeLessThanOrEqual(1);
    expect(new Set(values.map((v) => v.toFixed(3))).size).toBeGreaterThan(10);
  });

  it('flickers more as setFlicker rises', () => {
    const calm = sample({ flicker: 0 });
    const uneasy = sample({ flicker: 0.5 });
    const terrified = sample({ flicker: 1 });
    expect(uneasy.variance).toBeGreaterThan(calm.variance * 5);
    expect(terrified.variance).toBeGreaterThan(uneasy.variance);
    expect(terrified.mean).toBeLessThan(calm.mean);
  });

  it('dims and stutters on a low battery', () => {
    const full = sample({ level: 1 });
    const low = sample({ level: 0.05 });
    expect(low.mean).toBeLessThan(full.mean * 0.7);
    expect(low.variance).toBeGreaterThan(full.variance * 5);
  });

  it('is off while killed, then comes back', () => {
    const killed = sample({ killedUntil: 3 }, 0, 3);
    expect(Math.max(...killed.values)).toBe(0);
    const after = sample({ killedUntil: 3 }, 3.01, 2);
    expect(after.mean).toBeGreaterThan(0.9);
  });

  it('is a pure function of its inputs', () => {
    const args = { time: 12.34, level: 0.4, flicker: 0.3, killedUntil: 0 };
    expect(flashlightIntensity(args)).toBe(flashlightIntensity(args));
  });
});
