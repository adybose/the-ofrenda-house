import { Color, DirectionalLight, Group, HemisphereLight, Mesh, MeshBasicMaterial, type Scene, type Vector3 } from 'three';
import { createRng, type Rng } from '../core/rng';
import type { Block, ExteriorLayout } from '../world/exterior';
import { DOOR_HEIGHT, DOOR_WIDTH } from '../world/units';
import type { TextureCache, UvRect } from './atlas';
import { GeometryBuilder, beam, orientedBox, shadeTint, type Tint, type Vec3 } from './builder';
import { createRain } from './rain';
import { createSky } from './sky';

/** How far the exterior skin stands proud of the interior walls on the façade line. */
const SKIN = 0.15;
const WALL_TILE: readonly [number, number] = [1.5, 3];
const GROUND_TILE = 1.5;

const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const scale = (v: Vec3, s: number): Vec3 => [v[0] * s, v[1] * s, v[2] * s];

/**
 * A flat surface from `origin`, `width` along unit `u` and `height` along unit `v`, tiled with an
 * atlas tile every `tile` metres (atlas tiles don't wrap). It faces u × v.
 */
function tiled(b: GeometryBuilder, origin: Vec3, u: Vec3, v: Vec3, width: number, height: number, tile: readonly [number, number], rect: UvRect, tint: Tint): void {
  for (let a0 = 0; a0 < width - 1e-6; a0 += tile[0]) {
    const a1 = Math.min(width, a0 + tile[0]);
    for (let b0 = 0; b0 < height - 1e-6; b0 += tile[1]) {
      const b1 = Math.min(height, b0 + tile[1]);
      const p = (a: number, h: number) => add(add(origin, scale(u, a)), scale(v, h));
      const uu = (a: number) => rect.u0 + ((rect.u1 - rect.u0) * (a - a0)) / tile[0];
      const vv = (h: number) => rect.vBottom + ((rect.vTop - rect.vBottom) * (h - b0)) / tile[1];
      b.quad(p(a0, b0), p(a1, b0), p(a1, b1), p(a0, b1), [
        [uu(a0), vv(b0)],
        [uu(a1), vv(b0)],
        [uu(a1), vv(b1)],
        [uu(a0), vv(b1)],
      ], tint);
    }
  }
}

const UP: Vec3 = [0, 1, 0];
const EAST: Vec3 = [1, 0, 0];
const WEST: Vec3 = [-1, 0, 0];
const SOUTH: Vec3 = [0, 0, 1];
const NORTH: Vec3 = [0, 0, -1];

/** The facing (front) z of a block's wall. */
const frontZ = (block: Block) => (block.zFront === 0 ? SKIN : block.zFront);

interface Parts {
  b: GeometryBuilder;
  glass: GeometryBuilder;
  lit: GeometryBuilder;
  t: TextureCache;
  rng: Rng;
}

function walls(p: Parts, block: Block, door: { x: number } | undefined): void {
  const { b, t } = p;
  const z = frontZ(block);
  const wall = t.uv('plaster');
  const tint: Tint = [0.62, 0.6, 0.58];
  const h = block.height;
  if (door) {
    const left = door.x - DOOR_WIDTH / 2;
    const right = door.x + DOOR_WIDTH / 2;
    tiled(b, [block.x0, 0, z], EAST, UP, left - block.x0, h, WALL_TILE, wall, tint);
    tiled(b, [right, 0, z], EAST, UP, block.x1 - right, h, WALL_TILE, wall, tint);
    tiled(b, [left, DOOR_HEIGHT, z], EAST, UP, DOOR_WIDTH, h - DOOR_HEIGHT, WALL_TILE, wall, tint);
    // The doorway's reveal, down to the real door in the interior wall.
    tiled(b, [left, 0, 0], SOUTH, UP, z, DOOR_HEIGHT, WALL_TILE, t.uv('stone'), tint);
    tiled(b, [right, 0, z], NORTH, UP, z, DOOR_HEIGHT, WALL_TILE, t.uv('stone'), tint);
  } else {
    tiled(b, [block.x0, 0, z], EAST, UP, block.x1 - block.x0, h, WALL_TILE, wall, tint);
  }
  const depth = z - block.zBack;
  tiled(b, [block.x1, 0, z], NORTH, UP, depth, h, WALL_TILE, wall, shadeTint(tint, 0.85));
  tiled(b, [block.x0, 0, block.zBack], SOUTH, UP, depth, h, WALL_TILE, wall, shadeTint(tint, 0.85));
  tiled(b, [block.x1, 0, block.zBack], WEST, UP, block.x1 - block.x0, h, WALL_TILE, wall, shadeTint(tint, 0.7));

  // A stone plinth along the bottom and a cornice under the roof, front and sides.
  const stone = t.uv('stone');
  const plinth = (x0: number, x1: number) => b.box([x0, 0, z - 0.05], [x1, 0.7, z + 0.12], stone, [0.55, 0.55, 0.55]);
  if (door) {
    // Broken by the doorway, or it would bar the door.
    plinth(block.x0 - 0.1, door.x - DOOR_WIDTH / 2 - 0.32);
    plinth(door.x + DOOR_WIDTH / 2 + 0.32, block.x1 + 0.1);
  } else {
    plinth(block.x0 - 0.1, block.x1 + 0.1);
  }
  b.box([block.x0 - 0.25, h - 0.35, z - 0.1], [block.x1 + 0.25, h, z + 0.3], stone, [0.5, 0.5, 0.52]);
  for (const x of [block.x0, block.x1]) b.box([x - 0.25, 0, z - 0.25], [x + 0.25, h, z + 0.12], stone, [0.48, 0.48, 0.5]);
}

