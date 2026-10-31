import type { CharacterId } from '../case/types';
import type { CellId, KeyRoomState } from '../world/types';

/**
 * Finding the spirits (spec 23), pure: which spirit's room the whispers lead to, and where along the
 * way the whisper sounds.
 */

/** The nearest room, by doors, whose spirit is unresolved and which the player can get into. */
export function nearestSpirit(
  distances: ReadonlyMap<string, number>,
  keyRooms: readonly KeyRoomState[],
  resolved: (characterId: CharacterId) => boolean,
  keys: ReadonlySet<string>,
): KeyRoomState | undefined {
  let best: KeyRoomState | undefined;
  let bestDoors = Infinity;
  for (const room of keyRooms) {
    if (!room.roomId || resolved(room.characterId) || (room.locked && !keys.has(room.keyId))) continue;
    const doors = distances.get(room.roomId);
    if (doors !== undefined && doors < bestDoors) {
      best = room;
      bestDoors = doors;
    }
  }
  return best;
}

/** Two cells along the way there, about 3 m (spec 25): the whisper leads through the doorways, not through walls. */
export function whisperPoint(path: readonly CellId[], steps = 2): CellId | undefined {
  if (path.length === 0) return undefined;
  return path[Math.min(steps, path.length - 1)];
}
