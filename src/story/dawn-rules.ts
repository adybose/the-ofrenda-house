import type { CharacterId } from '../case/types';
import type { House } from '../world/house';
import type { CellId } from '../world/types';

/** Dawn (spec 22), pure: the outcome of the patriarch's last question, and the way home. */

/** The entrance hall's cell inside the front door. */
export const FRONT_DOOR_CELL: CellId = '7,0';

export function dawnOutcome(accusedId: CharacterId, killerId: CharacterId): 'free' | 'trapped' {
  return accusedId === killerId ? 'free' : 'trapped';
}

/** The shortest way through the house's doors to the front door: the cells to strew petals on. */
export function pathHome(house: House, from: CellId): CellId[] {
  return house.pathBetween(from, FRONT_DOOR_CELL) ?? [];
}

/** The patriarch's words at dawn (fixed text). */
export const DAWN_LINES = {
  ask: 'The night is over, and you are still here. One last time: who did this to us?',
  free: 'Well done, you found the killer. You are free now.',
  trapped: 'Too bad, now you join the others who came before you.',
} as const;
