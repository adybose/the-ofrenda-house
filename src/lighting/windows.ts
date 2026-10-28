import { DIR_STEP, parseCell } from '../world/grid';
import type { Room } from '../world/types';
import { CELL_SIZE } from '../world/units';

export interface WindowSpot {
  /** The middle of the window, on the wall's centre line (metres). */
  x: number;
  z: number;
  /** Unit vector (x, z) pointing out of the house through the glass. */
  outward: readonly [number, number];
}

/** The tall window nearest to (x, z) among the given rooms, within `range` metres. */
export function nearestWindow(rooms: Iterable<Room>, x: number, z: number, range: number): WindowSpot | undefined {
  let best: WindowSpot | undefined;
  let bestDistance = range;
  for (const room of rooms) {
    for (const window of room.windows) {
      const [cx, cy] = parseCell(window.cell);
      const [dx, dy] = DIR_STEP[window.side];
      // Cell y grows north and world z grows south, so the grid step flips in z.
      const outward: [number, number] = [dx, 0 - dy];
      const wx = (cx + 0.5 + dx * 0.5) * CELL_SIZE;
      const wz = -(cy + 0.5 + dy * 0.5) * CELL_SIZE;
      const distance = Math.hypot(wx - x, wz - z);
      if (distance <= bestDistance) {
        bestDistance = distance;
        best = { x: wx, z: wz, outward };
      }
    }
  }
  return best;
}
