import { describe, expect, it } from 'vitest';
import { newHouse, reachFailures } from './house-helpers';

// The 1,000-seed reach check is split over four files (seeds 0-249 here) so Vitest runs them in parallel.
describe('key rooms within reach', () => {
  it('keeps every unvisited key room within K rooms at the start and after each of 50 reshuffles (seeds 0-249)', () => {
    expect(reachFailures(0, 249).slice(0, 10)).toEqual([]);
  }, 120_000);
});

describe('locks', () => {
  it('leaves at least 2 key rooms unlocked and has an order that opens every locked room, for 1,000 seeds', () => {
    for (let seed = 0; seed < 1_000; seed++) {
      const rooms = newHouse(seed).keyRooms();
      expect(rooms.filter((r) => !r.locked).length).toBeGreaterThanOrEqual(2);
      expect(rooms.filter((r) => r.locked).length).toBeGreaterThanOrEqual(1);

      const opened = new Set(rooms.filter((r) => !r.locked).map((r) => r.characterId));
      const keys = new Set<string>();
      let progress = true;
      while (progress) {
        progress = false;
        for (const room of rooms) {
          if (opened.has(room.characterId)) {
            for (const other of rooms) if (other.keyHolderId === room.characterId) keys.add(other.keyId);
          }
        }
        for (const room of rooms) {
          if (!opened.has(room.characterId) && keys.has(room.keyId)) {
            opened.add(room.characterId);
            progress = true;
          }
        }
      }
      expect(opened.size, `seed ${seed}`).toBe(rooms.length);
      for (const room of rooms.filter((r) => r.locked)) {
        expect(room.keyHolderId).toBeDefined();
        expect(room.keyHolderId).not.toBe(room.characterId);
      }
    }
  });

  it('has one key room per spirit except the patriarch, each with its own room style', () => {
    for (let seed = 0; seed < 100; seed++) {
      const rooms = newHouse(seed).keyRooms();
      expect(rooms.map((r) => r.characterId)).not.toContain('patriarch');
      expect(rooms.length).toBeGreaterThanOrEqual(6);
      expect(rooms.length).toBeLessThanOrEqual(7);
      expect(new Set(rooms.map((r) => r.style)).size).toBe(rooms.length);
    }
  });

  it('locks the door of a locked key room until unlock() is called', () => {
    const house = newHouse(42);
    const locked = house.keyRooms().find((r) => r.locked)!;
    const door = house.getDoor(locked.doorId!);
    expect(door?.state).toBe('locked');
    expect(door?.keyId).toBe(locked.keyId);
    house.unlock(locked.doorId!);
    expect(house.getDoor(locked.doorId!)?.state).not.toBe('locked');
    expect(house.keyRooms().find((r) => r.characterId === locked.characterId)?.locked).toBe(false);
  });
});
