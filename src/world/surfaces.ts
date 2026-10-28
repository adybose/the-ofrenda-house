import type { RoomKind as KeyRoomStyle } from '../case/types';
import { SLOT_CELLS, parseCell, slotOfCell } from './grid';
import type { CellId, Room, RoomKind } from './types';

export type WallFinish = 'wallDamask' | 'wallFloral' | 'wallStripes' | 'wallPanelling' | 'wallTiles' | 'plaster' | 'stone';
export type FloorFinish = 'floorboards' | 'parquet' | 'floorTiles' | 'carpet' | 'stoneFloor';

/** What a room is finished in. Shared by rendering (04) and footsteps (05). */
export interface Surfaces {
  walls: readonly WallFinish[];
  floor: FloorFinish;
  /** A rug over the middle 3 × 3 cells. */
  rug?: boolean;
}

const BY_KIND: Record<Exclude<RoomKind, 'key'>, Surfaces> = {
  parlour: { walls: ['wallDamask', 'wallFloral', 'wallStripes'], floor: 'parquet', rug: true },
  bedroom: { walls: ['wallFloral', 'wallStripes', 'wallDamask'], floor: 'floorboards', rug: true },
  nursery: { walls: ['wallStripes', 'wallFloral'], floor: 'floorboards' },
  bathroom: { walls: ['wallTiles'], floor: 'floorTiles' },
  corridor: { walls: ['wallPanelling', 'wallStripes', 'plaster'], floor: 'floorboards' },
  entranceHall: { walls: ['wallPanelling'], floor: 'floorTiles' },
  portraitHall: { walls: ['wallDamask'], floor: 'parquet' },
  act1Corridor: { walls: ['plaster'], floor: 'floorboards' },
  diningRoom: { walls: ['wallDamask'], floor: 'parquet', rug: true },
};

const BY_STYLE: Record<KeyRoomStyle, Surfaces> = {
  study: { walls: ['wallPanelling'], floor: 'parquet', rug: true },
  studio: { walls: ['plaster'], floor: 'floorboards' },
  greenhouse: { walls: ['wallTiles'], floor: 'floorTiles' },
  conservatory: { walls: ['plaster'], floor: 'floorTiles' },
  library: { walls: ['wallPanelling'], floor: 'parquet', rug: true },
  countingRoom: { walls: ['wallPanelling'], floor: 'floorboards' },
  servantsStairs: { walls: ['plaster'], floor: 'floorboards' },
  linenRoom: { walls: ['plaster'], floor: 'floorboards' },
  kitchen: { walls: ['wallTiles'], floor: 'floorTiles' },
  pantry: { walls: ['plaster'], floor: 'stoneFloor' },
  musicRoom: { walls: ['wallDamask'], floor: 'parquet', rug: true },
  guestRoom: { walls: ['wallFloral'], floor: 'carpet' },
  chapel: { walls: ['stone'], floor: 'stoneFloor' },
  sewingRoom: { walls: ['wallFloral'], floor: 'floorboards' },
  pottingRoom: { walls: ['plaster'], floor: 'stoneFloor' },
};

export function roomSurfaces(room: Room): Surfaces {
  return room.kind === 'key' && room.style ? BY_STYLE[room.style] : BY_KIND[room.kind as Exclude<RoomKind, 'key'>];
}

export type FootstepSurface = 'wood' | 'tile' | 'carpet' | 'stone';

const FLOOR_SOUND: Record<FloorFinish, FootstepSurface> = {
  floorboards: 'wood',
  parquet: 'wood',
  floorTiles: 'tile',
  carpet: 'carpet',
  stoneFloor: 'stone',
};

/** What a footstep on this cell sounds like: the rug in the middle of a room, or the floor. */
export function footstepSurface(room: Room, cell: CellId): FootstepSurface {
  const surfaces = roomSurfaces(room);
  if (surfaces.rug) {
    const [x, y] = parseCell(cell);
    const [sx, sy] = slotOfCell(x, y);
    const lx = x - sx * SLOT_CELLS;
    const ly = y - sy * SLOT_CELLS;
    if (lx >= 1 && lx <= 3 && ly >= 1 && ly <= 3) return 'carpet';
  }
  return FLOOR_SOUND[surfaces.floor];
}
