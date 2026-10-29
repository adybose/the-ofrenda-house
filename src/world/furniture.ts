import type { RoomKind as KeyRoomStyle } from '../case/types';
import { createRng } from '../core/rng';
import { DIRS, DIR_STEP, cellId, edgeCells, parseCell } from './grid';
import { STAND_SIZE, standsOf } from './stands';
import type { CellId, Dir, Room, RoomKind } from './types';
import { CELL_SIZE, WALL_INSET, cellCentre } from './units';

export type FurnitureKind =
  | 'sofa'
  | 'armchair'
  | 'sideTable'
  | 'bed'
  | 'wardrobe'
  | 'nightstand'
  | 'crib'
  | 'rockingChair'
  | 'toyChest'
  | 'bathtub'
  | 'washstand'
  | 'desk'
  | 'bookshelf'
  | 'chair'
  | 'easel'
  | 'table'
  | 'planter'
  | 'stairs'
  | 'shelf'
  | 'stove'
  | 'piano'
  | 'pew'
  | 'altar'
  | 'sewingTable'
  | 'bench'
  // Spec 18: placed from the room's candle anchors, not drawn from the room's list.
  | 'candleTable'
  | 'candleStand';

/** One piece against a wall. Sizes in metres: w along the wall, d out from it, h up. */
export interface Furniture {
  kind: FurnitureKind;
  /** Cells it stands on (1 or 2, along the wall). Spec 05 treats these as solid. */
  cells: CellId[];
  /** Centre of the footprint in world metres. */
  x: number;
  z: number;
  w: number;
  d: number;
  h: number;
  /** The wall it stands against; it faces the other way. */
  wall: Dir;
}

interface Spec {
  kind: FurnitureKind;
  cells: 1 | 2;
  w: number;
  d: number;
  h: number;
}

const piece = (kind: FurnitureKind, cells: 1 | 2, w: number, d: number, h: number): Spec => ({ kind, cells, w, d, h });

const SOFA = piece('sofa', 2, 2.4, 0.9, 0.9);
const ARMCHAIR = piece('armchair', 1, 0.9, 0.9, 1.0);
const SIDE_TABLE = piece('sideTable', 1, 0.6, 0.6, 0.7);
const BED = piece('bed', 2, 2.0, 1.3, 0.7);
const WARDROBE = piece('wardrobe', 1, 1.2, 0.6, 2.1);
const NIGHTSTAND = piece('nightstand', 1, 0.5, 0.5, 0.6);
const CRIB = piece('crib', 1, 1.2, 0.7, 1.0);
const ROCKING_CHAIR = piece('rockingChair', 1, 0.7, 0.8, 1.0);
const TOY_CHEST = piece('toyChest', 1, 0.9, 0.5, 0.5);
const BATHTUB = piece('bathtub', 2, 1.7, 0.8, 0.6);
const WASHSTAND = piece('washstand', 1, 0.7, 0.5, 0.9);
const DESK = piece('desk', 2, 1.8, 0.8, 0.8);
const SHELF_SMALL = piece('bookshelf', 1, 1.2, 0.4, 2.2);
const SHELF_LONG = piece('bookshelf', 2, 2.6, 0.4, 2.2);
const CHAIR = piece('chair', 1, 0.5, 0.5, 0.9);
const EASEL = piece('easel', 1, 0.8, 0.6, 1.8);
const TABLE = piece('table', 2, 2.2, 0.8, 0.8);
const SMALL_TABLE = piece('table', 1, 1.1, 0.7, 0.8);
const PLANTER_LONG = piece('planter', 2, 2.4, 0.8, 0.9);
const PLANTER = piece('planter', 1, 1.1, 0.8, 0.9);
const STAIRS = piece('stairs', 2, 2.6, 1.2, 2.6);
const SHELF = piece('shelf', 1, 1.2, 0.4, 1.8);
const SHELF_WIDE = piece('shelf', 2, 2.6, 0.4, 1.8);
const STOVE = piece('stove', 1, 1.0, 0.7, 0.9);
const PIANO = piece('piano', 2, 1.6, 0.7, 1.2);
const PEW = piece('pew', 2, 2.6, 0.6, 0.9);
const ALTAR = piece('altar', 1, 1.2, 0.6, 1.1);
const SEWING_TABLE = piece('sewingTable', 1, 0.9, 0.5, 0.8);
const BENCH = piece('bench', 2, 2.4, 0.5, 0.5);
const POTTING_BENCH = piece('bench', 2, 2.4, 0.7, 0.9);

const BY_KIND: Partial<Record<RoomKind, readonly Spec[]>> = {
  parlour: [SOFA, ARMCHAIR, ARMCHAIR, SIDE_TABLE],
  bedroom: [BED, WARDROBE, NIGHTSTAND],
  nursery: [CRIB, ROCKING_CHAIR, TOY_CHEST],
  bathroom: [BATHTUB, WASHSTAND],
  portraitHall: [BENCH],
};

