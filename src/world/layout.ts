import { createRng, STREAMS, type Rng } from '../core/rng';
import { ACT1_BACK_EDGE, ACT1_EXIT_EDGE, CHUNK_SLOTS, DIRS, OPPOSITE, edgeKey, isOutside, isWing, parseEdge } from './grid';
import type { Dir, FillerKind, WingKind } from './types';

export type SlotKind = FillerKind | WingKind | 'void';

/** One slot's room kind and its connections. */
export interface SlotLayout {
  sx: number;
  sy: number;
  kind: SlotKind;
  /** Slots with the same key in a chunk are one room (only in the entrance wing). */
  roomKey: string;
  /** Walls with a door to another room. */
  doors: Dir[];
  /** Walls that open into another slot of the same room. */
  open: Dir[];
}

/** The topology of a chunk: which slots are which rooms, and where the doors are. */
export interface ChunkLayout {
  cx: number;
  cy: number;
  epoch: number;
  /** Index = local x + local y * CHUNK_SLOTS. */
  slots: SlotLayout[];
  /** Whether each door starts open, by edge key. */
  doorOpen: Record<string, boolean>;
}

const LOOP_CHANCE = 0.3;
const MAX_ALCOVES = 3;

interface InnerEdge {
  a: number;
  b: number;
  dir: 'E' | 'N';
}

/** Walls between slots inside a chunk, by local slot index. */
const INNER_EDGES: readonly InnerEdge[] = (() => {
  const edges: InnerEdge[] = [];
  for (let ly = 0; ly < CHUNK_SLOTS; ly++) {
    for (let lx = 0; lx < CHUNK_SLOTS; lx++) {
      const i = lx + ly * CHUNK_SLOTS;
      if (lx < CHUNK_SLOTS - 1) edges.push({ a: i, b: i + 1, dir: 'E' });
      if (ly < CHUNK_SLOTS - 1) edges.push({ a: i, b: i + CHUNK_SLOTS, dir: 'N' });
    }
  }
  return edges;
})();

const NEIGHBOURS: readonly (readonly number[])[] = Array.from({ length: CHUNK_SLOTS * CHUNK_SLOTS }, (_, i) =>
  INNER_EDGES.filter((e) => e.a === i || e.b === i).map((e) => (e.a === i ? e.b : e.a)),
);
const OPEN_DOOR_CHANCE = 0.4;

const roots = new Map<number, Rng>();

/** The house's own stream for a seed. Forks depend only on its seed, so it is safe to share. */
export function houseRng(seed: number): Rng {
  let root = roots.get(seed);
  if (!root) {
    root = createRng(seed).fork(STREAMS.house);
    if (roots.size > 1_000) roots.clear();
    roots.set(seed, root);
  }
  return root;
}

interface BorderDoor {
  edge: string;
  open: boolean;
}

const borderCache = new Map<string, BorderDoor[]>();

/**
 * Doors on the border between chunk a and chunk b, where b is east or north
 * of a. These never change, whatever the epochs, so the house stays connected.
 */
export function borderDoors(seed: number, ax: number, ay: number, bx: number, by: number): BorderDoor[] {
  if (isOutside(ay) || isOutside(by)) return [];
  if (isWing(ax, ay) || isWing(bx, by)) {
    // The wing only connects to the house through the Act 1 corridor's far door.
    return ax === -1 && ay === 0 && bx === 0 && by === 0 ? [{ edge: ACT1_EXIT_EDGE, open: false }] : [];
  }
  const key = `${seed}:${ax},${ay}|${bx},${by}`;
  const cached = borderCache.get(key);
  if (cached) return cached;

  const rng = houseRng(seed).fork(`border:${ax},${ay}|${bx},${by}`);
  const count = rng.chance(0.5) ? 2 : 1;
  const east = bx === ax + 1;
  const doors = rng
    .shuffle([0, 1, 2])
    .slice(0, count)
    .sort((p, q) => p - q)
    .map((i) => ({
      edge: east
        ? edgeKey(ax * CHUNK_SLOTS + CHUNK_SLOTS - 1, ay * CHUNK_SLOTS + i, 'E')
        : edgeKey(ax * CHUNK_SLOTS + i, ay * CHUNK_SLOTS + CHUNK_SLOTS - 1, 'N'),
      open: rng.chance(OPEN_DOOR_CHANCE),
    }));
  if (borderCache.size > 50_000) borderCache.clear();
  borderCache.set(key, doors);
  return doors;
}

