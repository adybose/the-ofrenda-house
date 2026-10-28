import type { CaseFile, CharacterId, RoomKind as KeyRoomStyle } from '../case/types';
import type { Rng } from '../core/rng';
import { buildChunk, slotCells } from './detail';
import {
  ACT1_BACK_EDGE,
  ACT1_EXIT_EDGE,
  CHUNK_SLOTS,
  DINING_MAX_DISTANCE,
  DINING_MIN_DISTANCE,
  DIRS,
  DIR_STEP,
  FRONT_DOOR_ID,
  KEY_ROOM_MIN_DISTANCE,
  KEY_ROOM_REACH,
  LOAD_RADIUS,
  RESHUFFLE_RADIUS,
  SLOT_CELLS,
  START_CELL,
  UNLOAD_RADIUS,
  cellId,
  chebyshev,
  chunkId,
  chunkOfCell,
  chunkOfSlot,
  doorIdOf,
  doorOwnerChunk,
  edgeKey,
  isOutside,
  isWing,
  parseCell,
  slotOfCell,
} from './grid';
import { generateLayout, houseRng, withoutEdges, type ChunkLayout, type SlotLayout } from './layout';
import type { CellId, Chunk, ChunkDiff, ChunkId, Dir, Door, DoorId, DoorState, KeyRoomState, Room, SizeClass } from './types';

export interface House {
  readonly seed: number;
  /** The middle of the entrance hall, where the game starts. */
  readonly startCell: CellId;
  update(playerCell: CellId): ChunkDiff;
  reshuffle(visible: ReadonlySet<CellId>, playerCell: CellId): ChunkDiff;
  unlock(doorId: DoorId): void;
  /** Opens or closes an ordinary door. Returns false for locked or sealed doors. */
  setDoorOpen(doorId: DoorId, open: boolean): boolean;
  pinCells(cells: readonly CellId[]): void;
  shiftCorridorBehind(): ChunkDiff;
  endAct1(): void;
  revealDiningRoom(visible: ReadonlySet<CellId>, playerCell: CellId, facing: Dir): ChunkDiff;
  unsealFrontDoor(): void;
  /** The door slams and locks behind the player (spec 16); only the ending opens it again. */
  sealFrontDoor(): void;
  markVisited(characterId: CharacterId): void;
  pathBetween(a: CellId, b: CellId, blocked?: (cell: CellId) => boolean): CellId[] | null;
  roomAt(cell: CellId): Room | undefined;
  getRoom(roomId: string): Room | undefined;
  getDoor(doorId: DoorId): Door | undefined;
  doorBetween(a: CellId, b: CellId): Door | undefined;
  loadedChunks(): Chunk[];
  /** Any chunk as it stands now, loaded or not (for debug views). */
  chunkAt(cx: number, cy: number): Chunk;
  keyRooms(): KeyRoomState[];
  diningRoom(): Room | undefined;
  distancesFrom(cell: CellId, maxDepth: number): Map<string, number>;
}

const STYLE_SIZE: Partial<Record<KeyRoomStyle, SizeClass>> = {
  greenhouse: 'large',
  conservatory: 'large',
  library: 'large',
  studio: 'large',
  chapel: 'large',
};

const WING_ROOM_IDS: Record<string, string> = {
  entranceHall: 'entrance-hall',
  portraitHall: 'portrait-hall',
  act1Corridor: 'act1-corridor',
};

/** Give up on a path search after this many cells. */
const MAX_PATH_EXPANSIONS = 20_000;

type Override = { type: 'key'; characterId: CharacterId } | { type: 'dining' };

/** Packs grid coordinates into one number, for fast map keys. */
const pack = (x: number, y: number): number => (x + 0x8000) * 0x10000 + (y + 0x8000);
const unpack = (key: number): [number, number] => [Math.floor(key / 0x10000) - 0x8000, (key % 0x10000) - 0x8000];

interface KeyRoom extends KeyRoomState {
  slot?: [number, number];
}

interface Built {
  epoch: number;
  chunk: Chunk;
  roomByCell: Map<CellId, Room>;
  doorByCells: Map<string, Door>;
}