const BY_STYLE: Record<KeyRoomStyle, readonly Spec[]> = {
  study: [DESK, SHELF_SMALL, CHAIR],
  studio: [EASEL, EASEL, SMALL_TABLE],
  greenhouse: [PLANTER_LONG, PLANTER_LONG, PLANTER],
  conservatory: [PLANTER_LONG, PLANTER, ARMCHAIR],
  library: [SHELF_LONG, SHELF_LONG, DESK],
  countingRoom: [DESK, SHELF_LONG, CHAIR],
  servantsStairs: [STAIRS, SHELF],
  linenRoom: [SHELF_WIDE, SHELF],
  kitchen: [STOVE, TABLE, SHELF],
  pantry: [SHELF_WIDE, SHELF_WIDE],
  musicRoom: [PIANO, CHAIR, ARMCHAIR],
  guestRoom: [BED, WARDROBE],
  chapel: [PEW, PEW, ALTAR],
  sewingRoom: [SMALL_TABLE, SEWING_TABLE, SHELF],
  pottingRoom: [POTTING_BENCH, PLANTER],
};

/** Cells that must stay clear: each doorway and the cell in front of it, and anchored props. */
function blockedCells(room: Room): Set<CellId> {
  const blocked = new Set<CellId>();
  const inRoom = new Set(room.cells);
  for (const id of room.doors) {
    const [a, b] = id === 'front-door' ? (['7,0', '7,-1'] as const) : edgeCells(id.slice(2));
    for (const [inside, outside] of [[a, b], [b, a]] as const) {
      if (!inRoom.has(inside)) continue;
      blocked.add(inside);
      const [x, y] = parseCell(inside);
      const [ox, oy] = parseCell(outside);
      blocked.add(cellId(x + (x - ox), y + (y - oy)));
    }
  }
  for (const anchor of room.anchors) if (anchor.side || anchor.kind === 'ofrenda') blocked.add(anchor.cell);
  for (const window of room.windows) blocked.add(window.cell);
  return blocked;
}

/** Where a room's furniture stands. Pure, so rendering (04) and collision (05) agree. */
export function furnishRoom(room: Room, seed: number): Furniture[] {
  // The candle's table or stand first, where its anchor says (spec 18).
  const placed: Furniture[] = standsOf(room).map((stand) => {
    const size = STAND_SIZE[stand.kind];
    return { kind: stand.kind === 'table' ? 'candleTable' : 'candleStand', cells: [stand.cell], x: stand.x, z: stand.z, ...size, wall: stand.wall };
  });
  const specs = room.kind === 'key' && room.style ? BY_STYLE[room.style] : BY_KIND[room.kind];
  if (!specs) return placed;
  const rng = createRng(seed).fork('furniture').fork(room.id);
  const inRoom = new Set(room.cells);
  const used = blockedCells(room);

  // Every free (cell, wall) pair along the room's edge.
  const spots: { cell: CellId; wall: Dir }[] = [];
  for (const cell of room.cells) {
    const [x, y] = parseCell(cell);
    for (const wall of DIRS) {
      const [dx, dy] = DIR_STEP[wall];
      if (!inRoom.has(cellId(x + dx, y + dy))) spots.push({ cell, wall });
    }
  }

  for (const spec of specs) {
    for (const spot of rng.shuffle(spots)) {
      const [x, y] = parseCell(spot.cell);
      // Two-cell pieces run along the wall: east-west for N/S walls, north-south for E/W walls.
      const along: readonly [number, number] = spot.wall === 'N' || spot.wall === 'S' ? [1, 0] : [0, 1];
      const cells = spec.cells === 1 ? [spot.cell] : [spot.cell, cellId(x + along[0], y + along[1])];
      const fits = cells.every((c) => {
        if (!inRoom.has(c) || used.has(c)) return false;
        const [cx, cy] = parseCell(c);
        const [dx, dy] = DIR_STEP[spot.wall];
        return !inRoom.has(cellId(cx + dx, cy + dy));
      });
      if (!fits) continue;

      for (const c of cells) used.add(c);
      const centres = cells.map(cellCentre);
      const cx = centres.reduce((s, [px]) => s + px, 0) / centres.length;
      const cz = centres.reduce((s, [, pz]) => s + pz, 0) / centres.length;
      // Push it back against the wall.
      const push = CELL_SIZE / 2 - WALL_INSET - spec.d / 2 - 0.02;
      const [wx, wy] = DIR_STEP[spot.wall];
      placed.push({
        kind: spec.kind,
        cells,
        x: cx + wx * push,
        z: cz - wy * push,
        w: spec.w,
        d: spec.d,
        h: spec.h,
        wall: spot.wall,
      });
      break;
    }
  }
  return placed;
}

