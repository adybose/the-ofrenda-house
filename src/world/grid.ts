import type { CellId, ChunkId, Dir, DoorId, SlotKey } from './types';

/** Cells along one side of a slot. Each slot holds one room. */
export const SLOT_CELLS = 5;
/** Slots along one side of a chunk. */
export const CHUNK_SLOTS = 3;

/** Chunks within this many of the player's chunk are loaded... */
export const LOAD_RADIUS = 1;
/** ...and chunks further than this are unloaded. */
export const UNLOAD_RADIUS = 2;
export const MAX_LOADED_CHUNKS = (2 * UNLOAD_RADIUS + 1) ** 2;

/** K: every unvisited key room is at most this many doors from the player after a reshuffle. */
export const KEY_ROOM_REACH = 14;
/** Key rooms are never placed closer than this, so they stay hidden among filler rooms. */
export const KEY_ROOM_MIN_DISTANCE = 3;
/** Chunks within this many of the player's chunk can be reshuffled. */
export const RESHUFFLE_RADIUS = 2;

export const DINING_MIN_DISTANCE = 2;
export const DINING_MAX_DISTANCE = 6;

export const DIRS: readonly Dir[] = ['N', 'E', 'S', 'W'];
export const DIR_STEP: Record<Dir, readonly [number, number]> = { N: [0, 1], E: [1, 0], S: [0, -1], W: [-1, 0] };
export const OPPOSITE: Record<Dir, Dir> = { N: 'S', E: 'W', S: 'N', W: 'E' };

// The entrance wing is the fixed chunk (0, 0).
export const FRONT_DOOR_ID: DoorId = 'front-door';
/** The Act 1 corridor's far door, sealed until Act 1 ends. */
export const ACT1_EXIT_EDGE = '-1,0:E';
/** The doorway from the portrait hall into the Act 1 corridor, walled up when the corridor shifts. */
export const ACT1_BACK_EDGE = '0,2:E';
/** The middle of the entrance hall. */
export const START_CELL: CellId = '7,2';

export const cellId = (x: number, y: number): CellId => `${x},${y}`;
export const slotKey = (sx: number, sy: number): SlotKey => `${sx},${sy}`;
export const chunkId = (cx: number, cy: number): ChunkId => `${cx},${cy}`;

export function parseCell(id: CellId | SlotKey | ChunkId): [number, number] {
  const comma = id.indexOf(',');
  return [Number(id.slice(0, comma)), Number(id.slice(comma + 1))];
}

export const slotOfCell = (x: number, y: number): [number, number] => [
  Math.floor(x / SLOT_CELLS),
  Math.floor(y / SLOT_CELLS),
];

export const chunkOfSlot = (sx: number, sy: number): [number, number] => [
  Math.floor(sx / CHUNK_SLOTS),
  Math.floor(sy / CHUNK_SLOTS),
];

export function chunkOfCell(cell: CellId): [number, number] {
  return chunkOfSlot(...slotOfCell(...parseCell(cell)));
}

export const chebyshev = (ax: number, ay: number, bx: number, by: number): number =>
  Math.max(Math.abs(ax - bx), Math.abs(ay - by));

export const isWing = (cx: number, cy: number): boolean => cx === 0 && cy === 0;
export const isOutside = (cy: number): boolean => cy < 0;

/** The canonical name of the wall between a slot and its neighbour: always written from the west or south slot. */
export function edgeKey(sx: number, sy: number, dir: Dir): string {
  switch (dir) {
    case 'N':
      return `${sx},${sy}:N`;
    case 'E':
      return `${sx},${sy}:E`;
    case 'S':
      return `${sx},${sy - 1}:N`;
    case 'W':
      return `${sx - 1},${sy}:E`;
  }
}

export function parseEdge(edge: string): { sx: number; sy: number; dir: 'N' | 'E' } {
  const [coords, dir] = edge.split(':') as [string, 'N' | 'E'];
  const [sx, sy] = parseCell(coords);
  return { sx, sy, dir };
}

export const doorIdOf = (edge: string): DoorId => `d:${edge}`;

/** The two cells either side of the door in the middle of an edge. */
export function edgeCells(edge: string): [CellId, CellId] {
  const { sx, sy, dir } = parseEdge(edge);
  const x0 = sx * SLOT_CELLS;
  const y0 = sy * SLOT_CELLS;
  const mid = (SLOT_CELLS - 1) / 2;
  const last = SLOT_CELLS - 1;
  return dir === 'E'
    ? [cellId(x0 + last, y0 + mid), cellId(x0 + SLOT_CELLS, y0 + mid)]
    : [cellId(x0 + mid, y0 + last), cellId(x0 + mid, y0 + SLOT_CELLS)];
}

/** The chunk that owns (builds) a door: the one holding its west or south side. */
export function doorOwnerChunk(doorId: DoorId): [number, number] {
  if (doorId === FRONT_DOOR_ID) return [0, 0];
  const { sx, sy } = parseEdge(doorId.slice(2));
  return chunkOfSlot(sx, sy);
}
