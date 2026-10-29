import { describe, expect, it } from 'vitest';
import { DAWN_MINUTES, ENDINGS, clockLabel, clockStart, gameClock, resolveEnding } from '../../src/story/flow';

describe('resolveEnding', () => {
  it('covers every combination', () => {
    for (const named of [false, true]) {
      for (const toldTheTruth of [false, true]) {
        for (const caught of [false, true]) {
          for (const dawnWrong of [false, true]) {
            const ending = resolveEnding({ named, toldTheTruth, caught, dawnWrong });
            const expected = caught ? 'possessed' : dawnWrong ? 'trapped' : named ? (toldTheTruth ? 'true' : 'escape') : 'trapped';
            expect(ending, JSON.stringify({ named, toldTheTruth, caught, dawnWrong })).toBe(expected);
          }
        }
      }
    }
  });

  it('has words for every ending; being caught says so', () => {
    for (const kind of ['true', 'escape', 'possessed', 'trapped'] as const) expect(ENDINGS[kind].text.length).toBeGreaterThan(40);
    expect(ENDINGS.possessed.text).toContain('You lost. You were possessed by the spirit of La Sombra.');
  });
});

describe('the clock', () => {
  const min = 60_000;
  it('runs from midnight to six over DAWN_MINUTES', () => {
    expect(DAWN_MINUTES).toBe(24);
    expect(gameClock(0)).toEqual({ hour: 0, minute: 0, dawn: false });
    expect(gameClock(4 * min)).toEqual({ hour: 1, minute: 0, dawn: false });
    expect(gameClock(12 * min)).toEqual({ hour: 3, minute: 0, dawn: false });
    expect(gameClock(24 * min - 1).dawn).toBe(false);
    expect(gameClock(24 * min)).toEqual({ hour: 6, minute: 0, dawn: true });
    expect(gameClock(99 * min)).toEqual({ hour: 6, minute: 0, dawn: true });
    expect(gameClock(10 * min, 10)).toEqual({ hour: 6, minute: 0, dawn: true });
  });

  it('can start at any time, and reads like a clock', () => {
    expect(gameClock(clockStart('05:59'))).toEqual({ hour: 5, minute: 59, dawn: false });
    expect(gameClock(clockStart('02:59')).hour).toBe(2);
    expect(gameClock(clockStart('06:00')).dawn).toBe(true);
    expect(clockLabel(0, 0)).toBe('12:00 am');
    expect(clockLabel(5, 9)).toBe('5:09 am');
  });
});
