import type { Box, CollisionMap } from '../player/movement';
import { furnishRoom } from './furniture';
import { DIRS, DIR_STEP, cellId } from './grid';
import type { House } from './house';
import type { Dir, Room } from './types';
import { CELL_SIZE, DOOR_WIDTH, WALL_INSET } from './units';

const C = CELL_SIZE;
const PANEL_HALF = 0.05;

/**
 * A box spanning part of one side of a cell: `from`..`to` metres along the side,
 * `half` metres either side of the boundary.
 */
function sideBox(cx: number, cy: number, side: Dir, from: number, to: number, half: number): Box {
  if (side === 'N' || side === 'S') {
    const z = side === 'N' ? -(cy + 1) * C : -cy * C;
    return { minX: cx * C + from, maxX: cx * C + to, minZ: z - half, maxZ: z + half };
  }
  const x = side === 'E' ? (cx + 1) * C : cx * C;
  const north = -(cy + 1) * C;
  return { minX: x - half, maxX: x + half, minZ: north + from, maxZ: north + to };
}

/**
 * Collision from the house itself: a 20 cm wall on every cell side that leads out of the room,
 * jambs around each doorway, a panel across it unless the door is open, and the furniture
 * the renderer draws. Door states are read live, so opening a door clears the way at once.
 */
export function createCollisionMap(house: House, seed: number): CollisionMap {
  const furniture = new Map<string, Box[]>();
  const furnitureBoxes = (room: Room): Box[] => {
    let boxes = furniture.get(room.id);
    if (!boxes) {
      boxes = furnishRoom(room, seed).map((item) => {
        const alongX = item.wall === 'N' || item.wall === 'S';
        const hx = (alongX ? item.w : item.d) / 2;
        const hz = (alongX ? item.d : item.w) / 2;
        return { minX: item.x - hx, maxX: item.x + hx, minZ: item.z - hz, maxZ: item.z + hz };
      });
      if (furniture.size > 500) furniture.clear();
      furniture.set(room.id, boxes);
    }
    return boxes;
  };

  return {
    boxesNear(x, z, radius) {
      const boxes: Box[] = [];
      const rooms = new Map<string, Room>();
      const x0 = Math.floor((x - radius) / C) - 1;
      const x1 = Math.floor((x + radius) / C) + 1;
      const y0 = Math.floor(-(z + radius) / C) - 1;
      const y1 = Math.floor(-(z - radius) / C) + 1;
      for (let cx = x0; cx <= x1; cx++) {
        for (let cy = y0; cy <= y1; cy++) {
          const cell = cellId(cx, cy);
          const room = house.roomAt(cell);
          if (!room) continue;
          rooms.set(room.id, room);
          for (const side of DIRS) {
            const [dx, dy] = DIR_STEP[side];
            const next = cellId(cx + dx, cy + dy);
            if (house.roomAt(next)?.id === room.id) continue;
            const door = house.doorBetween(cell, next);
            if (!door) {
              boxes.push(sideBox(cx, cy, side, -WALL_INSET, C + WALL_INSET, WALL_INSET));
              continue;
            }
            const left = (C - DOOR_WIDTH) / 2;
            const right = (C + DOOR_WIDTH) / 2;
            boxes.push(sideBox(cx, cy, side, -WALL_INSET, left, WALL_INSET));
            boxes.push(sideBox(cx, cy, side, right, C + WALL_INSET, WALL_INSET));
            if (door.state !== 'open') boxes.push(sideBox(cx, cy, side, left, right, PANEL_HALF));
          }
        }
      }
      for (const room of rooms.values()) boxes.push(...furnitureBoxes(room));
      return boxes;
    },
  };
}
