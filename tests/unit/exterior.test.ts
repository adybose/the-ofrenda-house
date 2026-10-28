import { describe, expect, it } from 'vitest';
import { generateCase } from '../../src/case/generate';
import { createRng } from '../../src/core/rng';
import { NO_INPUT, createPlayerState, stepPlayer } from '../../src/player/movement';
import { createCollisionMap } from '../../src/world/collision';
import { composeCollision, exteriorCollision, exteriorLayout } from '../../src/world/exterior';
import { createHouse } from '../../src/world/house';

function setup(seed: number) {
  const house = createHouse(seed, generateCase(seed));
  const layout = exteriorLayout(seed);
  const map = composeCollision(createCollisionMap(house, seed), exteriorCollision(layout));
  return { house, layout, map };
}

describe('exteriorLayout', () => {
  it('covers every interior chunk that can load while outside (x -22.5 to 45 along the façade)', () => {
    const { blocks } = exteriorLayout(42);
    const front = blocks.filter((b) => b.zFront >= 0);
    // Walk along the façade in 25 cm steps: something must stand in front of every point.
    for (let x = -22.5; x <= 45; x += 0.25) {
      expect(front.some((b) => b.x0 <= x && x <= b.x1), `gap at x ${x}`).toBe(true);
    }
  });

  it('starts the player inside the yard, on the path, facing the front door', () => {
    const { start, door, yard, path } = exteriorLayout(42);
    expect(start.x).toBeGreaterThan(yard.minX);
    expect(start.x).toBeLessThan(yard.maxX);
    expect(start.z).toBeGreaterThan(20);
    expect(start.z).toBeLessThan(yard.maxZ);
    expect(start.x).toBeGreaterThanOrEqual(path.x0);
    expect(start.x).toBeLessThanOrEqual(path.x1);
    expect(start.yaw).toBe(0);
    expect(door.x).toBeCloseTo(11.25, 5);
    expect(door.z).toBe(0);
  });

  it('is deterministic', () => {
    expect(exteriorLayout(7)).toEqual(exteriorLayout(7));
  });
});

describe('outside collision', () => {
  it('keeps the player in the yard and out of the house while the door is sealed', () => {
    for (const seed of [1, 42]) {
      const { layout, map } = setup(seed);
      const rng = createRng(seed).fork('yard-walk');
      for (let walk = 0; walk < 12; walk++) {
        let s = createPlayerState(layout.start.x, layout.start.z, rng.float() * Math.PI * 2);
        for (let frame = 0; frame < 900; frame++) {
          const keys = { ...NO_INPUT, forward: rng.chance(0.9) ? 1 : -1, turn: rng.pick([0, 0, 0, 1, -1]), run: rng.chance(0.5) };
          s = stepPlayer(s, keys, rng.pick([1 / 60, 0.05, 0.1]), map);
          expect(s.x).toBeGreaterThan(layout.yard.minX);
          expect(s.x).toBeLessThan(layout.yard.maxX);
          expect(s.z).toBeLessThan(layout.yard.maxZ);
          expect(s.z, `seed ${seed} got through the façade at x ${s.x.toFixed(2)}`).toBeGreaterThan(0);
        }
      }
    }
  });

  it('leads inside through the doorway once the door is open', () => {
    const { house, layout, map } = setup(42);
    house.unsealFrontDoor();
    expect(house.setDoorOpen('front-door', true)).toBe(true);
    let s = createPlayerState(layout.door.x, 3, 0);
    for (let frame = 0; frame < 240; frame++) s = stepPlayer(s, { ...NO_INPUT, forward: 1 }, 1 / 60, map);
    expect(s.z).toBeLessThan(-1.5);
    expect(Math.abs(s.x - layout.door.x)).toBeLessThan(0.3);
  });
});
