import { DIRS, DIR_STEP, FRONT_DOOR_ID, SLOT_CELLS, cellId, edgeCells, parseCell, slotOfCell } from './grid';
import type { CharacterId } from '../case/types';
import type { CellId, Dir, Room } from './types';
import { CELL_SIZE, WALL_INSET, cellCentre } from './units';

// Candle stands (spec 18): the table beneath a spirit's portrait, the stand at the Act 1 dead end
// with the matchbox, and spare candles in some ordinary rooms. Pure, so the renderer, collision,
// the E prompt and the items state all agree on where they are.

/** Footprints in metres: w along the wall, d out from it, h up to the top the candle stands on. */
export const STAND_SIZE = {
  table: { w: 0.7, d: 0.45, h: 0.75 },
  stand: { w: 0.4, d: 0.3, h: 0.9 },
} as const;

export interface Stand {
  /** `stand:` + the room's id. */
  id: string;
  roomId: string;
  kind: 'table' | 'stand';
  characterId?: CharacterId;
  cell: CellId;
  wall: Dir;
  /** Centre of the footprint, in world metres, and the height of its top. */
  x: number;
  z: number;
  top: number;
  /** The Act 1 stand also holds the matchbox. */
  matchbox: boolean;
}

export const standId = (roomId: string): string => `stand:${roomId}`;

function doorCells(id: string): readonly [CellId, CellId] {
  return id === FRONT_DOOR_ID ? ['7,0', '7,-1'] : edgeCells(id.slice(2));
}

/**
 * Wall spots free for a portrait or a candle: cells along the room's outer walls, middles first
 * (N E S W), then the cells either side of each middle, without a door, window or wall anchor,
 * and never a doorway.
 */
export function freeWallSpots(room: Room): { cell: CellId; side: Dir }[] {
  const inRoom = new Set(room.cells);
  const openings = new Set<string>();
  const doorways = new Set<CellId>();
  for (const id of room.doors) {
    const [a, b] = doorCells(id);
    for (const [inside, outside] of [[a, b], [b, a]] as const) {
      if (!inRoom.has(inside)) continue;
      doorways.add(inside);
      const [x0, y0] = parseCell(inside);
      const [x1, y1] = parseCell(outside);
      const side = DIRS.find((d) => DIR_STEP[d][0] === x1 - x0 && DIR_STEP[d][1] === y1 - y0);
      if (side) openings.add(`${inside}|${side}`);
    }
  }
  for (const w of room.windows) openings.add(`${w.cell}|${w.side}`);
  const [sx, sy] = slotOfCell(...parseCell(room.cells[0]!));
  const spots: { cell: CellId; side: Dir }[] = [];
  for (const offset of [0, -1, 1]) {
    for (const side of DIRS) {
      const [dx, dy] = DIR_STEP[side];
      // Along the wall: east-west on N and S walls, north-south on E and W walls.
      const [ax, ay] = dx === 0 ? [offset, 0] : [0, offset];
      const cell = cellId(sx * SLOT_CELLS + 2 + dx * 2 + ax, sy * SLOT_CELLS + 2 + dy * 2 + ay);
      const [cx, cy] = parseCell(cell);
      if (!inRoom.has(cell) || inRoom.has(cellId(cx + dx, cy + dy)) || doorways.has(cell)) continue;
      if (openings.has(`${cell}|${side}`)) continue;
      if (room.anchors.some((a) => a.cell === cell && (a.side === side || !a.side))) continue;
      spots.push({ cell, side });
    }
  }
  return spots;
}

/** Where a key room hangs its spirit's portrait, with the candle's table beneath it. */
export function portraitWall(room: Room): { cell: CellId; side: Dir } | undefined {
  return freeWallSpots(room)[0];
}

/** A footprint pushed back against `wall` in `cell`, as furniture stands. */
export function againstWall(cell: CellId, wall: Dir, depth: number): { x: number; z: number } {
  const [cx, cz] = cellCentre(cell);
  const push = CELL_SIZE / 2 - WALL_INSET - depth / 2 - 0.02;
  const [wx, wy] = DIR_STEP[wall];
  return { x: cx + wx * push, z: cz - wy * push };
}

/** The candle stands in a room, from its anchors (at most one per room). */
export function standsOf(room: Room): Stand[] {
  const anchor = room.anchors.find((a) => (a.kind === 'candleTable' || a.kind === 'candleStand' || a.kind === 'spareCandle') && a.side);
  if (!anchor) return [];
  const kind = anchor.kind === 'candleTable' ? 'table' : 'stand';
  const size = STAND_SIZE[kind];
  const { x, z } = againstWall(anchor.cell, anchor.side!, size.d);
  return [
    {
      id: standId(room.id),
      roomId: room.id,
      kind,
      characterId: room.kind === 'key' ? room.characterId : undefined,
      cell: anchor.cell,
      wall: anchor.side!,
      x,
      z,
      top: size.h,
      matchbox: room.anchors.some((a) => a.kind === 'matchbox'),
    },
  ];
}