function emptySlots(cx: number, cy: number): SlotLayout[] {
  const slots: SlotLayout[] = [];
  for (let ly = 0; ly < CHUNK_SLOTS; ly++) {
    for (let lx = 0; lx < CHUNK_SLOTS; lx++) {
      const sx = cx * CHUNK_SLOTS + lx;
      const sy = cy * CHUNK_SLOTS + ly;
      slots.push({ sx, sy, kind: 'void', roomKey: `${sx},${sy}`, doors: [], open: [] });
    }
  }
  return slots;
}

function fillerKind(rng: Rng, doors: readonly Dir[]): FillerKind {
  if (doors.length === 1) {
    return rng.weighted([
      { value: 'bedroom', weight: 3 },
      { value: 'nursery', weight: 2 },
      { value: 'bathroom', weight: 2 },
      { value: 'parlour', weight: 1 },
    ]);
  }
  if (doors.length === 2) {
    const straight = doors.includes(OPPOSITE[doors[0]!]);
    if (rng.chance(straight ? 0.7 : 0.5)) return 'corridor';
    return rng.weighted([
      { value: 'parlour', weight: 2 },
      { value: 'bedroom', weight: 1 },
    ]);
  }
  return rng.chance(0.45) ? 'corridor' : 'parlour';
}

/**
 * The entrance wing, chunk (0, 0):
 *   x 0: the Act 1 corridor (slots y 0-2), exit west at y 0, door east to the portrait hall at y 2
 *   x 1: the entrance hall (y 0, front door south) and the portrait hall (y 1-2)
 *   x 2: solid
 */
function wingLayout(epoch: number): ChunkLayout {
  const slots = emptySlots(0, 0);
  const set = (lx: number, ly: number, kind: WingKind, doors: Dir[], open: Dir[]) => {
    Object.assign(slots[lx + ly * CHUNK_SLOTS]!, { kind, roomKey: kind, doors, open });
  };
  set(0, 0, 'act1Corridor', ['W'], ['N']);
  set(0, 1, 'act1Corridor', [], ['N', 'S']);
  set(0, 2, 'act1Corridor', ['E'], ['S']);
  set(1, 0, 'entranceHall', ['N'], []);
  set(1, 1, 'portraitHall', ['S'], ['N']);
  set(1, 2, 'portraitHall', ['W'], ['S']);
  return {
    cx: 0,
    cy: 0,
    epoch,
    slots,
    doorOpen: { '1,0:N': true, [ACT1_BACK_EDGE]: true, [ACT1_EXIT_EDGE]: false },
  };
}