function roof(p: Parts, block: Block): void {
  const { b, t } = p;
  const slate = t.uv('slate');
  const z = frontZ(block);
  const h = block.height;
  const rh = block.roofHeight;
  const o = 0.6;
  const x0 = block.x0 - o;
  const x1 = block.x1 + o;
  const zf = z + o;
  const zb = block.zBack - o;
  if (block.roof === 'pyramid') {
    const apex: Vec3 = [(block.x0 + block.x1) / 2, h + rh, (z + block.zBack) / 2];
    const corners: Vec3[] = [[x0, h, zf], [x1, h, zf], [x1, h, zb], [x0, h, zb]];
    for (let i = 0; i < 4; i++) {
      const a = corners[i]!;
      const c = corners[(i + 1) % 4]!;
      b.quad(a, c, apex, apex, [[slate.u0, slate.vBottom], [slate.u1, slate.vBottom], [(slate.u0 + slate.u1) / 2, slate.vTop], [(slate.u0 + slate.u1) / 2, slate.vTop]], [0.55, 0.55, 0.6]);
    }
    // An iron finial.
    beam(b, apex, add(apex, [0, 1.6, 0]), 0.05, t.uv('iron'));
    return;
  }
  const ridgeZ = (zf + zb) / 2;
  const half = (zf - zb) / 2;
  const slopeLength = Math.hypot(rh, half);
  const front: Vec3 = [0, rh / slopeLength, -half / slopeLength];
  const back: Vec3 = [0, rh / slopeLength, half / slopeLength];
  tiled(b, [x0, h, zf], EAST, front, x1 - x0, slopeLength, [GROUND_TILE, GROUND_TILE], slate, [0.6, 0.6, 0.66]);
  tiled(b, [x1, h, zb], WEST, back, x1 - x0, slopeLength, [GROUND_TILE, GROUND_TILE], slate, [0.45, 0.45, 0.5]);
  // Gable ends.
  const wall = t.uv('plaster');
  const gable = (x: number, a: Vec3, c: Vec3) =>
    b.quad(a, c, [x, h + rh, ridgeZ], [x, h + rh, ridgeZ], [[wall.u0, wall.vBottom], [wall.u1, wall.vBottom], [(wall.u0 + wall.u1) / 2, wall.vTop], [(wall.u0 + wall.u1) / 2, wall.vTop]], [0.5, 0.48, 0.47]);
  gable(block.x1, [block.x1, h, z], [block.x1, h, block.zBack]);
  gable(block.x0, [block.x0, h, block.zBack], [block.x0, h, z]);
  // Chimneys on the bigger roofs.
  if (block.storeys >= 3) {
    for (const x of [block.x0 + 4, block.x1 - 4]) {
      b.box([x - 0.6, h, ridgeZ - 0.9], [x + 0.6, h + rh + 1.8, ridgeZ + 0.9], t.uv('bricks'), [0.5, 0.45, 0.42]);
      b.box([x - 0.75, h + rh + 1.8, ridgeZ - 1.05], [x + 0.75, h + rh + 2.05, ridgeZ + 1.05], t.uv('stone'), [0.45, 0.45, 0.45]);
    }
  }
}

