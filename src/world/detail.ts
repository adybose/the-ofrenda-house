import type { Rng } from '../core/rng';
import {
  ACT1_BACK_EDGE,
  ACT1_EXIT_EDGE,
  CHUNK_SLOTS,
  DIRS,
  FRONT_DOOR_ID,
  SLOT_CELLS,
  cellId,
  chunkId,
  doorIdOf,
  edgeCells,
  edgeKey,
  isWing,
} from './grid';
import { generateLayout, houseRng, type ChunkLayout, type SlotLayout } from './layout';
import type { Anchor, CellId, Chunk, Dir, Door, FillerKind, Room, SizeClass, Window } from './types';

const MID = (SLOT_CELLS - 1) / 2;
const LAST = SLOT_CELLS - 1;

export const FILLER_SIZE: Record<FillerKind, SizeClass> = {
  parlour: 'large',
  bedroom: 'medium',
  nursery: 'small',
  bathroom: 'small',
  corridor: 'medium',
};

/** Local coordinates of the cell in the middle of a wall. */
const WALL_MIDDLE: Record<Dir, readonly [number, number]> = { N: [MID, LAST], E: [LAST, MID], S: [MID, 0], W: [0, MID] };
const CORNERS: readonly (readonly [number, number])[] = [
  [0, 0],
  [LAST, 0],
  [0, LAST],
  [LAST, LAST],
];

function slotCells(slot: SlotLayout, corridor: boolean): CellId[] {
  const x0 = slot.sx * SLOT_CELLS;
  const y0 = slot.sy * SLOT_CELLS;
  const cells: CellId[] = [];
  for (let j = 0; j < SLOT_CELLS; j++) {
    for (let i = 0; i < SLOT_CELLS; i++) {
      // A corridor is a one-cell cross from the middle to each of its doors.
      const onArm =
        (i === MID && j === MID) ||
        (i === MID && j > MID && slot.doors.includes('N')) ||
        (i === MID && j < MID && slot.doors.includes('S')) ||
        (j === MID && i > MID && slot.doors.includes('E')) ||
        (j === MID && i < MID && slot.doors.includes('W'));
      if (!corridor || onArm) cells.push(cellId(x0 + i, y0 + j));
    }
  }
  return cells;
}

function fillerDetail(rng: Rng, slot: SlotLayout, kind: FillerKind, cells: readonly CellId[]): Pick<Room, 'windows' | 'anchors'> {
  const x0 = slot.sx * SLOT_CELLS;
  const y0 = slot.sy * SLOT_CELLS;
  const at = ([i, j]: readonly [number, number]) => cellId(x0 + i, y0 + j);
  const freeSides = DIRS.filter((side) => !slot.doors.includes(side));
  const windows: Window[] = [];
  const anchors: Anchor[] = [];

  if (kind === 'corridor') {
    for (const side of freeSides) {
      if (windows.length === 0 && rng.chance(0.2)) windows.push({ cell: at([MID, MID]), side });
    }
    anchors.push({ kind: 'floorboards', cell: rng.pick(cells) });
    return { windows, anchors };
  }

  for (const side of freeSides) {
    // Rooms along the façade get more windows.
    const facade = side === 'S' && slot.sy === 0;
    if (rng.chance(facade ? 0.6 : 0.25)) windows.push({ cell: at(WALL_MIDDLE[side]), side });
  }
  const plainWalls = rng.shuffle(freeSides.filter((side) => !windows.some((w) => w.side === side)));
  const wallAnchor = (anchorKind: 'fireplace' | 'mirror') => {
    const side = plainWalls.shift();
    if (side) anchors.push({ kind: anchorKind, cell: at(WALL_MIDDLE[side]), side });
  };
  const corner = () => anchors.push({ kind: 'darkCorner', cell: at(rng.pick(CORNERS)) });
  const floorboards = () => anchors.push({ kind: 'floorboards', cell: rng.pick(cells) });

  if (kind === 'parlour') {
    wallAnchor('fireplace');
    anchors.push({ kind: 'chandelier', cell: at([MID, MID]) });
    wallAnchor('mirror');
    corner();
    floorboards();
  } else if (kind === 'bedroom') {
    if (rng.chance(0.5)) wallAnchor('mirror');
    corner();
    floorboards();
  } else if (kind === 'nursery') {
    corner();
    floorboards();
  } else {
    wallAnchor('mirror');
  }
  return { windows, anchors };
}

