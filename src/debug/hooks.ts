import type { PerspectiveCamera, WebGLRenderer } from 'three';
import type { WorldView } from '../render/world-view';
import { DIRS, DIR_STEP, SLOT_CELLS, parseCell, slotOfCell } from '../world/grid';
import type { House } from '../world/house';
import type { CellId, Room } from '../world/types';
import { CELL_SIZE, EYE_HEIGHT } from '../world/units';

export type DebugRoomKind = 'filler' | 'key' | 'corridor';

/** Test and debugging handle on window.__ofrenda, only installed when the URL has a debug flag. */
export interface OfrendaDebug {
  seed: number;
  house: House;
  /** Loads the chunks around a cell, as if the player stood there. */
  moveTo(cell: CellId): void;
  /** Puts the camera at a world position (metres) looking at a yaw (radians, 0 = north). */
  place(x: number, z: number, yaw: number): void;
  /** Moves to a room of the given kind and frames it for a screenshot. */
  viewRoom(kind: DebugRoomKind): boolean;
  frames(count: number): Promise<void>;
  memory(): { geometries: number; textures: number };
  drawCalls(): number;
}

declare global {
  interface Window {
    __ofrenda?: OfrendaDebug;
  }
}

export function installDebugHooks(options: {
  seed: number;
  house: House;
  view: WorldView;
  camera: PerspectiveCamera;
  renderer: WebGLRenderer;
  lastDrawCalls: () => number;
}): void {
  const { house, view, camera, renderer } = options;
  const moveTo = (cell: CellId) => view.apply(house.update(cell));
  const place = (x: number, z: number, yaw: number) => {
    camera.position.set(x, EYE_HEIGHT, z);
    camera.rotation.set(0, yaw, 0);
  };

  const findRoom = (kind: DebugRoomKind): Room | undefined => {
    if (kind === 'key') {
      const id = house.keyRooms().find((k) => k.roomId)?.roomId;
      return id ? house.getRoom(id) : undefined;
    }
    for (let ring = 0; ring < 4; ring++) {
      for (let cy = 0; cy <= ring + 1; cy++) {
        for (let cx = -ring; cx <= ring; cx++) {
          const rooms = house.chunkAt(cx, cy).rooms;
          const found =
            kind === 'corridor'
              ? rooms.find((r) => r.kind === 'corridor' && r.cells.length >= 7)
              : rooms.find((r) => r.kind === 'parlour') ?? rooms.find((r) => r.kind === 'bedroom');
          if (found) return found;
        }
      }
    }
    return undefined;
  };

  window.__ofrenda = {
    seed: options.seed,
    house,
    moveTo,
    place,
    viewRoom(kind) {
      const room = findRoom(kind);
      if (!room) return false;
      const [sx, sy] = slotOfCell(...parseCell(room.cells[0]!));
      const centreX = (sx * SLOT_CELLS + 2.5) * CELL_SIZE;
      const centreZ = -(sy * SLOT_CELLS + 2.5) * CELL_SIZE;
      moveTo(room.cells[0]!);
      if (kind === 'corridor') {
        // Stand at the end of one arm and look down it.
        const inRoom = new Set(room.cells);
        const [cx, cy] = [sx * SLOT_CELLS + 2, sy * SLOT_CELLS + 2];
        const dir = DIRS.find((d) => inRoom.has(`${cx + DIR_STEP[d][0] * 2},${cy + DIR_STEP[d][1] * 2}`)) ?? 'N';
        const [dx, dy] = DIR_STEP[dir];
        const yaw = { N: 0, W: Math.PI / 2, S: Math.PI, E: -Math.PI / 2 }[dir];
        place(centreX - dx * 1.6 * CELL_SIZE, centreZ + dy * 1.6 * CELL_SIZE, yaw);
      } else {
        // Stand near the south wall and look north across the room.
        place(centreX + 0.3, centreZ + 1.9 * CELL_SIZE, -0.15);
      }
      return true;
    },
    frames(count) {
      return new Promise((resolve) => {
        let left = count;
        const tick = () => (--left <= 0 ? resolve() : requestAnimationFrame(tick));
        requestAnimationFrame(tick);
      });
    },
    memory: () => ({ geometries: renderer.info.memory.geometries, textures: renderer.info.memory.textures }),
    drawCalls: options.lastDrawCalls,
  };
}