function windows(p: Parts, block: Block, layout: ExteriorLayout): void {
  const { b, t, rng } = p;
  const z = frontZ(block);
  const storeyHeight = block.height / block.storeys;
  const tower = block.name === 'tower';
  const width = tower ? 0.9 : 1.1;
  const height = tower ? 1.8 : 2.3;
  const columns: number[] = [];
  if (tower) columns.push((block.x0 + block.x1) / 2);
  else for (let x = block.x0 + 1.8; x <= block.x1 - 1.8; x += 2.7) columns.push(x);
  const porch = layout.porch;
  const wood = t.uv('wood');
  const shutterTint: Tint = [0.38, 0.45, 0.4];

  for (let storey = 0; storey < block.storeys; storey++) {
    const sill = storey * storeyHeight + (storey === 0 ? 1.0 : 0.9);
    columns.forEach((x, column) => {
      // The porch and the door take the middle of the ground floor.
      if (storey === 0 && x > porch.x0 - 0.9 && x < porch.x1 + 0.9) return;
      const x0 = x - width / 2;
      const x1 = x + width / 2;
      const top = sill + height;
      const lit = layout.litWindows.some(([name, s, c]) => name === block.name && s === storey && c === column);
      const roll = rng.float();
      const broken = !lit && roll < 0.12;
      const boarded = !lit && roll >= 0.12 && roll < 0.3;

      const pane = (target: GeometryBuilder, rect: UvRect, tint?: Tint) =>
        target.tile([x0, sill, z + 0.03], [x1, sill, z + 0.03], [x1, top, z + 0.03], [x0, top, z + 0.03], rect, tint);
      if (lit) pane(p.lit, t.uv('window'));
      else if (broken) pane(b, t.uv('soot'));
      else pane(p.glass, t.uv('window'));

      // Frame, mullions, a stone sill and lintel.
      b.box([x0 - 0.1, sill - 0.12, z], [x1 + 0.1, sill, z + 0.22], t.uv('stone'), [0.5, 0.5, 0.5]);
      b.box([x0 - 0.12, top, z], [x1 + 0.12, top + 0.25, z + 0.16], t.uv('stone'), [0.5, 0.5, 0.5]);
      b.box([x0 - 0.06, sill, z], [x0, top, z + 0.08], wood, [0.5, 0.5, 0.5]);
      b.box([x1, sill, z], [x1 + 0.06, top, z + 0.08], wood, [0.5, 0.5, 0.5]);
      b.box([x - 0.025, sill, z + 0.02], [x + 0.025, top, z + 0.07], wood, [0.45, 0.45, 0.45]);
      b.box([x0, sill + height * 0.62 - 0.025, z + 0.02], [x1, sill + height * 0.62 + 0.025, z + 0.07], wood, [0.45, 0.45, 0.45]);

      if (boarded) {
        for (let plank = 0; plank < 3; plank++) {
          const angle = (rng.float() - 0.5) * 0.5;
          const centre: Vec3 = [x + (rng.float() - 0.5) * 0.15, sill + height * (0.2 + plank * 0.3), z + 0.1];
          const right: Vec3 = [Math.cos(angle), Math.sin(angle), 0];
          const up: Vec3 = [-Math.sin(angle), Math.cos(angle), 0];
          orientedBox(b, centre, [right, up, SOUTH], [width * 0.65, 0.09, 0.02], wood, [0.55, 0.5, 0.45]);
        }
      }
      // Shutters; some hang by one hinge.
      if (!tower && rng.chance(0.55)) {
        for (const side of [-1, 1]) {
          const hinge = side < 0 ? x0 - 0.06 : x1 + 0.06;
          const hanging = rng.chance(0.2);
          if (hanging) {
            const angle = side * (0.35 + rng.float() * 0.3);
            const right: Vec3 = [Math.cos(angle), Math.sin(angle), 0];
            const up: Vec3 = [-Math.sin(angle), Math.cos(angle), 0];
            orientedBox(b, [hinge + side * 0.3, sill + height / 2 - 0.25, z + 0.06], [right, up, SOUTH], [0.27, height / 2, 0.025], wood, shutterTint);
          } else {
            const sx0 = side < 0 ? hinge - 0.55 : hinge;
            b.box([sx0, sill, z + 0.02], [sx0 + 0.55, top, z + 0.07], wood, shutterTint);
          }
        }
      }
    });
  }
}

