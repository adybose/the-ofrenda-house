import { describe, expect, it } from 'vitest';
import { createRng } from '../../src/core/rng';
import { NO_INPUT, PLAYER, createPlayerState, stepPlayer, type Box, type CollisionMap, type InputState } from '../../src/player/movement';

const open: CollisionMap = { boxesNear: () => [] };
const mapOf = (boxes: Box[]): CollisionMap => ({ boxesNear: () => boxes });
const input = (over: Partial<InputState>): InputState => ({ ...NO_INPUT, ...over });

function run(state = createPlayerState(0, 0, 0), keys: Partial<InputState>, seconds: number, dt: number, map = open) {
  let s = state;
  for (let t = 0; t < seconds - 1e-9; t += dt) s = stepPlayer(s, input(keys), dt, map);
  return s;
}

/** How far a circle at (x, z) overlaps a box. */
function penetration(x: number, z: number, box: Box): number {
  const cx = Math.min(Math.max(x, box.minX), box.maxX);
  const cz = Math.min(Math.max(z, box.minZ), box.maxZ);
  return PLAYER.radius - Math.hypot(x - cx, z - cz);
}

describe('speeds and turning', () => {
  it('walks at the walk speed and runs at the run speed, facing north (-z) at yaw 0', () => {
    const walked = run(undefined, { forward: 1 }, 1, 1 / 60);
    expect(walked.z).toBeCloseTo(-PLAYER.walkSpeed, 5);
    expect(walked.x).toBeCloseTo(0, 5);
    const ran = run(undefined, { forward: 1, run: true }, 1, 1 / 60);
    expect(ran.z).toBeCloseTo(-PLAYER.walkSpeed * PLAYER.runMultiplier, 5);
    expect(PLAYER.runMultiplier).toBeCloseTo(1.8, 5);
    const back = run(undefined, { forward: -1 }, 1, 1 / 60);
    expect(back.z).toBeCloseTo(PLAYER.walkSpeed, 5);
  });

  it('turns left (yaw up) and right at the turn rate', () => {
    expect(run(undefined, { turn: 1 }, 1, 1 / 60).yaw).toBeCloseTo(PLAYER.turnRate, 5);
    expect(run(undefined, { turn: -1 }, 0.5, 1 / 60).yaw).toBeCloseTo(-PLAYER.turnRate / 2, 5);
  });

  it('walks the way it faces', () => {
    const s = run(createPlayerState(0, 0, Math.PI / 2), { forward: 1 }, 1, 1 / 60);
    expect(s.x).toBeCloseTo(-PLAYER.walkSpeed, 5);
    expect(s.z).toBeCloseTo(0, 5);
  });

  it('looks up and down with keys and the mouse, clamped to about ±80°', () => {
    expect(run(undefined, { pitch: 1 }, 0.5, 1 / 60).pitch).toBeCloseTo(PLAYER.pitchRate / 2, 5);
    expect(run(undefined, { pitch: 1 }, 10, 1 / 60).pitch).toBeCloseTo(PLAYER.pitchLimit, 5);
    expect(run(undefined, { pitch: -1 }, 10, 1 / 60).pitch).toBeCloseTo(-PLAYER.pitchLimit, 5);
    expect(PLAYER.pitchLimit).toBeCloseTo((80 * Math.PI) / 180, 5);
    const mouse = stepPlayer(createPlayerState(0, 0, 0), input({ lookYaw: 0.3, lookPitch: -0.2 }), 1 / 60, open);
    expect(mouse.yaw).toBeCloseTo(0.3, 5);
    expect(mouse.pitch).toBeCloseTo(-0.2, 5);
  });

  it('counts footsteps by stride and bobs only while moving', () => {
    const walked = run(undefined, { forward: 1 }, 3, 1 / 60);
    expect(walked.steps).toBe(Math.floor((PLAYER.walkSpeed * 3) / PLAYER.strideWalk));
    const still = run(undefined, {}, 3, 1 / 60);
    expect(still.steps).toBe(0);
    expect(still.bob).toBe(0);
  });
});

describe('collision', () => {
  // A 20 cm wall across the corridor 2 m north of the player.
  const wall: Box = { minX: -10, maxX: 10, minZ: -2.1, maxZ: -1.9 };

  it('never lets the player through a wall at walk or run speed, for frames up to 100 ms', () => {
    for (const dt of [1 / 120, 1 / 60, 1 / 30, 0.05, 0.1]) {
      for (const runKey of [false, true]) {
        const s = run(undefined, { forward: 1, run: runKey }, 5, dt, mapOf([wall]));
        expect(s.z, `dt ${dt} run ${runKey}`).toBeGreaterThanOrEqual(wall.maxZ + PLAYER.radius - 1e-6);
        expect(s.z).toBeLessThan(wall.maxZ + PLAYER.radius + 0.01);
      }
    }
  });

  it('slides along a wall when walking into it at an angle', () => {
    // Facing north-west: blocked northwards, still moving west.
    const s = run(createPlayerState(0, 0, Math.PI / 4), { forward: 1 }, 4, 1 / 60, mapOf([wall]));
    expect(s.z).toBeCloseTo(wall.maxZ + PLAYER.radius, 3);
    expect(s.x).toBeLessThan(-2);
  });

  it('never ends a step inside or across any wall, whatever the input (property test)', () => {
    const rng = createRng(5);
    for (let trial = 0; trial < 200; trial++) {
      // A small room: four walls around a 4 m square, plus a pillar.
      const boxes: Box[] = [
        { minX: -2.1, maxX: 2.1, minZ: -2.1, maxZ: -1.9 },
        { minX: -2.1, maxX: 2.1, minZ: 1.9, maxZ: 2.1 },
        { minX: -2.1, maxX: -1.9, minZ: -2.1, maxZ: 2.1 },
        { minX: 1.9, maxX: 2.1, minZ: -2.1, maxZ: 2.1 },
        { minX: 0.4, maxX: 0.8, minZ: 0.4, maxZ: 0.8 },
      ];
      let s = createPlayerState(-1, -1, rng.float() * 6.28);
      for (let frame = 0; frame < 300; frame++) {
        const keys = { forward: rng.pick([1, 1, 0, -1]), turn: rng.pick([0, 0, 1, -1]), run: rng.chance(0.5) };
        s = stepPlayer(s, input(keys), rng.pick([1 / 120, 1 / 60, 0.05, 0.1]), mapOf(boxes));
        for (const box of boxes) expect(penetration(s.x, s.z, box)).toBeLessThan(1e-6);
        expect(Math.abs(s.x)).toBeLessThan(1.9);
        expect(Math.abs(s.z)).toBeLessThan(1.9);
      }
    }
  });
});
