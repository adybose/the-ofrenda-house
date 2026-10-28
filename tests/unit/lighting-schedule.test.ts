import { describe, expect, it } from 'vitest';
import { createRng } from '../../src/core/rng';
import { LIGHTNING_INTERVAL, createLightningSchedule, flashLevel } from '../../src/lighting/schedule';

const strikes = (seed: number, count: number) => {
  const schedule = createLightningSchedule(createRng(seed).fork('lighting'));
  return Array.from({ length: count }, () => schedule.next());
};

describe('lightning schedule', () => {
  it('is deterministic for a seed', () => {
    expect(strikes(42, 20)).toEqual(strikes(42, 20));
    expect(strikes(42, 5)).not.toEqual(strikes(43, 5));
  });

  it('strikes every 20 to 60 seconds', () => {
    expect(LIGHTNING_INTERVAL).toEqual([20, 60]);
    const list = strikes(7, 200);
    let last = 0;
    for (const strike of list) {
      expect(strike.at - last).toBeGreaterThanOrEqual(20);
      expect(strike.at - last).toBeLessThanOrEqual(60);
      last = strike.at;
    }
  });

  it('is 2 or 3 pulses within about 400 ms, with closer strikes stronger', () => {
    for (const strike of strikes(9, 200)) {
      expect([2, 3]).toContain(strike.pulses.length);
      const end = Math.max(...strike.pulses.map((p) => p.start + p.duration));
      expect(end).toBeLessThanOrEqual(0.45);
      expect(end).toBeGreaterThanOrEqual(0.25);
      expect(strike.strength).toBeGreaterThan(0);
      expect(strike.strength).toBeLessThanOrEqual(1);
      expect(strike.distanceKm).toBeGreaterThan(0);
    }
    const list = strikes(11, 300);
    const close = list.filter((s) => s.distanceKm < 1.5).map((s) => s.strength);
    const far = list.filter((s) => s.distanceKm > 3).map((s) => s.strength);
    const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
    expect(mean(close)).toBeGreaterThan(mean(far));
  });

  it('is dark between pulses and bright during them', () => {
    const [strike] = strikes(3, 1);
    const first = strike!.pulses[0]!;
    expect(flashLevel(strike!, first.start + first.duration / 2)).toBeGreaterThan(0.3);
    expect(flashLevel(strike!, -0.1)).toBe(0);
    expect(flashLevel(strike!, 1)).toBe(0);
  });
});