function porchAndDoor(p: Parts, layout: ExteriorLayout): void {
  const { b, t } = p;
  const { porch, door } = layout;
  const stone = t.uv('stone');
  const top = porch.height;
  b.box([porch.x0, 0, SKIN], [porch.x1, 0.12, porch.depth], stone, [0.5, 0.5, 0.5]);
  for (const x of porch.columns) {
    b.prism(x, porch.depth - 0.6, 0.26, 0.12, top, 8, t.uv('plaster'), [0.6, 0.58, 0.56]);
    b.box([x - 0.35, 0.12, porch.depth - 0.95], [x + 0.35, 0.4, porch.depth - 0.25], stone, [0.5, 0.5, 0.5]);
  }
  // Entablature and pediment.
  b.box([porch.x0 - 0.2, top, SKIN], [porch.x1 + 0.2, top + 0.55, porch.depth + 0.2], stone, [0.5, 0.5, 0.52]);
  const apex: Vec3 = [door.x, top + 2.1, porch.depth + 0.2];
  const wall = t.uv('plaster');
  b.quad([porch.x0 - 0.2, top + 0.55, porch.depth + 0.2], [porch.x1 + 0.2, top + 0.55, porch.depth + 0.2], apex, apex, [[wall.u0, wall.vBottom], [wall.u1, wall.vBottom], [(wall.u0 + wall.u1) / 2, wall.vTop], [(wall.u0 + wall.u1) / 2, wall.vTop]], [0.55, 0.53, 0.52]);
  const slate = t.uv('slate');
  const ridgeBack: Vec3 = [door.x, top + 2.1, SKIN];
  const slope = (outer: number) =>
    b.quad(
      outer < door.x ? [outer, top + 0.55, porch.depth + 0.4] : [outer, top + 0.55, SKIN],
      outer < door.x ? [outer, top + 0.55, SKIN] : [outer, top + 0.55, porch.depth + 0.4],
      outer < door.x ? ridgeBack : [door.x, top + 2.1, porch.depth + 0.4],
      outer < door.x ? [door.x, top + 2.1, porch.depth + 0.4] : ridgeBack,
      [[slate.u0, slate.vBottom], [slate.u1, slate.vBottom], [slate.u1, slate.vTop], [slate.u0, slate.vTop]],
      [0.55, 0.55, 0.6],
    );
  slope(porch.x0 - 0.4);
  slope(porch.x1 + 0.4);
  // The door's stone surround and a dark fanlight.
  const left = door.x - DOOR_WIDTH / 2;
  const right = door.x + DOOR_WIDTH / 2;
  b.box([left - 0.32, 0, SKIN], [left, DOOR_HEIGHT + 0.5, SKIN + 0.18], stone, [0.55, 0.55, 0.55]);
  b.box([right, 0, SKIN], [right + 0.32, DOOR_HEIGHT + 0.5, SKIN + 0.18], stone, [0.55, 0.55, 0.55]);
  b.box([left - 0.45, DOOR_HEIGHT + 0.5, SKIN], [right + 0.45, DOOR_HEIGHT + 0.75, SKIN + 0.22], stone, [0.55, 0.55, 0.55]);
  p.glass.tile([left, DOOR_HEIGHT + 0.05, SKIN + 0.02], [right, DOOR_HEIGHT + 0.05, SKIN + 0.02], [right, DOOR_HEIGHT + 0.45, SKIN + 0.02], [left, DOOR_HEIGHT + 0.45, SKIN + 0.02], t.uv('window'));
}

