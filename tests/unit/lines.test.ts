import { describe, expect, it } from 'vitest';
import { createRng } from '../../src/core/rng';
import { DARK_LINES, FLEE_LINES, PATRIARCH_LINES, pickLine } from '../../src/spirits/lines';

describe('the lines', () => {
  it('are many, short and different', () => {
    for (const lines of [DARK_LINES, FLEE_LINES, PATRIARCH_LINES]) {
      expect(lines.length).toBeGreaterThanOrEqual(10);
      expect(new Set(lines).size).toBe(lines.length);
      for (const line of lines) expect(line.split(/\s+/).length, line).toBeLessThanOrEqual(12);
    }
    expect(DARK_LINES).toContain('I can see your darkness.');
    expect(DARK_LINES).toContain('I can smell your fear.');
  });

  it('never repeat one of the last five', () => {
    const rng = createRng(7);
    let recent: string[] = [];
    const said: string[] = [];
    for (let i = 0; i < 200; i++) {
      const next = pickLine(DARK_LINES, recent, rng);
      expect(recent).not.toContain(next.line);
      recent = next.recent;
      said.push(next.line);
    }
    expect(new Set(said).size).toBe(DARK_LINES.length);
  });
});
