import { describe, expect, it } from 'vitest';
import { SCORE, scoreLevels } from '../../src/audio/score';

describe('the suspense score', () => {
  it('is silent when calm', () => {
    for (const fear of [0, 0.05, 0.1]) expect(scoreLevels(fear)).toEqual({ drone: 0, strings: 0, pulse: false });
  });

  it('brings the drone in first, then the strings, then the pulse, as fear rises', () => {
    expect(scoreLevels(0.3).drone).toBeGreaterThan(0);
    expect(scoreLevels(0.3).strings).toBe(0);
    expect(scoreLevels(0.45).strings).toBe(0);
    expect(scoreLevels(0.5).strings).toBeGreaterThan(0);
    expect(scoreLevels(0.54).pulse).toBe(false);
    expect(scoreLevels(0.55).pulse).toBe(true);
  });

  it('rises with fear and never passes its caps', () => {
    let last = scoreLevels(0);
    for (let i = 1; i <= 120; i++) {
      const now = scoreLevels(i / 100);
      expect(now.drone).toBeGreaterThanOrEqual(last.drone);
      expect(now.strings).toBeGreaterThanOrEqual(last.strings);
      expect(now.drone).toBeLessThanOrEqual(SCORE.drone.cap);
      expect(now.strings).toBeLessThanOrEqual(SCORE.strings.cap);
      last = now;
    }
    expect(scoreLevels(0.5).drone).toBeCloseTo(SCORE.drone.cap);
    expect(scoreLevels(0.85).strings).toBeCloseTo(SCORE.strings.cap);
  });
});