/** Portrait slots without names; the house fills them from the case file. The first is the patriarch's. */
function wingRooms(layout: ChunkLayout): Room[] {
  const id = chunkId(0, 0);
  const range = (x0: number, x1: number, y0: number, y1: number) => {
    const cells: CellId[] = [];
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) cells.push(cellId(x, y));
    return cells;
  };
  const backOpen = layout.slots[CHUNK_SLOTS * 2]!.doors.includes('E');
  const back = doorIdOf(ACT1_BACK_EDGE);
  const exit = doorIdOf(ACT1_EXIT_EDGE);
  const entry = doorIdOf('1,0:N');

  const corridorCells = [
    ...range(0, 1, 2, 2),
    ...range(2, 2, 2, 12),
    ...(backOpen ? range(3, 4, 12, 12) : range(3, 3, 12, 12)),
  ];
  const portraits: Anchor[] = [
    { kind: 'portrait', cell: '7,14', side: 'N' },
    ...[5, 6, 7, 8, 9, 10, 11].map((y): Anchor => ({ kind: 'portrait', cell: cellId(5, y), side: 'W' })),
  ];
  return [
    {
      id: 'act1-corridor',
      kind: 'act1Corridor',
      size: 'medium',
      chunkId: id,
      cells: corridorCells,
      doors: backOpen ? [exit, back] : [exit],
      windows: [],
      anchors: [
        { kind: 'floorboards', cell: '2,7' },
        { kind: 'darkCorner', cell: '2,12' },
      ],
    },
    {
      id: 'entrance-hall',
      kind: 'entranceHall',
      size: 'large',
      chunkId: id,
      cells: range(5, 9, 0, 4),
      doors: [FRONT_DOOR_ID, entry],
      windows: [
        { cell: '5,0', side: 'S' },
        { cell: '9,0', side: 'S' },
      ],
      anchors: [
        { kind: 'clock', cell: '5,2', side: 'W' },
        { kind: 'mirror', cell: '9,2', side: 'E' },
        { kind: 'chandelier', cell: '7,2' },
      ],
    },
    {
      id: 'portrait-hall',
      kind: 'portraitHall',
      size: 'large',
      chunkId: id,
      cells: range(5, 9, 5, 14),
      doors: backOpen ? [entry, back] : [entry],
      windows: [6, 9, 12].map((y): Window => ({ cell: cellId(9, y), side: 'E' })),
      anchors: [{ kind: 'chandelier', cell: '7,9' }, ...portraits],
    },
  ];
}

/** Builds rooms and owned doors from a layout. Pure: same layout, same chunk. */
export function buildChunk(seed: number, layout: ChunkLayout): Chunk {
  const { cx, cy, epoch } = layout;
  const id = chunkId(cx, cy);
  const doors: Door[] = [];
  const ownDoor = (edge: string) => {
    const [a, b] = edgeCells(edge);
    doors.push({ id: doorIdOf(edge), a, b, state: layout.doorOpen[edge] ? 'open' : 'closed' });
  };

  if (isWing(cx, cy)) {
    doors.push({ id: FRONT_DOOR_ID, a: '7,0', b: '7,-1', state: 'closed' });
    ownDoor('1,0:N');
    if (layout.slots[CHUNK_SLOTS * 2]!.doors.includes('E')) ownDoor(ACT1_BACK_EDGE);
    return { id, cx, cy, epoch, rooms: wingRooms(layout), doors };
  }

  const rng = houseRng(seed).fork(`detail:${cx},${cy}:${epoch}`);
  const rooms: Room[] = [];
  for (const slot of layout.slots) {
    if (slot.kind === 'void') continue;
    const kind = slot.kind as FillerKind;
    const cells = slotCells(slot, kind === 'corridor');
    rooms.push({
      id: `r:${slot.sx},${slot.sy}:${epoch}`,
      kind,
      size: FILLER_SIZE[kind],
      chunkId: id,
      cells,
      doors: slot.doors.map((dir) => doorIdOf(edgeKey(slot.sx, slot.sy, dir))),
      ...fillerDetail(rng, slot, kind, cells),
    });
    // A chunk owns the doors on the east and north walls of its slots.
    for (const dir of slot.doors) if (dir === 'E' || dir === 'N') ownDoor(edgeKey(slot.sx, slot.sy, dir));
  }
  return { id, cx, cy, epoch, rooms, doors };
}

/** A chunk exactly as generated, before the house adds key rooms, portraits and door states. */
export function generateChunk(seed: number, cx: number, cy: number, epoch: number): Chunk {
  return buildChunk(seed, generateLayout(seed, cx, cy, epoch));
}

export { slotCells };
