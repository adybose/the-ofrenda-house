import type { CharacterId } from '../case/types';
import type { CellId, KeyRoomState } from '../world/types';

/**
 * Finding the spirits (spec 23), pure: which spirit's room the whispers lead to, and where along the
 * way the whisper sounds.
 */

/** Every room, nearest first by doors, whose spirit is unresolved and which the player can get into. */
export function spiritsByDistance(
  distances: ReadonlyMap<string, number>,
  keyRooms: readonly KeyRoomState[],
  resolved: (characterId: CharacterId) => boolean,
  keys: ReadonlySet<string>,
): KeyRoomState[] {
  return keyRooms
    .filter((room) => room.roomId && !resolved(room.characterId) && (!room.locked || keys.has(room.keyId)) && distances.has(room.roomId))
    .sort((a, b) => distances.get(a.roomId!)! - distances.get(b.roomId!)!);
}

/** The nearest of them. */
export function nearestSpirit(
  distances: ReadonlyMap<string, number>,
  keyRooms: readonly KeyRoomState[],
  resolved: (characterId: CharacterId) => boolean,
  keys: ReadonlySet<string>,
): KeyRoomState | undefined {
  return spiritsByDistance(distances, keyRooms, resolved, keys)[0];
}

/** Two cells along the way there, about 3 m (spec 25): the whisper leads through the doorways, not through walls. */
export function whisperPoint(path: readonly CellId[], steps = 2): CellId | undefined {
  if (path.length === 0) return undefined;
  return path[Math.min(steps, path.length - 1)];
}