function lockPlan(rng: Rng, caseFile: CaseFile): KeyRoom[] {
  const spirits = caseFile.characters.filter((c) => c.role !== 'patriarch');
  const order = rng.shuffle(spirits);
  const lockedCount = rng.int(2, 3);
  const plan = order.map((character, i): KeyRoom => {
    const locked = i >= order.length - lockedCount;
    return {
      characterId: character.id,
      style: character.roomKind,
      keyId: `key:${character.id}`,
      locked,
      // A key is always held by a spirit earlier in the order, so the order is acyclic.
      keyHolderId: locked ? rng.pick(order.slice(0, i)).id : undefined,
      visited: false,
    };
  });
  return spirits.map((c) => plan.find((k) => k.characterId === c.id)!);
}

export function createHouse(seed: number, caseFile: CaseFile): House {
  const root = houseRng(seed);
  const epochs = new Map<number, number>();
  const layouts = new Map<number, ChunkLayout>();
  const built = new Map<ChunkId, Built>();
  const dirty = new Set<ChunkId>();
  const loaded = new Map<ChunkId, Chunk>();
  const overrides = new Map<number, Override>();
  const doorStates = new Map<DoorId, DoorState>([
    [FRONT_DOOR_ID, 'sealed'],
    [doorIdOf(ACT1_EXIT_EDGE), 'sealed'],
  ]);
  const removedEdges = new Set<string>();
  const pinned = new Set<CellId>();
  let diningSlot: [number, number] | undefined;
  let reshuffles = 0;
  const keyRooms = lockPlan(root.fork('locks'), caseFile);
  const byCharacter = new Map(keyRooms.map((k) => [k.characterId, k]));

  const epochOf = (cx: number, cy: number) => epochs.get(pack(cx, cy)) ?? 0;

  function layoutOf(cx: number, cy: number): ChunkLayout {
    const epoch = epochOf(cx, cy);
    const key = pack(cx, cy);
    let layout = layouts.get(key);
    if (!layout || layout.epoch !== epoch) {
      layout = generateLayout(seed, cx, cy, epoch);
      if (removedEdges.size > 0 && isWing(cx, cy)) layout = withoutEdges(layout, removedEdges);
      layouts.set(key, layout);
    }
    return layout;
  }

  function slotAt(sx: number, sy: number): SlotLayout {
    const [cx, cy] = chunkOfSlot(sx, sy);
    const lx = sx - cx * CHUNK_SLOTS;
    const ly = sy - cy * CHUNK_SLOTS;
    return layoutOf(cx, cy).slots[lx + ly * CHUNK_SLOTS]!;
  }

  function roomIdOfSlot(sx: number, sy: number): string | undefined {
    const override = overrides.get(pack(sx, sy));
    if (override) return override.type === 'key' ? `key:${override.characterId}` : 'dining-room';
    const slot = slotAt(sx, sy);
    if (slot.kind === 'void') return undefined;
    const wingId = WING_ROOM_IDS[slot.kind];
    if (wingId) return wingId;
    const [cx, cy] = chunkOfSlot(sx, sy);
    return `r:${sx},${sy}:${epochOf(cx, cy)}`;
  }

  /** Every slot of the room that holds this slot (more than one only in the entrance wing). */
  function roomSlots(sx: number, sy: number): [number, number][] {
    const result: [number, number][] = [[sx, sy]];
    for (let i = 0; i < result.length; i++) {
      const [x, y] = result[i]!;
      for (const dir of slotAt(x, y).open) {
        const [dx, dy] = DIR_STEP[dir];
        if (!result.some(([rx, ry]) => rx === x + dx && ry === y + dy)) result.push([x + dx, y + dy]);
      }
    }
    return result;
  }

  /** Doors crossed from the start slot to every slot within maxDepth doors. */
  function slotDistances(start: [number, number], maxDepth: number): Map<number, number> {
    const startKey = pack(...start);
    const dist = new Map<number, number>([[startKey, 0]]);
    const buckets: number[][] = [[startKey]];
    for (let d = 0; d <= maxDepth; d++) {
      const bucket = buckets[d] ?? [];
      for (let i = 0; i < bucket.length; i++) {
        const key = bucket[i]!;
        if (dist.get(key)! < d) continue;
        const [sx, sy] = unpack(key);
        const slot = slotAt(sx, sy);
        const visit = (dir: Dir, cost: number) => {
          const [dx, dy] = DIR_STEP[dir];
          const next = pack(sx + dx, sy + dy);
          const nd = d + cost;
          if (nd > maxDepth || (dist.get(next) ?? Infinity) <= nd) return;
          dist.set(next, nd);
          (buckets[nd] ??= []).push(next);
        };
        for (const dir of slot.open) visit(dir, 0);
        for (const dir of slot.doors) visit(dir, 1);
      }
    }
    return dist;
  }

  function markDirty(cx: number, cy: number) {
    dirty.add(chunkId(cx, cy));
  }

  function keyRoomFrom(room: Room, characterId: CharacterId): Room {
    const character = caseFile.characters.find((c) => c.id === characterId)!;
    return {
      ...room,
      id: `key:${characterId}`,
      kind: 'key',
      style: character.roomKind,
      characterId,
      size: STYLE_SIZE[character.roomKind] ?? 'medium',
    };
  }

  function materialize(cx: number, cy: number): Built {
    const id = chunkId(cx, cy);
    const epoch = epochOf(cx, cy);
    const cached = built.get(id);
    if (cached && cached.epoch === epoch && !dirty.has(id)) return cached;
    dirty.delete(id);

    const layout = layoutOf(cx, cy);
    const base = buildChunk(seed, layout);
    const rooms = base.rooms.map((room) => {
      if (room.kind === 'portraitHall') {
        // The patriarch's portrait hangs at the end of the hall; the others along the wall.
        const order = [...caseFile.characters].sort((a, b) => Number(b.role === 'patriarch') - Number(a.role === 'patriarch'));
        const frames = room.anchors.filter((a) => a.kind === 'portrait');
        const others = room.anchors.filter((a) => a.kind !== 'portrait');
        return { ...room, anchors: [...others, ...order.map((c, i) => ({ ...frames[i]!, characterId: c.id }))] };
      }
      if (!room.id.startsWith('r:')) return room;
      // Generated ids are "r:sx,sy:epoch".
      const [sx, sy] = parseCell(room.id.slice(2).split(':')[0]!);
      const override = overrides.get(pack(sx, sy));
      if (!override) return room;
      if (override.type === 'key') return keyRoomFrom(room, override.characterId);
      const slot = slotAt(sx, sy);
      const centre = cellId(sx * SLOT_CELLS + 2, sy * SLOT_CELLS + 2);
      return {
        ...room,
        id: 'dining-room',
        kind: 'diningRoom' as const,
        size: 'large' as const,
        cells: slotCells(slot, false),
        anchors: [
          { kind: 'ofrenda' as const, cell: centre },
          { kind: 'chandelier' as const, cell: centre },
        ],
      };
    });
    const doors = base.doors.map((door) => {
      const state = doorStates.get(door.id) ?? door.state;
      const owner = keyRooms.find((k) => k.doorId === door.id && k.locked);
      return owner && state === 'locked' ? { ...door, state, keyId: owner.keyId } : { ...door, state };
    });
    const chunk: Chunk = { ...base, rooms, doors };
    const roomByCell = new Map<CellId, Room>();
    for (const room of rooms) for (const cell of room.cells) roomByCell.set(cell, room);
    const doorByCells = new Map<string, Door>();
    for (const door of doors) {
      doorByCells.set(`${door.a}|${door.b}`, door);
      doorByCells.set(`${door.b}|${door.a}`, door);
    }
    const result = { epoch, chunk, roomByCell, doorByCells };
    built.set(id, result);
    if (loaded.has(id)) loaded.set(id, chunk);
    return result;
  }

  function setDoorState(doorId: DoorId, state: DoorState) {
    doorStates.set(doorId, state);
    const [cx, cy] = doorOwnerChunk(doorId);
    const door = built.get(chunkId(cx, cy))?.chunk.doors.find((d) => d.id === doorId);
    if (door) {
      door.state = state;
      if (state !== 'locked') delete door.keyId;
    }
  }

  function roomAt(cell: CellId): Room | undefined {
    const [cx, cy] = chunkOfCell(cell);
    if (isOutside(cy)) return undefined;
    return materialize(cx, cy).roomByCell.get(cell);
  }

  /** Slots that must not change: the given cells, pinned cells, the player's room and the rooms next to it. */
  function protectedSlots(visible: ReadonlySet<CellId>, playerCell: CellId): Set<number> {
    const result = new Set<number>();
    for (const cell of [...visible, ...pinned]) result.add(pack(...slotOfCell(...parseCell(cell))));
    for (const [sx, sy] of roomSlots(...slotOfCell(...parseCell(playerCell)))) {
      result.add(pack(sx, sy));
      for (const dir of slotAt(sx, sy).doors) {
        const [dx, dy] = DIR_STEP[dir];
        for (const [nx, ny] of roomSlots(sx + dx, sy + dy)) result.add(pack(nx, ny));
      }
    }
    return result;
  }

  function isKeyCandidate(key: number, guarded: ReadonlySet<number>): boolean {
    if (overrides.has(key) || guarded.has(key)) return false;
    const [sx, sy] = unpack(key);
    const [cx, cy] = chunkOfSlot(sx, sy);
    if (isWing(cx, cy) || isOutside(cy)) return false;
    const slot = slotAt(sx, sy);
    // A dead end, so the room's one door is the only lock between it and the house.
    return (
      slot.kind !== 'void' &&
      slot.kind !== 'corridor' &&
      slot.doors.length === 1 &&
      slot.open.length === 0 &&
      edgeKey(sx, sy, slot.doors[0]!) !== ACT1_EXIT_EDGE
    );
  }

  function assign(keyRoom: KeyRoom, sx: number, sy: number) {
    overrides.set(pack(sx, sy), { type: 'key', characterId: keyRoom.characterId });
    const doorId = doorIdOf(edgeKey(sx, sy, slotAt(sx, sy).doors[0]!));
    keyRoom.slot = [sx, sy];
    keyRoom.doorId = doorId;
    keyRoom.roomId = `key:${keyRoom.characterId}`;
    if (keyRoom.locked) doorStates.set(doorId, 'locked');
    markDirty(...chunkOfSlot(sx, sy));
    markDirty(...doorOwnerChunk(doorId));
  }

  function unassign(keyRoom: KeyRoom) {
    if (!keyRoom.slot) return;
    overrides.delete(pack(...keyRoom.slot));
    markDirty(...chunkOfSlot(...keyRoom.slot));
    if (keyRoom.doorId) {
      if (doorStates.get(keyRoom.doorId) === 'locked') doorStates.delete(keyRoom.doorId);
      markDirty(...doorOwnerChunk(keyRoom.doorId));
    }
    keyRoom.slot = undefined;
    keyRoom.doorId = undefined;
    keyRoom.roomId = undefined;
  }

  /** Puts key rooms on dead ends KEY_ROOM_MIN_DISTANCE to KEY_ROOM_REACH doors from the start slot. */
  function place(
    toPlace: readonly KeyRoom[],
    start: [number, number],
    guarded: ReadonlySet<number>,
    rng: Rng,
    dist = slotDistances(start, KEY_ROOM_REACH),
  ) {
    if (toPlace.length === 0) return;
    const candidates = [...dist]
      .filter(([key, d]) => d >= KEY_ROOM_MIN_DISTANCE && isKeyCandidate(key, guarded))
      .map(([key]) => key);
    for (const keyRoom of toPlace) {
      let key: number | undefined;
      if (candidates.length > 0) {
        key = candidates.splice(rng.int(0, candidates.length - 1), 1)[0];
      } else {
        // Nothing within reach: take the nearest dead end beyond it rather than lose the room.
        const far = [...slotDistances(start, KEY_ROOM_REACH * 3)].filter(([k]) => isKeyCandidate(k, guarded));
        far.sort((p, q) => p[1] - q[1]);
        key = far[0]?.[0];
      }
      if (key === undefined) throw new Error(`no room left for ${keyRoom.characterId}`);
      assign(keyRoom, ...unpack(key));
    }
  }

  function refreshLoaded(): ChunkDiff {
    const diff: ChunkDiff = { loaded: [], unloaded: [] };
    for (const [id, chunk] of loaded) {
      const [cx, cy] = [chunk.cx, chunk.cy];
      if (chunk.epoch === epochOf(cx, cy) && !dirty.has(id)) continue;
      diff.unloaded.push(id);
      diff.loaded.push(materialize(cx, cy).chunk);
    }
    return diff;
  }

  function findDoor(doorId: DoorId): Door | undefined {
    const [cx, cy] = doorOwnerChunk(doorId);
    return materialize(cx, cy).chunk.doors.find((d) => d.id === doorId);
  }

  function doorBetween(a: CellId, b: CellId): Door | undefined {
    for (const cell of [a, b]) {
      const [cx, cy] = chunkOfCell(cell);
      if (isOutside(cy)) continue;
      const door = materialize(cx, cy).doorByCells.get(`${a}|${b}`);
      if (door) return door;
    }
    return undefined;
  }

  function distancesFrom(cell: CellId, maxDepth: number): Map<string, number> {
    const result = new Map<string, number>();
    for (const [key, d] of slotDistances(slotOfCell(...parseCell(cell)), maxDepth)) {
      const id = roomIdOfSlot(...unpack(key));
      if (id !== undefined && (result.get(id) ?? Infinity) > d) result.set(id, d);
    }
    return result;
  }

  place(keyRooms, slotOfCell(...parseCell(START_CELL)), new Set(), root.fork('place:start'));

  return {
    seed,
    startCell: START_CELL,

    update(playerCell) {
      const [pcx, pcy] = chunkOfCell(playerCell);
      const diff: ChunkDiff = { loaded: [], unloaded: [] };
      for (let dy = -LOAD_RADIUS; dy <= LOAD_RADIUS; dy++) {
        for (let dx = -LOAD_RADIUS; dx <= LOAD_RADIUS; dx++) {
          const [cx, cy] = [pcx + dx, pcy + dy];
          const id = chunkId(cx, cy);
          if (isOutside(cy) || loaded.has(id)) continue;
          const { chunk } = materialize(cx, cy);
          loaded.set(id, chunk);
          diff.loaded.push(chunk);
        }
      }
      for (const [id, chunk] of loaded) {
        if (chebyshev(chunk.cx, chunk.cy, pcx, pcy) > UNLOAD_RADIUS) {
          loaded.delete(id);
          diff.unloaded.push(id);
        }
      }
      const room = roomAt(playerCell);
      if (room?.kind === 'key' && room.characterId) byCharacter.get(room.characterId)!.visited = true;
      return diff;
    },

    reshuffle(visible, playerCell) {
      const rng = root.fork(`reshuffle:${reshuffles++}`);
      const guarded = protectedSlots(visible, playerCell);
      const frozen = new Set<number>([pack(0, 0)]);
      for (const key of guarded) frozen.add(pack(...chunkOfSlot(...unpack(key))));
      if (diningSlot) frozen.add(pack(...chunkOfSlot(...diningSlot)));

      // Rebuild every nearby chunk that holds nothing protected.
      const [pcx, pcy] = chunkOfCell(playerCell);
      const bumped = new Set<number>();
      for (let dy = -RESHUFFLE_RADIUS; dy <= RESHUFFLE_RADIUS; dy++) {
        for (let dx = -RESHUFFLE_RADIUS; dx <= RESHUFFLE_RADIUS; dx++) {
          const [cx, cy] = [pcx + dx, pcy + dy];
          const key = pack(cx, cy);
          if (isOutside(cy) || frozen.has(key)) continue;
          epochs.set(key, epochOf(cx, cy) + 1);
          bumped.add(key);
        }
      }

      // Key rooms in rebuilt chunks, or now out of reach, move to new dead ends.
      const start = slotOfCell(...parseCell(playerCell));
      const dist = slotDistances(start, KEY_ROOM_REACH);
      const toPlace: KeyRoom[] = [];
      for (const keyRoom of keyRooms) {
        if (!keyRoom.slot) {
          if (!keyRoom.visited) toPlace.push(keyRoom);
          continue;
        }
        const key = pack(...keyRoom.slot);
        const inRebuilt = bumped.has(pack(...chunkOfSlot(...keyRoom.slot)));
        const outOfReach = !keyRoom.visited && !guarded.has(key) && !dist.has(key);
        if (inRebuilt || outOfReach) {
          unassign(keyRoom);
          if (!keyRoom.visited) toPlace.push(keyRoom);
        }
      }
      place(toPlace, start, guarded, rng, dist);
      return refreshLoaded();
    },

    unlock(doorId) {
      const keyRoom = keyRooms.find((k) => k.doorId === doorId);
      if (keyRoom) keyRoom.locked = false;
      if (findDoor(doorId)?.state === 'locked') setDoorState(doorId, 'closed');
    },

    setDoorOpen(doorId, open) {
      const state = findDoor(doorId)?.state;
      if (state !== 'open' && state !== 'closed') return false;
      setDoorState(doorId, open ? 'open' : 'closed');
      return true;
    },

    pinCells(cells) {
      for (const cell of cells) pinned.add(cell);
    },

    shiftCorridorBehind() {
      removedEdges.add(ACT1_BACK_EDGE);
      layouts.delete(pack(0, 0));
      markDirty(0, 0);
      return refreshLoaded();
    },

    endAct1() {
      setDoorState(doorIdOf(ACT1_EXIT_EDGE), 'closed');
    },

    revealDiningRoom(visible, playerCell, facing) {
      if (diningSlot) return { loaded: [], unloaded: [] };
      const guarded = protectedSlots(visible, playerCell);
      const [px, py] = parseCell(playerCell);
      const [fx, fy] = DIR_STEP[facing];
      const dist = slotDistances(slotOfCell(px, py), DINING_MAX_DISTANCE);
      const candidates = [...dist]
        .filter(([key, d]) => {
          if (d < DINING_MIN_DISTANCE || overrides.has(key) || guarded.has(key)) return false;
          const [sx, sy] = unpack(key);
          const [cx, cy] = chunkOfSlot(sx, sy);
          return !isWing(cx, cy) && slotAt(sx, sy).kind !== 'void';
        })
        .map(([key, d]) => {
          const [sx, sy] = unpack(key);
          const ahead = (sx * SLOT_CELLS + 2 - px) * fx + (sy * SLOT_CELLS + 2 - py) * fy > 0;
          // "At the end of a corridor": reached from a corridor one door nearer.
          const fromCorridor = slotAt(sx, sy).doors.some((dir) => {
            const [dx, dy] = DIR_STEP[dir];
            return dist.get(pack(sx + dx, sy + dy)) === d - 1 && slotAt(sx + dx, sy + dy).kind === 'corridor';
          });
          return { sx, sy, rank: [ahead ? 0 : 1, d, fromCorridor ? 0 : 1] };
        });
      candidates.sort((p, q) => p.rank[0]! - q.rank[0]! || p.rank[1]! - q.rank[1]! || p.rank[2]! - q.rank[2]!);
      const best = candidates[0];
      if (!best) return { loaded: [], unloaded: [] };

      // A key room can't share the slot, and the dining room's chunk never reshuffles again.
      overrides.set(pack(best.sx, best.sy), { type: 'dining' });
      diningSlot = [best.sx, best.sy];
      markDirty(...chunkOfSlot(best.sx, best.sy));
      return refreshLoaded();
    },

    unsealFrontDoor() {
      setDoorState(FRONT_DOOR_ID, 'closed');
    },

    sealFrontDoor() {
      setDoorState(FRONT_DOOR_ID, 'sealed');
    },

    markVisited(characterId) {
      const keyRoom = byCharacter.get(characterId);
      if (keyRoom) keyRoom.visited = true;
    },

    pathBetween(a, b, blocked) {
      if (a === b) return [a];
      if (!roomAt(a) || !roomAt(b)) return null;
      const [bx, by] = parseCell(b);
      const heuristic = (cell: CellId) => {
        const [x, y] = parseCell(cell);
        return Math.abs(x - bx) + Math.abs(y - by);
      };
      const came = new Map<CellId, CellId>();
      const cost = new Map<CellId, number>([[a, 0]]);
      // A small binary heap of [priority, cell].
      const heap: [number, CellId][] = [[heuristic(a), a]];
      const push = (item: [number, CellId]) => {
        heap.push(item);
        for (let i = heap.length - 1; i > 0; ) {
          const parent = (i - 1) >> 1;
          if (heap[parent]![0] <= heap[i]![0]) break;
          [heap[parent], heap[i]] = [heap[i]!, heap[parent]!];
          i = parent;
        }
      };
      const pop = (): [number, CellId] => {
        const top = heap[0]!;
        const lastItem = heap.pop()!;
        if (heap.length > 0) {
          heap[0] = lastItem;
          for (let i = 0; ; ) {
            const l = 2 * i + 1;
            const r = l + 1;
            let m = i;
            if (l < heap.length && heap[l]![0] < heap[m]![0]) m = l;
            if (r < heap.length && heap[r]![0] < heap[m]![0]) m = r;
            if (m === i) break;
            [heap[m], heap[i]] = [heap[i]!, heap[m]!];
            i = m;
          }
        }
        return top;
      };

      let expansions = 0;
      while (heap.length > 0 && expansions++ < MAX_PATH_EXPANSIONS) {
        const [, cell] = pop();
        if (cell === b) {
          const path = [b];
          while (path[0] !== a) path.unshift(came.get(path[0]!)!);
          return path;
        }
        const here = roomAt(cell)!;
        const [x, y] = parseCell(cell);
        for (const dir of DIRS) {
          const [dx, dy] = DIR_STEP[dir];
          const next = cellId(x + dx, y + dy);
          const there = roomAt(next);
          if (!there || blocked?.(next)) continue;
          if (there.id !== here.id) {
            const door = doorBetween(cell, next);
            if (!door || door.state === 'locked' || door.state === 'sealed') continue;
          }
          const nextCost = cost.get(cell)! + 1;
          if (nextCost < (cost.get(next) ?? Infinity)) {
            cost.set(next, nextCost);
            came.set(next, cell);
            push([nextCost + heuristic(next), next]);
          }
        }
      }
      return null;
    },

    roomAt,

    getRoom(roomId) {
      let slot: [number, number] | undefined;
      if (roomId.startsWith('key:')) slot = byCharacter.get(roomId.slice(4) as CharacterId)?.slot;
      else if (roomId === 'dining-room') slot = diningSlot;
      else if (roomId.startsWith('r:')) {
        const [coords, epoch] = roomId.slice(2).split(':') as [string, string];
        const [sx, sy] = parseCell(coords);
        if (epochOf(...chunkOfSlot(sx, sy)) === Number(epoch) && !overrides.has(pack(sx, sy))) slot = [sx, sy];
      } else if (Object.values(WING_ROOM_IDS).includes(roomId)) {
        return materialize(0, 0).chunk.rooms.find((r) => r.id === roomId);
      }
      if (!slot) return undefined;
      return materialize(...chunkOfSlot(...slot)).chunk.rooms.find((r) => r.id === roomId);
    },

    getDoor: findDoor,
    doorBetween,

    loadedChunks() {
      return [...loaded.values()];
    },

    chunkAt(cx, cy) {
      return materialize(cx, cy).chunk;
    },

    keyRooms() {
      return keyRooms.map((k) => ({
        characterId: k.characterId,
        style: k.style,
        keyId: k.keyId,
        locked: k.locked,
        keyHolderId: k.keyHolderId,
        visited: k.visited,
        roomId: k.roomId,
        doorId: k.doorId,
      }));
    },

    diningRoom() {
      return diningSlot ? materialize(...chunkOfSlot(...diningSlot)).chunk.rooms.find((r) => r.id === 'dining-room') : undefined;
    },

    distancesFrom,
  };
}
