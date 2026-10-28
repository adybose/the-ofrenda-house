import { createRng } from '../core/rng';
import type { Box, CollisionMap } from '../player/movement';
import { cellCentre } from './units';

/**
 * The mansion seen from outside, and its grounds: pure data, so rendering and collision agree.
 * World axes as everywhere: x east, z south (the façade runs along z = 0, the grounds are z > 0).
 */

/** A rectangular part of the building, from the ground to `height`, with a roof on top. */
export interface Block {
  name: string;
  x0: number;
  x1: number;
  /** The front face (south, towards the grounds); 0 is the façade line. */
  zFront: number;
  zBack: number;
  height: number;
  storeys: number;
  roof: 'gable' | 'pyramid';
  roofHeight: number;
}

export interface Tree {
  x: number;
  z: number;
  height: number;
  /** Seeds the branches. */
  seed: number;
}

export interface Grave {
  x: number;
  z: number;
  /** Lean, radians. */
  lean: number;
  turn: number;
}

export interface ExteriorLayout {
  blocks: Block[];
  porch: { x0: number; x1: number; depth: number; height: number; columns: number[] };
  door: { x: number; z: number };
  /** Inside the fence. */
  yard: { minX: number; maxX: number; minZ: number; maxZ: number };
  path: { x0: number; x1: number; z0: number; z1: number };
  gate: { x0: number; x1: number; z: number };
  road: { z0: number; z1: number };
  car: { x: number; z: number; length: number; width: number };
  trees: Tree[];
  graves: Grave[];
  /** Upstairs windows with a faint light behind them: [block name, storey, column]. */
  litWindows: [string, number, number][];
  start: { x: number; z: number; yaw: number };
  colliders: Box[];
}

const FENCE_HALF = 0.1;

export function exteriorLayout(seed: number): ExteriorLayout {
  const rng = createRng(seed).fork('exterior');
  const [doorX] = cellCentre('7,0');

  const blocks: Block[] = [
    { name: 'centre', x0: -2, x1: 24.5, zFront: 0, zBack: -16, height: 12.6, storeys: 3, roof: 'gable', roofHeight: 5.5 },
    { name: 'west', x0: -25, x1: -2, zFront: 0, zBack: -12, height: 8.4, storeys: 2, roof: 'gable', roofHeight: 4 },
    { name: 'east', x0: 24.5, x1: 47, zFront: 0, zBack: -12, height: 8.4, storeys: 2, roof: 'gable', roofHeight: 4 },
    { name: 'tower', x0: 27, x1: 33, zFront: 1.5, zBack: -4.5, height: 18, storeys: 4, roof: 'pyramid', roofHeight: 7 },
  ];
  const porch = { x0: doorX - 4, x1: doorX + 4, depth: 4.2, height: 5, columns: [doorX - 3.5, doorX - 1.5, doorX + 1.5, doorX + 3.5] };
  const yard = { minX: -20, maxX: 42, minZ: 0, maxZ: 40 };
  const path = { x0: doorX - 1.1, x1: doorX + 1.1, z0: 0, z1: yard.maxZ };
  const gate = { x0: doorX - 1.6, x1: doorX + 1.6, z: yard.maxZ };
  const road = { z0: 42, z1: 49 };
  const car = { x: doorX + 5, z: 45.5, length: 4.4, width: 1.8 };

  // Dead trees and the family plot, kept clear of the path and the porch.
  const trees: Tree[] = [
    [-14, 9],
    [-9, 27],
    [-3, 17],
    [27, 26],
    [35, 13],
    [38, 31],
    [21, 34],
  ].map(([x, z], i) => ({ x: x! + (rng.float() - 0.5) * 2, z: z! + (rng.float() - 0.5) * 2, height: 6 + rng.float() * 4, seed: i }));
  const graves: Grave[] = [];
  for (let i = 0; i < 6; i++) {
    graves.push({
      x: -16 + (i % 3) * 2.4 + (rng.float() - 0.5) * 0.6,
      z: 30 + Math.floor(i / 3) * 3 + (rng.float() - 0.5) * 0.6,
      lean: (rng.float() - 0.5) * 0.35,
      turn: (rng.float() - 0.5) * 0.3,
    });
  }
  const litWindows: [string, number, number][] = [
    ['centre', 2, rng.int(0, 3)],
    ['east', 1, rng.int(1, 6)],
  ];

  const colliders: Box[] = [];
  const box = (minX: number, maxX: number, minZ: number, maxZ: number) => colliders.push({ minX, maxX, minZ, maxZ });
  // The façade line, with a gap only at the doorway (the door itself is the house's to block).
  box(-30, doorX - 0.5, -0.3, 0.15);
  box(doorX + 0.5, 50, -0.3, 0.15);
  // The tower stands proud of the façade.
  const tower = blocks.find((b) => b.name === 'tower')!;
  box(tower.x0, tower.x1, -0.3, tower.zFront);
  // The fence: front (with the gate), and both sides back to the house.
  box(yard.minX, gate.x0, yard.maxZ - FENCE_HALF, yard.maxZ + FENCE_HALF);
  box(gate.x1, yard.maxX, yard.maxZ - FENCE_HALF, yard.maxZ + FENCE_HALF);
  // The gate has swung shut behind the player, between its two stone posts.
  box(gate.x0, gate.x1, yard.maxZ - FENCE_HALF, yard.maxZ + FENCE_HALF);
  box(gate.x0 - 0.3, gate.x0, yard.maxZ - 0.3, yard.maxZ + 0.3);
  box(gate.x1, gate.x1 + 0.3, yard.maxZ - 0.3, yard.maxZ + 0.3);
  box(yard.minX - FENCE_HALF, yard.minX + FENCE_HALF, -0.5, yard.maxZ + FENCE_HALF);
  box(yard.maxX - FENCE_HALF, yard.maxX + FENCE_HALF, -0.5, yard.maxZ + FENCE_HALF);
  for (const x of porch.columns) box(x - 0.3, x + 0.3, porch.depth - 0.9, porch.depth - 0.3);
  for (const tree of trees) box(tree.x - 0.3, tree.x + 0.3, tree.z - 0.3, tree.z + 0.3);
  for (const grave of graves) box(grave.x - 0.4, grave.x + 0.4, grave.z - 0.15, grave.z + 0.15);

  return {
    blocks,
    porch,
    door: { x: doorX, z: 0 },
    yard,
    path,
    gate,
    road,
    car,
    trees,
    graves,
    litWindows,
    start: { x: doorX, z: 34, yaw: 0 },
    colliders,
  };
}

/** The grounds' solids as a collision map. */
export function exteriorCollision(layout: ExteriorLayout): CollisionMap {
  return {
    boxesNear(x, z, radius) {
      const r = radius + 1;
      return layout.colliders.filter((b) => b.maxX > x - r && b.minX < x + r && b.maxZ > z - r && b.minZ < z + r);
    },
  };
}

/** Several collision maps as one. */
export function composeCollision(...maps: CollisionMap[]): CollisionMap {
  return { boxesNear: (x, z, radius) => maps.flatMap((m) => m.boxesNear(x, z, radius)) };
}