function grounds(p: Parts, layout: ExteriorLayout): void {
  const { b, t, rng } = p;
  const { yard, path, gate, road } = layout;
  // Mud everywhere south of the house, out past the road.
  tiled(b, [-45, 0, 70], EAST, NORTH, 115, 70 - SKIN, [GROUND_TILE, GROUND_TILE], t.uv('mud'), [0.78, 0.78, 0.78]);
  tiled(b, [-45, 0.01, road.z1], EAST, NORTH, 115, road.z1 - road.z0, [GROUND_TILE, GROUND_TILE], t.uv('gravel'), [0.4, 0.4, 0.42]);
  tiled(b, [path.x0, 0.012, path.z1], EAST, NORTH, path.x1 - path.x0, path.z1 - SKIN, [GROUND_TILE, GROUND_TILE], t.uv('gravel'), [0.6, 0.6, 0.6]);

  // The iron fence: posts with spear tips and two rails, on three sides, and the shut gate.
  const iron = t.uv('iron');
  const fenceTint: Tint = [0.7, 0.7, 0.75];
  const run = (from: Vec3, to: Vec3, skip?: [number, number]) => {
    const length = Math.hypot(to[0] - from[0], to[2] - from[2]);
    const dir: Vec3 = [(to[0] - from[0]) / length, 0, (to[2] - from[2]) / length];
    for (let d = 0; d <= length; d += 0.25) {
      const at = add(from, scale(dir, d));
      if (skip && at[0] > skip[0] && at[0] < skip[1]) continue;
      const lean = (rng.float() - 0.5) * 0.06;
      beam(b, at, [at[0] + lean, 1.7, at[2]], 0.018, iron, fenceTint);
      if (Math.round(d / 0.25) % 1 === 0) beam(b, [at[0] + lean, 1.7, at[2]], [at[0] + lean, 1.85, at[2]], 0.03, iron, fenceTint);
    }
    for (const y of [0.3, 1.5]) {
      if (skip) {
        beam(b, [from[0], y, from[2]], [skip[0], y, to[2]], 0.025, iron, fenceTint);
        beam(b, [skip[1], y, from[2]], [to[0], y, to[2]], 0.025, iron, fenceTint);
      } else {
        beam(b, [from[0], y, from[2]], [to[0], y, to[2]], 0.025, iron, fenceTint);
      }
    }
  };
  run([yard.minX, 0, yard.maxZ], [yard.maxX, 0, yard.maxZ], [gate.x0 - 0.3, gate.x1 + 0.3]);
  run([yard.minX, 0, yard.maxZ], [yard.minX, 0, SKIN]);
  run([yard.maxX, 0, yard.maxZ], [yard.maxX, 0, SKIN]);
  // The gate: taller bars between stone pillars topped with balls.
  for (let x = gate.x0 + 0.1; x < gate.x1; x += 0.2) beam(b, [x, 0, gate.z], [x, 2.1, gate.z], 0.02, iron, fenceTint);
  for (const y of [0.3, 1.2, 2.0]) beam(b, [gate.x0, y, gate.z], [gate.x1, y, gate.z], 0.03, iron, fenceTint);
  for (const x of [gate.x0 - 0.3, gate.x1 + 0.3]) {
    b.box([x - 0.3, 0, gate.z - 0.3], [x + 0.3, 2.5, gate.z + 0.3], t.uv('stone'), [0.5, 0.5, 0.5]);
    b.prism(x, gate.z, 0.25, 2.5, 2.9, 8, t.uv('stone'), [0.5, 0.5, 0.5]);
  }

  // Dead trees: a trunk, then limbs that fork and thin.
  const bark = t.uv('bark');
  for (const tree of layout.trees) {
    const trng = createRng(tree.seed).fork('tree');
    const limb = (from: Vec3, dir: Vec3, length: number, radius: number, depth: number) => {
      const to = add(from, scale(dir, length));
      beam(b, from, to, radius, bark, [0.6, 0.6, 0.6]);
      if (depth === 0) return;
      const forks = depth >= 2 ? 3 : 2;
      for (let i = 0; i < forks; i++) {
        const turn = trng.float() * Math.PI * 2;
        const spread = 0.5 + trng.float() * 0.5;
        const next: Vec3 = [dir[0] * 0.5 + Math.cos(turn) * spread, 0.6 + trng.float() * 0.4, dir[2] * 0.5 + Math.sin(turn) * spread];
        const n = Math.hypot(...next);
        limb(to, [next[0] / n, next[1] / n, next[2] / n], length * (0.55 + trng.float() * 0.2), radius * 0.6, depth - 1);
      }
    };
    const lean: Vec3 = [(trng.float() - 0.5) * 0.15, 1, (trng.float() - 0.5) * 0.15];
    limb([tree.x, 0, tree.z], lean, tree.height * 0.5, 0.28, 3);
  }

  // The family plot: leaning headstones in front of low mounds.
  for (const grave of layout.graves) {
    const right: Vec3 = [Math.cos(grave.turn), 0, -Math.sin(grave.turn)];
    const up: Vec3 = [0, Math.cos(grave.lean), Math.sin(grave.lean)];
    const out: Vec3 = [Math.sin(grave.turn), -Math.sin(grave.lean), Math.cos(grave.turn) * Math.cos(grave.lean)];
    orientedBox(b, [grave.x, 0.5, grave.z], [right, up, out], [0.35, 0.55, 0.08], t.uv('stone'), [0.42, 0.42, 0.44]);
    b.box([grave.x - 0.4, 0, grave.z + 0.15], [grave.x + 0.4, 0.2, grave.z + 1.9], t.uv('mud'), [0.5, 0.5, 0.5]);
  }

  // The car that died on the road, lights dead.
  const { car } = layout;
  const body = t.uv('iron');
  const carTint: Tint = [0.45, 0.42, 0.4];
  b.box([car.x - car.length / 2, 0.35, car.z - car.width / 2], [car.x + car.length / 2, 1.0, car.z + car.width / 2], body, carTint);
  b.box([car.x - 1.1, 1.0, car.z - car.width / 2 + 0.1], [car.x + 0.8, 1.55, car.z + car.width / 2 - 0.1], body, carTint);
  p.glass.tile([car.x + 0.8, 1.02, car.z + 0.78], [car.x + 0.8, 1.02, car.z - 0.78], [car.x + 0.8, 1.52, car.z - 0.78], [car.x + 0.8, 1.52, car.z + 0.78], t.uv('window'));
  for (const wx of [car.x - 1.35, car.x + 1.35]) {
    for (const wz of [car.z - car.width / 2, car.z + car.width / 2]) {
      orientedBox(b, [wx, 0.36, wz], [EAST, UP, SOUTH], [0.36, 0.36, 0.12], t.uv('soot'), [0.6, 0.6, 0.6]);
    }
  }
}

