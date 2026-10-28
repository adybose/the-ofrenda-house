import { generateCase } from '../../src/case/generate';
import { createRng, type Rng } from '../../src/core/rng';
import { DIRS, DIR_STEP, KEY_ROOM_REACH, cellId, parseCell } from '../../src/world/grid';
import { createHouse, type House } from '../../src/world/house';
import type { CellId } from '../../src/world/types';

export function newHouse(seed: number): House {
  return createHouse(seed, generateCase(seed));
}

/** Cells the player could step to from `cell`: same room, or through a door that is not locked or sealed. */
export function legalSteps(house: House, cell: CellId): CellId[] {
  const [x, y] = parseCell(cell);
  const here = house.roomAt(cell);
  const steps: CellId[] = [];
  for (const dir of DIRS) {
    const [dx, dy] = DIR_STEP[dir];
    const next = cellId(x + dx, y + dy);
    const there = house.roomAt(next);
    if (!here || !there) continue;
    if (here.id === there.id) {
      steps.push(next);
      continue;
    }
    const door = house.doorBetween(cell, next);
    if (door && door.state !== 'locked' && door.state !== 'sealed') steps.push(next);
  }
  return steps;
}

/** Cells that would be in view: the player's room and every room up to `depth` doors away. */
export function visibleAround(house: House, cell: CellId, depth: number): Set<CellId> {
  const visible = new Set<CellId>();
  for (const [roomId] of house.distancesFrom(cell, depth)) {
    for (const c of house.getRoom(roomId)?.cells ?? []) visible.add(c);
  }
  return visible;
}

/** A random cell in a random room 1 to `maxDoors` doors away (the player wandering between strikes). */
export function wander(house: House, rng: Rng, cell: CellId, maxDoors: number): CellId {
  const options = [...house.distancesFrom(cell, maxDoors)].filter(([, d]) => d >= 1).map(([id]) => id);
  if (options.length === 0) return cell;
  const room = house.getRoom(rng.pick(options));
  return room ? rng.pick(room.cells) : cell;
}

/** Unvisited key rooms that are not within K doors of the player. */
export function unreachableKeyRooms(house: House, player: CellId): string[] {
  const distances = house.distancesFrom(player, KEY_ROOM_REACH);
  return house
    .keyRooms()
    .filter((k) => !k.visited)
    .filter((k) => k.roomId === undefined || !distances.has(k.roomId))
    .map((k) => k.characterId);
}

/**
 * Plays 50 lightning strikes per seed: the player wanders 1 to 3 rooms between strikes,
 * sometimes pins petals and sometimes visits a key room. Returns every time a key room was out of reach.
 */
export function reachFailures(firstSeed: number, lastSeed: number): string[] {
  const failures: string[] = [];
  for (let seed = firstSeed; seed <= lastSeed; seed++) {
    const house = newHouse(seed);
    const rng = createRng(seed).fork('reach-test');
    let player = house.startCell;
    const missing = unreachableKeyRooms(house, player);
    if (missing.length) failures.push(`seed ${seed} start: ${missing.join(', ')}`);

    for (let i = 0; i < 50; i++) {
      player = wander(house, rng, player, 3);
      const here = house.roomAt(player);
      if (here?.kind === 'key' && here.characterId) house.markVisited(here.characterId);
      if (rng.chance(0.1)) house.pinCells([player]);
      house.reshuffle(visibleAround(house, player, 2), player);
      const lost = unreachableKeyRooms(house, player);
      if (lost.length) failures.push(`seed ${seed} reshuffle ${i}: ${lost.join(', ')}`);
    }
  }
  return failures;
}

export { createRng };
