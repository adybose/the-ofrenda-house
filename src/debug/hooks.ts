import type { WebGLRenderer } from 'three';
import { events, type GameEvents } from '../core/events';
import type { PlayerController } from '../player/controller';
import type { PlayerState } from '../player/movement';
import { DIRS, DIR_STEP, SLOT_CELLS, parseCell, slotOfCell } from '../world/grid';
import type { House } from '../world/house';
import type { CellId, ChunkDiff, DoorId, Room } from '../world/types';
import { CELL_SIZE, cellCentre } from '../world/units';

/** Events the hook records for tests. */
const RECORDED = ['interact', 'doorOpened', 'doorClosed', 'doorUnlocked', 'doorLocked', 'doorSealed', 'footstep', 'playerCellChanged'] as const;

export type DebugRoomKind = 'filler' | 'key' | 'corridor';

/** Test and debugging handle on window.__ofrenda, only installed when the URL has a debug flag. */
export interface OfrendaDebug {
  seed: number;
  house: House;
  /** Loads the chunks around a cell, as if the player stood there. */
  moveTo(cell: CellId): void;
  /** Puts the player at a world position (metres) looking at a yaw (radians, 0 = north). */
  place(x: number, z: number, yaw: number): void;
  player(): PlayerState;
  setControlsEnabled(enabled: boolean): void;
  /** Stands the player one cell from a door, facing it: on side a, side b, or outside a key room. */
  standFacingDoor(doorId: DoorId, side: 'a' | 'b' | 'outside'): void;
  /** The text of the E prompt, or '' when hidden. */
  prompt(): string;
  /** Recorded game events, oldest first. */
  events(): ({ name: string } & Record<string, unknown>)[];
  giveKey(keyId: string): void;
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
  applyDiff(diff: ChunkDiff): void;
  player: PlayerController;
  prompt: { text(): string };
  keys: Set<string>;
  renderer: WebGLRenderer;
  lastDrawCalls: () => number;
}): void {
  const { house, player, renderer } = options;
  const moveTo = (cell: CellId) => options.applyDiff(house.update(cell));
  const place = (x: number, z: number, yaw: number) => player.teleport(x, z, yaw);
  const log: ({ name: string } & Record<string, unknown>)[] = [];
  for (const name of RECORDED) {
    events.on(name, (payload: GameEvents[typeof name]) => log.push({ name, ...payload }));
  }

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
    player: () => player.state(),
    setControlsEnabled: (enabled) => player.setControlsEnabled(enabled),
    standFacingDoor(doorId, side) {
      const door = house.getDoor(doorId);
      if (!door) throw new Error(`no door ${doorId}`);
      const inKeyRoom = (cell: CellId) => house.roomAt(cell)?.kind === 'key';
      const cell = side === 'a' ? door.a : side === 'b' ? door.b : inKeyRoom(door.a) ? door.b : door.a;
      moveTo(cell);
      const [x, z] = cellCentre(cell);
      const [ax, az] = cellCentre(door.a);
      const [bx, bz] = cellCentre(door.b);
      const [dx, dz] = [(ax + bx) / 2 - x, (az + bz) / 2 - z];
      place(x, z, Math.atan2(-dx, -dz));
    },
    prompt: () => options.prompt.text(),
    events: () => [...log],
    giveKey: (keyId) => options.keys.add(keyId),
    memory: () => ({ geometries: renderer.info.memory.geometries, textures: renderer.info.memory.textures }),
    drawCalls: options.lastDrawCalls,
  };
}
