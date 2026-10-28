/** Movement and collision, pure so they can be tested without three.js. */

export const PLAYER = {
  /** The player is a circle this wide (metres). */
  radius: 0.3,
  walkSpeed: 1.4,
  runMultiplier: 1.8,
  /** Radians per second for the arrow keys. */
  turnRate: 2.2,
  /** Radians per second for Page Up and Page Down. */
  pitchRate: 1.4,
  pitchLimit: (80 * Math.PI) / 180,
  /** Movement is split into steps no longer than this, well under the radius, so walls can't be skipped. */
  maxSubstep: 0.05,
  strideWalk: 0.75,
  strideRun: 1.0,
  bobWalk: 0.035,
  bobRun: 0.055,
} as const;

/** x is east, z is south (north is -z). yaw 0 faces north; positive yaw turns left. */
export interface PlayerState {
  x: number;
  z: number;
  yaw: number;
  pitch: number;
  /** Distance walked since the last footstep. */
  stride: number;
  /** Footsteps so far; the controller emits a footstep event when this goes up. */
  steps: number;
  /** Vertical head-bob offset in metres. */
  bob: number;
  running: boolean;
}

export interface InputState {
  /** 1 forward, -1 back. */
  forward: number;
  /** 1 turns left, -1 right. */
  turn: number;
  run: boolean;
  /** 1 looks up, -1 down (Page Up and Page Down). */
  pitch: number;
  /** Mouse look this frame, in radians. */
  lookYaw: number;
  lookPitch: number;
}

export const NO_INPUT: InputState = { forward: 0, turn: 0, run: false, pitch: 0, lookYaw: 0, lookPitch: 0 };

/** An axis-aligned solid in world metres (x and z). */
export interface Box {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

export interface CollisionMap {
  /** Solids that could touch a circle of `radius` at (x, z). */
  boxesNear(x: number, z: number, radius: number): readonly Box[];
}

export function createPlayerState(x: number, z: number, yaw: number): PlayerState {
  return { x, z, yaw, pitch: 0, stride: 0, steps: 0, bob: 0, running: false };
}

const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), hi);

/** Pushes a circle out of every box it overlaps. A few passes settle corners. */
function resolve(x: number, z: number, map: CollisionMap): [number, number] {
  const r = PLAYER.radius;
  for (let pass = 0; pass < 4; pass++) {
    let moved = false;
    for (const box of map.boxesNear(x, z, r)) {
      const cx = clamp(x, box.minX, box.maxX);
      const cz = clamp(z, box.minZ, box.maxZ);
      const dx = x - cx;
      const dz = z - cz;
      const distance = Math.hypot(dx, dz);
      if (distance >= r) continue;
      moved = true;
      if (distance > 1e-9) {
        x = cx + (dx / distance) * r;
        z = cz + (dz / distance) * r;
      } else {
        // The centre is inside the box: leave by the nearest face.
        const exits = [
          { d: x - box.minX, x: box.minX - r, z },
          { d: box.maxX - x, x: box.maxX + r, z },
          { d: z - box.minZ, x, z: box.minZ - r },
          { d: box.maxZ - z, x, z: box.maxZ + r },
        ].sort((a, b) => a.d - b.d);
        x = exits[0]!.x;
        z = exits[0]!.z;
      }
    }
    if (!moved) break;
  }
  return [x, z];
}

/** One frame of movement: turn, look, then walk in small steps, sliding off walls. */
export function stepPlayer(state: PlayerState, input: InputState, dt: number, map: CollisionMap): PlayerState {
  const yaw = state.yaw + input.turn * PLAYER.turnRate * dt + input.lookYaw;
  const pitch = clamp(state.pitch + input.pitch * PLAYER.pitchRate * dt + input.lookPitch, -PLAYER.pitchLimit, PLAYER.pitchLimit);
  const running = input.run && input.forward !== 0;
  const speed = PLAYER.walkSpeed * (running ? PLAYER.runMultiplier : 1) * Math.sign(input.forward);
  const dx = -Math.sin(yaw) * speed * dt;
  const dz = -Math.cos(yaw) * speed * dt;

  let x = state.x;
  let z = state.z;
  const length = Math.hypot(dx, dz);
  const substeps = Math.max(1, Math.ceil(length / PLAYER.maxSubstep));
  for (let i = 0; i < substeps; i++) [x, z] = resolve(x + dx / substeps, z + dz / substeps, map);

  // Footsteps and bob follow the distance actually covered, so walking into a wall is silent.
  const covered = Math.hypot(x - state.x, z - state.z);
  const strideLength = running ? PLAYER.strideRun : PLAYER.strideWalk;
  let stride = state.stride + covered;
  let steps = state.steps;
  while (stride >= strideLength) {
    stride -= strideLength;
    steps++;
  }
  const bob = covered > 1e-6 ? Math.abs(Math.sin((stride / strideLength) * Math.PI)) * (running ? PLAYER.bobRun : PLAYER.bobWalk) : 0;
  return { x, z, yaw, pitch, stride, steps, bob, running };
}
