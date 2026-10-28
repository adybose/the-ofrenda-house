import { Group, InstancedMesh, Matrix4, Mesh, type BufferGeometry } from 'three';
import type { RoomKind as KeyRoomStyle } from '../case/types';
import { createRng } from '../core/rng';
import { furnishRoom } from '../world/furniture';
import { DIRS, DIR_STEP, FRONT_DOOR_ID, SLOT_CELLS, cellId, edgeCells, parseCell, slotOfCell } from '../world/grid';
import type { CellId, Chunk, Dir, DoorId, RoomKind } from '../world/types';
import {
  CELL_SIZE,
  DOOR_HEIGHT,
  DOOR_WIDTH,
  ROOM_HEIGHT,
  WALL_INSET,
  WINDOW_SILL,
  WINDOW_TOP,
  WINDOW_WIDTH,
  cellCentre,
} from '../world/units';
import type { TextureCache, UvRect } from './atlas';
import { GeometryBuilder, at, frameBox, shadeTint, type Frame, type Tint } from './builder';
import {
  addChandelier,
  addClock,
  addDoorPanel,
  addFireplace,
  addFurniture,
  addMirror,
  addOfrenda,
  addPortraitFrame,
  addPortraitPicture,
} from './props';
import type { TextureKind } from './textures';

const C = CELL_SIZE;

