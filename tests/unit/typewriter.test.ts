import { describe, expect, it } from 'vitest';
import { CHARS_PER_SECOND, shownChars } from '../../src/ui/typewriter';

describe('typewriter', () => {
  it('types about 40 characters a second', () => {
    expect(CHARS_PER_SECOND).toBe(40);
    expect(shownChars(0, 100)).toBe(0);
    expect(shownChars(500, 100)).toBe(20);
    expect(shownChars(1000, 100)).toBe(40);
  });

  it('spreads the line over the speech when there is one, slower or faster', () => {
    expect(shownChars(2000, 40, 4000)).toBe(20);
    expect(shownChars(250, 40, 500)).toBe(20);
  });

  it('never shows more than the line, or less than nothing', () => {
    expect(shownChars(60_000, 30)).toBe(30);
    expect(shownChars(-5, 30)).toBe(0);
    expect(shownChars(10_000, 30, 2000)).toBe(30);
  });
});
