import { createRng } from '../core/rng';
import type { Furniture, FurnitureKind } from '../world/furniture';
import { DIR_STEP } from '../world/grid';
import type { Room } from '../world/types';

/**
 * Where cats sit (spec 24), pure: about one ordinary room in seven has a cat on a piece of furniture
 * with a flat top, and half the time a vase beside it.
 */

const TOPS: ReadonlySet<FurnitureKind> = new Set(['table', 'sideTable', 'nightstand', 'desk', 'piano', 'toyChest', 'sewingTable', 'washstand']);
export const CAT_ODDS = 1 / 7;

export interface CatSeat {
  roomId: string;
  /** Where it sits, on top of the furniture. */
  x: number;
  y: number;
  z: number;
  /** The furniture's wall: the cat faces away from it, into the room. */
  wall: Furniture['wall'];
  vase?: { x: number; y: number; z: number };
}

export function placeCats(room: Room, furniture: readonly Furniture[], seed: number, all = false): CatSeat[] {
  if (!room.id.startsWith('r:') || room.kind === 'corridor') return [];
  const rng = createRng(seed).fork('cats').fork(room.id);
  if (!all && !rng.chance(CAT_ODDS)) return [];
  const tops = furniture.filter((f) => TOPS.has(f.kind));
  if (tops.length === 0) return [];
  const top = rng.pick(tops);
  // Along the wall: x for north and south walls, z for east and west.
  const [dx] = DIR_STEP[top.wall];
  const along = (d: number): [number, number] => (dx === 0 ? [top.x + d, top.z] : [top.x, top.z + d]);
  const room_ = Math.max(0, top.w / 2 - 0.2);
  const [cx, cz] = along(-Math.min(0.15, room_));
  const seat: CatSeat = { roomId: room.id, x: cx, y: top.h, z: cz, wall: top.wall };
  if (rng.chance(0.5) && top.w >= 0.5) {
    const [vx, vz] = along(Math.min(0.3, room_ + 0.1));
    seat.vase = { x: vx, y: top.h, z: vz };
  }
  return [seat];
}