interface Surfaces {
  walls: readonly TextureKind[];
  floor: TextureKind;
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

/** What a chunk group remembers about its instanced doors and chandeliers. */
export interface ChunkMeshData {
  doors: Map<DoorId, { index: number; x: number; z: number; yaw: number; swing: number }>;
  chandeliers: Map<CellId, number>;
}

/** The wall face on `side` of a cell: origin at its left end, `out` into the room. */
function sideFrame(cell: CellId, side: Dir): Frame {
  const [x, y] = parseCell(cell);
  const x0 = x * C;
  const x1 = x0 + C;
  const zNorth = -(y + 1) * C;
  const zSouth = -y * C;
  switch (side) {
    case 'N':
      return { x: x0, z: zNorth + WALL_INSET, right: [1, 0], out: [0, 1] };
    case 'S':
      return { x: x1, z: zSouth - WALL_INSET, right: [-1, 0], out: [0, -1] };
    case 'E':
      return { x: x1 - WALL_INSET, z: zNorth, right: [0, 1], out: [-1, 0] };
    case 'W':
      return { x: x0 + WALL_INSET, z: zSouth, right: [0, -1], out: [1, 0] };
  }
}

/** The same face, with along = 0 at the middle of the cell side. */
function centredFrame(cell: CellId, side: Dir): Frame {
  const f = sideFrame(cell, side);
  return { ...f, x: f.x + f.right[0] * (C / 2), z: f.z + f.right[1] * (C / 2) };
}

/** The grid step that `along` follows on each wall face. */
const RIGHT_STEP: Record<Dir, readonly [number, number]> = { N: [1, 0], S: [-1, 0], E: [0, -1], W: [0, 1] };

/**
 * How far a wall face reaches past each end of its cell. Faces sit WALL_INSET inside the
 * room, so where the wall turns outward (a convex corner) both faces must reach the inset
 * corner or a gap opens between them.
 */
function cornerReach(inRoom: ReadonlySet<CellId>, cell: CellId, side: Dir): [number, number] {
  const [x, y] = parseCell(cell);
  const [sx, sy] = DIR_STEP[side];
  const [rx, ry] = RIGHT_STEP[side];
  const reach = (step: number) => {
    const nx = x + rx * step;
    const ny = y + ry * step;
    return inRoom.has(cellId(nx, ny)) && inRoom.has(cellId(nx + sx, ny + sy)) ? WALL_INSET : 0;
  };
  return [reach(-1), reach(1)];
}

function doorCells(id: DoorId): readonly [CellId, CellId] {
  return id === FRONT_DOOR_ID ? ['7,0', '7,-1'] : edgeCells(id.slice(2));
}

function sideTowards(from: CellId, to: CellId): Dir {
  const [x0, y0] = parseCell(from);
  const [x1, y1] = parseCell(to);
  return DIRS.find((d) => DIR_STEP[d][0] === x1 - x0 && DIR_STEP[d][1] === y1 - y0)!;
}

/** Darker near the floor and ceiling, as if the corners held old dust and shadow. */
function wallShade(tint: Tint, y: number, height: number): Tint {
  return shadeTint(tint, 0.62 + 0.38 * Math.sin((Math.min(Math.max(y / height, 0), 1) * 0.9 + 0.05) * Math.PI));
}

function wallPiece(b: GeometryBuilder, f: Frame, rect: UvRect, height: number, tint: Tint, a0: number, a1: number, y0: number, y1: number): void {
  if (a1 - a0 <= 0.001 || y1 - y0 <= 0.001) return;
  const u = (a: number) => rect.u0 + ((rect.u1 - rect.u0) * Math.min(Math.max(a, 0), C)) / C;
  const v = (y: number) => rect.vBottom + ((rect.vTop - rect.vBottom) * y) / height;
  b.quad(
    at(f, a0, y0, 0),
    at(f, a1, y0, 0),
    at(f, a1, y1, 0),
    at(f, a0, y1, 0),
    [
      [u(a0), v(y0)],
      [u(a1), v(y0)],
      [u(a1), v(y1)],
      [u(a0), v(y1)],
    ],
    [wallShade(tint, y0, height), wallShade(tint, y0, height), wallShade(tint, y1, height), wallShade(tint, y1, height)],
  );
}

function sharedShapes(textures: TextureCache): { door: BufferGeometry; chandelier: BufferGeometry } {
  let shapes = SHARED.get(textures);
  if (!shapes) {
    const door = new GeometryBuilder();
    addDoorPanel(door, textures, DOOR_WIDTH, DOOR_HEIGHT);
    const chandelier = new GeometryBuilder();
    addChandelier(chandelier, textures);
    shapes = { door: door.build(), chandelier: chandelier.build() };
    SHARED.set(textures, shapes);
  }
  return shapes;
}

const SHARED = new WeakMap<TextureCache, { door: BufferGeometry; chandelier: BufferGeometry }>();
const MAX_OPEN = Math.PI * 0.47;

function doorMatrix(door: ChunkMeshData['doors'] extends Map<DoorId, infer D> ? D : never, amount: number): Matrix4 {
  const yaw = door.yaw + door.swing * MAX_OPEN * Math.min(Math.max(amount, 0), 1);
  return new Matrix4().makeRotationY(yaw).setPosition(door.x, 0, door.z);
}

/** Builds the meshes for one chunk: one merged static mesh, portraits, and instanced doors and chandeliers. */
export function buildChunkMesh(chunk: Chunk, textures: TextureCache): Group {
  const group = new Group();
  group.name = `chunk:${chunk.id}`;
  const data: ChunkMeshData = { doors: new Map(), chandeliers: new Map() };
  group.userData = data;

  const b = new GeometryBuilder();
  const portraits = new GeometryBuilder();
  const chandelierAt: [number, number, number][] = [];

  for (const room of chunk.rooms) {
    const rng = createRng(textures.seed).fork('surfaces').fork(room.id);
    const surfaces = room.kind === 'key' && room.style ? BY_STYLE[room.style] : BY_KIND[room.kind as Exclude<RoomKind, 'key'>];
    const wallRect = textures.uv(rng.pick(surfaces.walls));
    const floorRect = textures.uv(surfaces.floor);
    const tint: Tint = [0.9 + rng.float() * 0.1, 0.88 + rng.float() * 0.1, 0.86 + rng.float() * 0.1];
    const height = ROOM_HEIGHT[room.size];
    const inRoom = new Set(room.cells);

    const openings = new Map<string, 'door' | 'window'>();
    for (const id of room.doors) {
      const [a, bCell] = doorCells(id);
      if (inRoom.has(a)) openings.set(`${a}|${sideTowards(a, bCell)}`, 'door');
      if (inRoom.has(bCell)) openings.set(`${bCell}|${sideTowards(bCell, a)}`, 'door');
    }
    for (const w of room.windows) openings.set(`${w.cell}|${w.side}`, 'window');

    for (const cell of room.cells) {
      const [x, y] = parseCell(cell);
      const x0 = x * C;
      const x1 = x0 + C;
      const zn = -(y + 1) * C;
      const zs = -y * C;
      b.tile([x0, 0, zs], [x1, 0, zs], [x1, 0, zn], [x0, 0, zn], floorRect, shadeTint(tint, 0.85));
      b.tile([x0, height, zn], [x1, height, zn], [x1, height, zs], [x0, height, zs], textures.uv('ceiling'), shadeTint(tint, 0.55));

      for (const side of DIRS) {
        const [dx, dy] = DIR_STEP[side];
        if (inRoom.has(cellId(x + dx, y + dy))) continue;
        const f = sideFrame(cell, side);
        const opening = openings.get(`${cell}|${side}`);
        const [reachLeft, reachRight] = cornerReach(inRoom, cell, side);
        const start = -reachLeft;
        const end = C + reachRight;
        if (opening === 'door') {
          const left = (C - DOOR_WIDTH) / 2;
          const right = (C + DOOR_WIDTH) / 2;
          wallPiece(b, f, wallRect, height, tint, start, left, 0, height);
          wallPiece(b, f, wallRect, height, tint, right, end, 0, height);
          wallPiece(b, f, wallRect, height, tint, left, right, DOOR_HEIGHT, height);
        } else if (opening === 'window') {
          const left = (C - WINDOW_WIDTH) / 2;
          const right = (C + WINDOW_WIDTH) / 2;
          const top = Math.min(WINDOW_TOP, height - 0.2);
          wallPiece(b, f, wallRect, height, tint, start, left, 0, height);
          wallPiece(b, f, wallRect, height, tint, right, end, 0, height);
          wallPiece(b, f, wallRect, height, tint, left, right, 0, WINDOW_SILL);
          wallPiece(b, f, wallRect, height, tint, left, right, top, height);
          // Night glass set back in the wall, a wooden frame and mullions.
          b.tile(at(f, left, WINDOW_SILL, -WALL_INSET + 0.02), at(f, right, WINDOW_SILL, -WALL_INSET + 0.02), at(f, right, top, -WALL_INSET + 0.02), at(f, left, top, -WALL_INSET + 0.02), textures.uv('window'));
          const wood = textures.uv('wood');
          const reveal: [number, number] = [-WALL_INSET, 0.03];
          frameBox(b, f, [left - 0.06, right + 0.06], [WINDOW_SILL - 0.06, WINDOW_SILL], [-WALL_INSET, 0.1], wood);
          frameBox(b, f, [left - 0.06, right + 0.06], [top, top + 0.06], reveal, wood);
          frameBox(b, f, [left - 0.06, left], [WINDOW_SILL, top], reveal, wood);
          frameBox(b, f, [right, right + 0.06], [WINDOW_SILL, top], reveal, wood);
          frameBox(b, f, [C / 2 - 0.02, C / 2 + 0.02], [WINDOW_SILL, top], [-WALL_INSET + 0.02, 0], wood);
          const bar = WINDOW_SILL + (top - WINDOW_SILL) * 0.62;
          frameBox(b, f, [left, right], [bar - 0.02, bar + 0.02], [-WALL_INSET + 0.02, 0], wood);
        } else {
          wallPiece(b, f, wallRect, height, tint, start, end, 0, height);
        }
        // Skirting board along every wall.
        if (opening !== 'door') frameBox(b, f, [start, end], [0, 0.14], [0, 0.03], textures.uv('wood'), shadeTint(tint, 0.6));
      }
    }

    if (surfaces.rug) {
      const [sx, sy] = slotOfCell(...parseCell(room.cells[0]!));
      const cx = (sx * SLOT_CELLS + 2.5) * C;
      const cz = -(sy * SLOT_CELLS + 2.5) * C;
      const r = C * 1.4;
      b.tile([cx - r, 0.006, cz + r], [cx + r, 0.006, cz + r], [cx + r, 0.006, cz - r], [cx - r, 0.006, cz - r], textures.uv('carpet'), shadeTint(tint, 0.8));
    }

    for (const anchor of room.anchors) {
      if (anchor.kind === 'chandelier') {
        const [ax, az] = cellCentre(anchor.cell);
        data.chandeliers.set(anchor.cell, chandelierAt.length);
        chandelierAt.push([ax, height, az]);
      } else if (anchor.kind === 'ofrenda') {
        const [ax, az] = cellCentre(anchor.cell);
        addOfrenda(b, textures, { x: ax, z: az, right: [1, 0], out: [0, 1] });
      } else if (anchor.side) {
        const f = centredFrame(anchor.cell, anchor.side);
        if (anchor.kind === 'fireplace') addFireplace(b, textures, f);
        if (anchor.kind === 'mirror') addMirror(b, textures, f);
        if (anchor.kind === 'clock') addClock(b, textures, f);
        if (anchor.kind === 'portrait' && anchor.characterId) {
          addPortraitFrame(b, textures, f, 1.8);
          addPortraitPicture(portraits, textures.portraitUv(anchor.characterId), f, 1.8);
        }
      }
    }

    // A spirit's room shows its portrait on the first plain wall at the middle of the room.
    if (room.kind === 'key' && room.characterId) {
      const [sx, sy] = slotOfCell(...parseCell(room.cells[0]!));
      for (const side of DIRS) {
        const [dx, dy] = DIR_STEP[side];
        const cell = cellId(sx * SLOT_CELLS + 2 + dx * 2, sy * SLOT_CELLS + 2 + dy * 2);
        if (openings.has(`${cell}|${side}`) || room.anchors.some((a) => a.cell === cell && a.side === side)) continue;
        const f = centredFrame(cell, side);
        addPortraitFrame(b, textures, f, 1.7);
        addPortraitPicture(portraits, textures.portraitUv(room.characterId), f, 1.7);
        break;
      }
    }

    for (const item of furnishRoom(room, textures.seed)) addFurniture(b, textures, item);
  }

  // Door frames for the doors this chunk owns, built from side a so each is drawn once.
  for (const door of chunk.doors) {
    const [a, bCell] = doorCells(door.id);
    const side = sideTowards(a, bCell);
    const f = sideFrame(a, side);
    const left = (C - DOOR_WIDTH) / 2;
    const right = (C + DOOR_WIDTH) / 2;
    const depth: [number, number] = [-2 * WALL_INSET - 0.02, 0.03];
    const wood = textures.uv('wood');
    frameBox(b, f, [left - 0.08, left], [0, DOOR_HEIGHT + 0.08], depth, wood);
    frameBox(b, f, [right, right + 0.08], [0, DOOR_HEIGHT + 0.08], depth, wood);
    frameBox(b, f, [left - 0.08, right + 0.08], [DOOR_HEIGHT, DOOR_HEIGHT + 0.08], depth, wood);

    // The panel's hinge is on the left jamb, in the middle of the wall.
    const hinge = at(f, left, 0, -WALL_INSET);
    const yaw = Math.atan2(-f.right[1], f.right[0]);
    // Swing so the door opens into side a's room.
    const swing = -Math.sin(yaw) * f.out[0] - Math.cos(yaw) * f.out[1] > 0 ? 1 : -1;
    data.doors.set(door.id, { index: data.doors.size, x: hinge[0], z: hinge[2], yaw, swing });
  }

  const staticMesh = new Mesh(b.build(), textures.material);
  staticMesh.name = 'static';
  group.add(staticMesh);

  if (portraits.vertexCount > 0) {
    const portraitMesh = new Mesh(portraits.build(), textures.portraitMaterial);
    portraitMesh.name = 'portraits';
    group.add(portraitMesh);
  }

  const shapes = sharedShapes(textures);
  if (chunk.doors.length > 0) {
    const doors = new InstancedMesh(shapes.door, textures.material, chunk.doors.length);
    doors.name = 'doors';
    for (const door of chunk.doors) {
      const info = data.doors.get(door.id)!;
      doors.setMatrixAt(info.index, doorMatrix(info, door.state === 'open' ? 1 : 0));
    }
    doors.computeBoundingSphere();
    group.add(doors);
  }
  if (chandelierAt.length > 0) {
    const chandeliers = new InstancedMesh(shapes.chandelier, textures.material, chandelierAt.length);
    chandeliers.name = 'chandeliers';
    chandelierAt.forEach(([x, y, z], i) => chandeliers.setMatrixAt(i, new Matrix4().setPosition(x, y, z)));
    chandeliers.computeBoundingSphere();
    group.add(chandeliers);
  }
  return group;
}

/** Swings a door: 0 closed, 1 fully open. Used by spec 05. */
export function setDoorOpen(group: Group, doorId: DoorId, amount: number): void {
  const info = (group.userData as ChunkMeshData).doors.get(doorId);
  const doors = group.getObjectByName('doors') as InstancedMesh | undefined;
  if (!info || !doors) return;
  doors.setMatrixAt(info.index, doorMatrix(info, amount));
  doors.instanceMatrix.needsUpdate = true;
}

/** Frees the chunk's own geometry. Textures, materials and the shared door and chandelier shapes stay. */
export function disposeChunkMesh(group: Group): void {
  group.traverse((object) => {
    if (object instanceof InstancedMesh) object.dispose();
    else if (object instanceof Mesh) object.geometry.dispose();
  });
  group.removeFromParent();
}

