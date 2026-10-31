import { describe, expect, it } from 'vitest';
import type { AudioEngine } from '../../src/audio/engine';
import type { PlayerController } from '../../src/player/controller';
import { Guide } from '../../src/story/guide';
import { nearestSpirit, spiritsByDistance, whisperPoint } from '../../src/story/guide-rules';
import { ACT2_START_CELL } from '../../src/world/grid';
import type { CellId, KeyRoomState } from '../../src/world/types';
import type { House } from '../../src/world/house';
import { cellCentre, worldToCell } from '../../src/world/units';
import { newHouse } from './house-helpers';

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

  it('list every spirit the player can reach, nearest first', () => {
    expect(spiritsByDistance(distances, rooms, () => false, new Set(['key:doctor'])).map((r) => r.characterId)).toEqual(['doctor', 'gardener', 'cook']);
    expect(spiritsByDistance(distances, rooms, () => false, new Set()).map((r) => r.characterId)).toEqual(['gardener', 'cook']);
  });

  it('sound a few cells along the way', () => {
    // Two cells along the way, about 3 m (spec 25).
    expect(whisperPoint(['a', 'b', 'c', 'd', 'e', 'f'])).toBe('c');
    expect(whisperPoint(['a', 'b'])).toBe('b');
    expect(whisperPoint([])).toBeUndefined();
  });
});

/** A guide in a real house, the player standing at `cell`; returns where its whispers came from. */
function runGuide(seed: number, setup: { resolved(id: string): boolean; keys: Set<string>; keysWaiting?(): string[] }, cell: CellId = ACT2_START_CELL) {
  const house = newHouse(seed);
  house.update(house.startCell);
  house.endAct1();
  house.update(cell);
  const [x, z] = cellCentre(cell);
  const played: [number, number, number][] = [];
  const audio = { play: (_name: string, o: { position: [number, number, number] }) => played.push(o.position) } as unknown as AudioEngine;
  const player = { state: () => ({ x, z, yaw: 0 }) } as unknown as PlayerController;
  const guide = new Guide({ seed, house, audio, player, resolved: setup.resolved as never, keys: setup.keys, keysWaiting: setup.keysWaiting, every: 5 });
  for (let t = 0; t < 20; t += 0.5) guide.update(0.5, true);
  return { house, played };
}

/** The whisper sounds from a cell two along the walkable way from the player to `goal` (or the goal itself, if nearer). */
function alongTheWay(house: House, [x, , z]: [number, number, number], goal: CellId): boolean {
  const path = house.pathBetween(ACT2_START_CELL, goal) ?? [];
  return path.length > 0 && path[Math.min(2, path.length - 1)] === worldToCell(x, z);
}

describe('the whispers later in the run (fixed 31 October)', () => {
  it('still lead to a locked spirit room once its key is held', () => {
    let cases = 0;
    for (let seed = 0; seed < 50; seed++) {
      const locked = newHouse(seed).keyRooms().filter((k) => k.locked && k.roomId);
      for (const target of locked) {
        cases++;
        const { house, played } = runGuide(seed, { resolved: (id) => id !== target.characterId, keys: new Set([target.keyId]) });
        expect(played.length, `seed ${seed} ${target.characterId}`).toBeGreaterThan(0);
        // From two cells along the way to its door, from outside.
        const door = house.getDoor(target.doorId!)!;
        const room = house.getRoom(target.roomId!)!;
        const outside = room.cells.includes(door.a) ? door.b : door.a;
        expect(alongTheWay(house, played[0]!, outside)).toBe(true);
      }
    }
    expect(cases).toBeGreaterThan(20);
  });

  it('lead back to a key left on a stand when no spirit room can be entered', () => {
    for (let seed = 0; seed < 20; seed++) {
      const rooms = newHouse(seed).keyRooms();
      const solved = rooms.find((k) => !k.locked && k.roomId)!;
      const lockedOnly = (id: string) => !rooms.some((k) => k.characterId === id && k.locked);
      const { house, played } = runGuide(seed, { resolved: lockedOnly, keys: new Set(), keysWaiting: () => [solved.roomId!] });
      expect(played.length, `seed ${seed}`).toBeGreaterThan(0);
      const room = house.getRoom(solved.roomId!)!;
      expect(alongTheWay(house, played[0]!, room.cells[Math.floor(room.cells.length / 2)]!)).toBe(true);
    }
  });
});