/** The pure layout of a chunk: a function of seed, chunk coordinates and epoch only. */
export function generateLayout(seed: number, cx: number, cy: number, epoch: number): ChunkLayout {
  if (isOutside(cy)) return { cx, cy, epoch, slots: emptySlots(cx, cy), doorOpen: {} };
  if (isWing(cx, cy)) return wingLayout(epoch);

  const rng = houseRng(seed).fork(`chunk:${cx},${cy}:${epoch}`);
  const slots = emptySlots(cx, cy);
  const doorOpen: Record<string, boolean> = {};
  const addDoor = (index: number, dir: Dir, open: boolean) => {
    const slot = slots[index]!;
    slot.doors.push(dir);
    doorOpen[edgeKey(slot.sx, slot.sy, dir)] = open;
  };

  // Doors to the neighbouring chunks first; they never change. Border edges are named from the west or south slot.
  const last = CHUNK_SLOTS - 1;
  const localX = (edge: string) => parseEdge(edge).sx - cx * CHUNK_SLOTS;
  const localY = (edge: string) => parseEdge(edge).sy - cy * CHUNK_SLOTS;
  for (const { edge, open } of borderDoors(seed, cx - 1, cy, cx, cy)) addDoor(localY(edge) * CHUNK_SLOTS, 'W', open);
  for (const { edge, open } of borderDoors(seed, cx, cy, cx + 1, cy)) addDoor(last + localY(edge) * CHUNK_SLOTS, 'E', open);
  for (const { edge, open } of borderDoors(seed, cx, cy - 1, cx, cy)) addDoor(localX(edge), 'S', open);
  for (const { edge, open } of borderDoors(seed, cx, cy, cx, cy + 1)) addDoor(localX(edge) + last * CHUNK_SLOTS, 'N', open);
  const hasBorderDoor = slots.map((slot) => slot.doors.length > 0);

  const edges = INNER_EDGES;
  const touches = (edge: InnerEdge, i: number) => edge.a === i || edge.b === i;

  // Alcoves: slots with no border door that will get exactly one door, so they are dead ends
  // where key rooms can go. They are never next to each other, and the other slots must stay connected.
  const alcove = slots.map(() => false);
  const othersConnected = () => {
    const start = alcove.indexOf(false);
    const seen = [start];
    for (let k = 0; k < seen.length; k++) {
      for (const j of NEIGHBOURS[seen[k]!]!) if (!alcove[j] && !seen.includes(j)) seen.push(j);
    }
    return seen.length === alcove.filter((a) => !a).length;
  };
  let alcoveCount = 0;
  for (const i of rng.shuffle(slots.map((_, i) => i).filter((i) => !hasBorderDoor[i]))) {
    if (alcoveCount === MAX_ALCOVES) break;
    if (NEIGHBOURS[i]!.some((j) => alcove[j])) continue;
    alcove[i] = true;
    if (othersConnected()) alcoveCount++;
    else alcove[i] = false;
  }

  // A random spanning tree over the other slots, so every slot is reachable, plus some loops.
  const parent = slots.map((_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i]!)));
  const chosen: InnerEdge[] = [];
  const extra: InnerEdge[] = [];
  for (const edge of rng.shuffle(edges.filter((e) => !alcove[e.a] && !alcove[e.b]))) {
    const rootA = find(edge.a);
    const rootB = find(edge.b);
    if (rootA !== rootB) {
      parent[rootA] = rootB;
      chosen.push(edge);
    } else {
      extra.push(edge);
    }
  }
  chosen.push(...extra.filter(() => rng.chance(LOOP_CHANCE)));
  // Each alcove hangs off one neighbour.
  slots.forEach((_, i) => {
    if (alcove[i]) chosen.push(rng.pick(edges.filter((e) => touches(e, i))));
  });
  for (const edge of chosen) {
    const open = rng.chance(OPEN_DOOR_CHANCE);
    addDoor(edge.a, edge.dir, open);
    addDoor(edge.b, OPPOSITE[edge.dir], open);
  }

  for (const slot of slots) {
    slot.doors.sort((p, q) => DIRS.indexOf(p) - DIRS.indexOf(q));
    slot.kind = fillerKind(rng, slot.doors);
  }
  return { cx, cy, epoch, slots, doorOpen };
}

/** A copy of a layout without the given edges (used when the Act 1 corridor is walled up). */
export function withoutEdges(layout: ChunkLayout, removed: ReadonlySet<string>): ChunkLayout {
  const slots = layout.slots.map((slot) => ({
    ...slot,
    doors: slot.doors.filter((dir) => !removed.has(edgeKey(slot.sx, slot.sy, dir))),
  }));
  const doorOpen = Object.fromEntries(Object.entries(layout.doorOpen).filter(([edge]) => !removed.has(edge)));
  return { ...layout, slots, doorOpen };
}
