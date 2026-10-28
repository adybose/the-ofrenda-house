import { describe, expect, it } from 'vitest';
import { reachFailures } from './house-helpers';

// Part of the 1,000-seed reach check; see house-reach.test.ts.
describe('key rooms within reach', () => {
  it('keeps every unvisited key room within K rooms at the start and after each of 50 reshuffles (seeds 250-499)', () => {
    expect(reachFailures(250, 499).slice(0, 10)).toEqual([]);
  }, 120_000);
});