export interface ExteriorScene {
  update(time: number, camera: Vector3, flash: number): void;
  dispose(): void;
}

/**
 * Builds the mansion's outside, its grounds, the storm sky, the rain and the moonlight, and adds
 * them to the scene. `dispose()` takes it all away again once the player is inside.
 */
export function createExteriorScene(scene: Scene, textures: TextureCache, layout: ExteriorLayout, seed: number): ExteriorScene {
  const parts: Parts = { b: new GeometryBuilder(), glass: new GeometryBuilder(), lit: new GeometryBuilder(), t: textures, rng: createRng(seed).fork('exterior-mesh') };
  for (const block of layout.blocks) {
    walls(parts, block, block.name === 'centre' ? layout.door : undefined);
    roof(parts, block);
    windows(parts, block, layout);
  }
  porchAndDoor(parts, layout);
  grounds(parts, layout);

  const group = new Group();
  group.name = 'exterior';
  const shell = new Mesh(parts.b.build(), textures.material);
  shell.castShadow = true;
  shell.receiveShadow = true;
  const glass = new Mesh(parts.glass.build(), textures.glassMaterial);
  // A candle's glow behind old glass: a plain warm colour, not the night-sky glass texture.
  const litMaterial = new MeshBasicMaterial({ color: new Color(0.55, 0.27, 0.07) });
  const lit = new Mesh(parts.lit.build(), litMaterial);
  group.add(shell, glass, lit);

  const sky = createSky();
  const rain = createRain();
  // Moonlight through cloud: just enough to make out the house against the sky.
  const moon = new HemisphereLight(0x5a6890, 0x0e0d0b, 1.7);
  const moonDirection = new DirectionalLight(0x8090b8, 0.35);
  moonDirection.position.set(-30, 40, 40);
  moonDirection.target.position.set(10, 0, 0);
  group.add(sky.mesh, rain.mesh, moon, moonDirection, moonDirection.target);
  scene.add(group);

  return {
    update(time, camera, flash) {
      sky.update(time, camera, flash);
      rain.update(time, camera, flash);
      // A candle somewhere upstairs, guttering.
      const flicker = 0.75 + 0.15 * Math.sin(time * 7.3) + 0.1 * Math.sin(time * 13.1 + 1);
      litMaterial.color.setRGB(0.55 * flicker, 0.27 * flicker, 0.07 * flicker);
    },
    dispose() {
      group.removeFromParent();
      shell.geometry.dispose();
      glass.geometry.dispose();
      lit.geometry.dispose();
      litMaterial.dispose();
      sky.dispose();
      rain.dispose();
    },
  };
}
