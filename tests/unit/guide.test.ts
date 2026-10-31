import { describe, expect, it } from 'vitest';
import { nearestSpirit, whisperPoint } from '../../src/story/guide-rules';
import type { KeyRoomState } from '../../src/world/types';

const room = (id: string, locked = false): KeyRoomState => ({ characterId: id as never, style: 'study', keyId: `key:${id}`, locked, visited: false, roomId: `key:${id}` });

describe('the whispers', () => {
  const rooms = [room('cook'), room('doctor', true), room('gardener'), room('painter')];
  const distances = new Map([
    ['key:cook', 6],
    ['key:doctor', 2],
    ['key:gardener', 4],
  ]);

  it('lead to the nearest spirit the player can reach and hasn’t met', () => {
    expect(nearestSpirit(distances, rooms, () => false, new Set())?.characterId).toBe('gardener');
    // The locked room once its key is held.
    expect(nearestSpirit(distances, rooms, () => false, new Set(['key:doctor']))?.characterId).toBe('doctor');
    // Not a spirit already met.
    expect(nearestSpirit(distances, rooms, (id) => id === 'gardener', new Set())?.characterId).toBe('cook');
    // Nothing in reach: no whisper.
    expect(nearestSpirit(new Map(), rooms, () => false, new Set())).toBeUndefined();
  });

  it('sound a few cells along the way', () => {
    expect(whisperPoint(['a', 'b', 'c', 'd', 'e', 'f'])).toBe('e');
    expect(whisperPoint(['a', 'b'])).toBe('b');
    expect(whisperPoint([])).toBeUndefined();
  });
});
