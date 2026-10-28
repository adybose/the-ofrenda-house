import { describe, expect, it } from 'vitest';
import { generateCase } from '../../src/case/generate';
import { createRng } from '../../src/core/rng';
import { NO_INPUT, createPlayerState, stepPlayer } from '../../src/player/movement';
import { createCollisionMap } from '../../src/world/collision';
import { furnishRoom } from '../../src/world/furniture';
import { createHouse } from '../../src/world/house';
import { cellCentre, worldToCell } from '../../src/world/units';

function setup(seed: number) {
  const house = createHouse(seed, generateCase(seed));
  return { house, map: createCollisionMap(house, seed) };
}

describe('createCollisionMap', () => {
  it('walks from the entrance hall into the portrait hall through the open archway', () => {
    const { house, map } = setup(42);
    const [x, z] = cellCentre(house.startCell);
    let s = createPlayerState(x, z, 0);
    for (let i = 0; i < 240; i++) s = stepPlayer(s, { ...NO_INPUT, forward: 1 }, 1 / 60, map);
    expect(house.roomAt(worldToCell(s.x, s.z))?.id).toBe('portrait-hall');
  });

  it('stops the player at a closed door and lets them through once it is open', () => {
    const { house, map } = setup(42);
    house.endAct1();
    // The Act 1 exit: corridor cell 0,2 on the wing side, -1,2 beyond.
    const [x, z] = cellCentre('1,2');
    const west = Math.PI / 2;
    let s = createPlayerState(x, z, west);
    for (let i = 0; i < 180; i++) s = stepPlayer(s, { ...NO_INPUT, forward: 1 }, 1 / 60, map);
    expect(house.roomAt(worldToCell(s.x, s.z))?.id).toBe('act1-corridor');
    expect(house.setDoorOpen('d:-1,0:E', true)).toBe(true);
    for (let i = 0; i < 180; i++) s = stepPlayer(s, { ...NO_INPUT, forward: 1 }, 1 / 60, map);
    expect(house.roomAt(worldToCell(s.x, s.z))?.id).not.toBe('act1-corridor');
  });

  it('includes furniture footprints', () => {
    const { house, map } = setup(42);
    const key = house.keyRooms()[0]!;
    const room = house.getRoom(key.roomId!)!;
    const item = furnishRoom(room, 42)[0]!;
    const boxes = map.boxesNear(item.x, item.z, 0.3);
    expect(boxes.some((b) => b.minX <= item.x && item.x <= b.maxX && b.minZ <= item.z && item.z <= b.maxZ)).toBe(true);
  });

  it('only ever moves the player between rooms through open doors, on a long steered walk', () => {
    for (const seed of [1, 42, 99]) {
      const { house, map } = setup(seed);
      house.endAct1();
      house.setDoorOpen('d:-1,0:E', true);
      const rng = createRng(seed).fork('collision-walk');
      const [x, z] = cellCentre('-1,2');
      let s = createPlayerState(x, z, Math.PI / 2);
      let cell = worldToCell(s.x, s.z);
      let crossings = 0;
      let target: { x: number; z: number } | undefined;
      for (let frame = 0; frame < 6000; frame++) {
        // Pick a door of the current room, open it as if pressing E, and head for its far side.
        if (!target || frame % 400 === 0) {
          const room = house.roomAt(cell)!;
          const doorId = rng.pick(room.doors.filter((id) => id !== 'front-door'));
          house.setDoorOpen(doorId, true);
          const door = house.getDoor(doorId)!;
          const far = room.cells.includes(door.a) ? door.b : door.a;
          const [tx, tz] = cellCentre(far);
          target = { x: tx, z: tz };
        }
        const wanted = Math.atan2(-(target.x - s.x), -(target.z - s.z));
        const turn = Math.atan2(Math.sin(wanted - s.yaw), Math.cos(wanted - s.yaw));
        const keys = {
          ...NO_INPUT,
          forward: rng.chance(0.95) ? 1 : -1,
          lookYaw: turn * 0.2 + (rng.float() - 0.5) * 0.15,
          run: rng.chance(0.3),
        };
        s = stepPlayer(s, keys, rng.pick([1 / 60, 1 / 30, 0.1]), map);
        const next = worldToCell(s.x, s.z);
        const room = house.roomAt(next);
        expect(room, `seed ${seed} frame ${frame}: in the void at ${next}`).toBeDefined();
        const before = house.roomAt(cell)!;
        if (room!.id !== before.id) {
          const door = house.doorBetween(cell, next);
          expect(door?.state, `seed ${seed}: ${cell} -> ${next} without an open door`).toBe('open');
          crossings++;
          target = undefined;
        }
        if (Math.hypot(target ? target.x - s.x : 0, target ? target.z - s.z : 0) < 0.3) target = undefined;
        cell = next;
      }
      expect(crossings, `seed ${seed}: the walk should get through many doorways`).toBeGreaterThan(20);
    }
  });
});
