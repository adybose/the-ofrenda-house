import type { Rng } from '../core/rng';
import { DIRS, DIR_STEP, FRONT_DOOR_ID, edgeCells, parseCell } from '../world/grid';
import type { CellId, Dir, Room } from '../world/types';
import { worldToCell } from '../world/units';

/**
 * What opening a door sets off, and where a painting can fall (spec 24), pure.
 */

export type DoorScare = 'bats' | 'batsChandelier' | 'rats';

/** How often a closed door the player opens has something behind it (spec 25). */
export const DOOR_SCARE_CHANCE = 0.55;
/** Seconds between door scares: their own cooldown, shorter than spec 13's. */
export const DOOR_SCARE_COOLDOWN = 12;
/** In a room with a chandelier, how many of its door scares bring it down. */
export const CHANDELIER_SHARE = 0.7;

/**
 * Behind a door the player has just opened: sometimes bats (in a room with a chandelier, mostly
 * bringing it down), or rats. `force` (debug) picks one.
 */
export function doorScare(room: Room, rng: Rng, force?: DoorScare): DoorScare | undefined {
  const chandelier = room.anchors.some((a) => a.kind === 'chandelier');
  if (force) return force === 'batsChandelier' && !chandelier ? 'bats' : force;
  if (!rng.chance(DOOR_SCARE_CHANCE)) return undefined;
  if (chandelier) return rng.chance(CHANDELIER_SHARE) ? 'batsChandelier' : 'bats';
  return rng.chance(0.65) ? 'bats' : 'rats';
}

/** A painting can fall from the wall the player faces this far ahead, and no nearer or further. */
export const PAINTING_RANGE = [1.2, 3] as const;

function openings(room: Room): Set<string> {
  const inRoom = new Set(room.cells);
  const result = new Set<string>();
  for (const id of room.doors) {
    const [a, b] = id === FRONT_DOOR_ID ? (['7,0', '7,-1'] as const) : edgeCells(id.slice(2));
    for (const [inside, outside] of [[a, b], [b, a]] as const) {
      if (!inRoom.has(inside)) continue;
      const [x0, y0] = parseCell(inside);
      const [x1, y1] = parseCell(outside);
      const side = DIRS.find((d) => DIR_STEP[d][0] === x1 - x0 && DIR_STEP[d][1] === y1 - y0);
      if (side) result.add(`${inside}|${side}`);
    }
  }
  for (const w of room.windows) result.add(`${w.cell}|${w.side}`);
  return result;
}

/**
 * The plain wall of the player's room straight ahead of them, 1.2 to 3 m away, where a painting can
 * come down in front of their eyes; undefined if they aren't facing one (a doorway, a window, open
 * room, or too near or far).
 */
export function paintingSpot(room: Room, player: { x: number; z: number; yaw: number }): { x: number; z: number; cell: CellId; side: Dir } | undefined {
  const inRoom = new Set(room.cells);
  const fx = -Math.sin(player.yaw);
  const fz = -Math.cos(player.yaw);
  let last = worldToCell(player.x, player.z);
  if (!inRoom.has(last)) return undefined;
  for (let d = 0.1; d <= PAINTING_RANGE[1] + 0.2; d += 0.05) {
    const cell = worldToCell(player.x + fx * d, player.z + fz * d);
    if (cell === last) continue;
    if (inRoom.has(cell)) {
      last = cell;
      continue;
    }
    // Crossed out of the room: the wall of `last` on the side we crossed.
    const [x0, y0] = parseCell(last);
    const [x1, y1] = parseCell(cell);
    const side = DIRS.find((s) => DIR_STEP[s][0] === Math.sign(x1 - x0) && DIR_STEP[s][1] === Math.sign(y1 - y0));
    if (!side || d < PAINTING_RANGE[0] || d > PAINTING_RANGE[1] || openings(room).has(`${last}|${side}`)) return undefined;
    return { x: player.x + fx * d, z: player.z + fz * d, cell: last, side };
  }
  return undefined;
}
