import type { Object3D, Scene } from 'three';
import type { AudioEngine } from '../audio/engine';
import { events } from '../core/events';
import { createRng, STREAMS, type Rng } from '../core/rng';
import type { Flashlight } from '../lighting/flashlight';
import type { PlayerController } from '../player/controller';
import type { DoorController } from '../player/doors';
import type { Box, CollisionMap } from '../player/movement';
import type { TextureCache } from '../render/atlas';
import { props } from '../render/props';
import type { House } from '../world/house';
import type { DoorId } from '../world/types';
import { ROOM_HEIGHT, cellCentre, worldToCell } from '../world/units';

export type HazardKind = 'crash' | 'door' | 'torch';

declare module '../core/events' {
  interface GameEvents {
    hazard: { kind: HazardKind; position: [number, number, number] };
  }
}

/** Seconds between hazards at threat 0 (shorter as it grows bolder), and before the first. */
const COOLDOWN = 45;
const FIRST = 60;
/** The creak comes this long before the hazard. */
const WARNING = 0.5;
/** A crash lands this far ahead, never closer. */
const AHEAD = [2, 4] as const;
/** A fallen chandelier or mirror blocks the way this long, a slammed door stays jammed this long. */
const BLOCKS = 25;
const JAMMED = 20;
const FALL = 0.45;

interface Falling {
  mesh: Object3D;
  from: number;
  to: number;
  kind: 'chandelier' | 'mirror';
  elapsed: number;
  box: Box;
  left: number;
}

/**
 * La Sombra's hazards (spec 12): a chandelier or mirror crashing down a few metres ahead, a door
 * slamming and jamming, the torch dying. One at a time, each after a creak, never on the player:
 * they scare and block, they don't harm.
 */
export class Hazards implements CollisionMap {
  private readonly rng: Rng;
  private nextIn = FIRST;
  private pending: { at: number; fire(): void } | undefined;
  private readonly falling: Falling[] = [];
  private readonly jammed = new Map<DoorId, number>();
  private clock = 0;

  constructor(
    private readonly options: {
      seed: number;
      house: House;
      doors: DoorController;
      flashlight: Flashlight;
      audio: AudioEngine;
      player: PlayerController;
      scene: Scene;
      textures: TextureCache;
    },
  ) {
    this.rng = createRng(options.seed).fork(STREAMS.shadow).fork('hazards');
  }

  /** Each frame. `active`: La Sombra is about (stalking or hunting) and nothing holds it off. */
  update(dt: number, active: boolean, threat: number): void {
    this.clock += dt;
    if (this.pending && this.clock >= this.pending.at) {
      const { fire } = this.pending;
      this.pending = undefined;
      fire();
    }
    for (const f of [...this.falling]) {
      f.elapsed += dt;
      const k = Math.min(1, f.elapsed / FALL);
      if (f.kind === 'chandelier') f.mesh.position.y = f.from + (f.to - f.from) * k * k;
      else f.mesh.rotation.x = -(Math.PI / 2) * k * k;
      if ((f.left -= dt) <= 0) {
        f.mesh.removeFromParent();
        this.falling.splice(this.falling.indexOf(f), 1);
      }
    }
    for (const [doorId, left] of this.jammed) {
      if (left - dt > 0) this.jammed.set(doorId, left - dt);
      else {
        this.jammed.delete(doorId);
        this.options.house.holdShut(doorId, false);
      }
    }
    if (!active || this.pending) return;
    if ((this.nextIn -= dt) > 0) return;
    this.nextIn = (COOLDOWN / (1 + 0.3 * threat)) * (0.7 + 0.6 * this.rng.float());
    const kinds: HazardKind[] = ['crash', 'door', 'torch'];
    for (const kind of this.rng.shuffle(kinds)) if (this.fire(kind)) break;
  }

  /** Sets one off (after its creak). Returns false when there's nowhere for it now. */
  fire(kind: HazardKind): boolean {
    const plan = kind === 'crash' ? this.planCrash() : kind === 'door' ? this.planDoor() : this.planTorch();
    if (!plan) return false;
    this.options.audio.play('creak', { position: plan.position, gain: 1.2 });
    this.pending = {
      at: this.clock + WARNING,
      fire: () => {
        plan.fire();
        events.emit('hazard', { kind, position: plan.position });
      },
    };
    return true;
  }

  boxesNear(x: number, z: number, radius: number): readonly Box[] {
    return this.falling.map((f) => f.box).filter((b) => b.minX - radius < x && x < b.maxX + radius && b.minZ - radius < z && z < b.maxZ + radius);
  }

  /** A point on open floor 2 to 4 m ahead of the player, with nothing but open doorways between. */
  private aheadOfPlayer(): { x: number; z: number; forward: [number, number] } | undefined {
    const { house, player } = this.options;
    const p = player.state();
    const forward: [number, number] = [-Math.sin(p.yaw), -Math.cos(p.yaw)];
    for (const d of [3, 2.5, 3.5, AHEAD[0], AHEAD[1]]) {
      let clear = true;
      let last = worldToCell(p.x, p.z);
      for (let s = 0.25; s <= d + 0.6 && clear; s += 0.25) {
        const cell = worldToCell(p.x + forward[0] * s, p.z + forward[1] * s);
        if (cell === last) continue;
        const [a, b] = [house.roomAt(last), house.roomAt(cell)];
        if (!b) clear = false;
        else if (a?.id !== b.id && house.doorBetween(last, cell)?.state !== 'open') clear = false;
        last = cell;
      }
      if (clear) return { x: p.x + forward[0] * d, z: p.z + forward[1] * d, forward };
    }
    return undefined;
  }

  private planCrash(): { position: [number, number, number]; fire(): void } | undefined {
    const spot = this.aheadOfPlayer();
    if (!spot) return undefined;
    const { house, scene, textures, audio } = this.options;
    const room = house.roomAt(worldToCell(spot.x, spot.z));
    const height = ROOM_HEIGHT[room?.size ?? 'medium'];
    const mirror = this.rng.chance(0.3);
    return {
      position: [spot.x, height - 0.3, spot.z],
      fire: () => {
        const group: Object3D = mirror ? props.mirror(textures) : props.chandelier(textures);
        if (mirror) {
          // Stood across the way facing the player, it tips away from them and smashes flat.
          group.position.set(spot.x, 0, spot.z);
          group.rotation.order = 'YXZ';
          group.rotation.y = Math.atan2(-spot.forward[0], -spot.forward[1]);
        } else {
          group.position.set(spot.x, height, spot.z);
          group.rotation.z = 0.25;
        }
        scene.add(group);
        const half = mirror ? 1.2 : 0.45;
        const [cx, cz] = mirror ? [spot.x + spot.forward[0] * 1.1, spot.z + spot.forward[1] * 1.1] : [spot.x, spot.z];
        this.falling.push({
          mesh: group,
          from: height,
          to: 0.78,
          kind: mirror ? 'mirror' : 'chandelier',
          elapsed: 0,
          box: { minX: cx - half, maxX: cx + half, minZ: cz - half, maxZ: cz + half },
          left: BLOCKS,
        });
        setTimeout(() => {
          audio.play('slam', { position: [spot.x, 0.5, spot.z], gain: 1.5 });
          audio.play('stinger', { gain: 0.8 });
        }, FALL * 1000);
      },
    };
  }

  /** A door near the player, not one they stand in, slams shut and jams. */
  private planDoor(): { position: [number, number, number]; fire(): void } | undefined {
    const { house, doors, player } = this.options;
    const p = player.state();
    const here = worldToCell(p.x, p.z);
    const near = house
      .loadedChunks()
      .flatMap((c) => c.doors)
      .filter((d) => (d.state === 'open' || d.state === 'closed') && d.a !== here && d.b !== here && d.id !== 'front-door')
      .map((d) => {
        const [ax, az] = cellCentre(d.a);
        const [bx, bz] = cellCentre(d.b);
        return { door: d, x: (ax + bx) / 2, z: (az + bz) / 2 };
      })
      .filter((d) => Math.hypot(d.x - p.x, d.z - p.z) <= 6 && !house.keyRooms().some((k) => k.doorId === d.door.id));
    if (!near.length) return undefined;
    const chosen = this.rng.pick(near);
    return {
      position: [chosen.x, 1.2, chosen.z],
      fire: () => {
        if (house.getDoor(chosen.door.id)?.state === 'open') doors.force(chosen.door.id, false);
        if (house.holdShut(chosen.door.id, true)) this.jammed.set(chosen.door.id, JAMMED);
      },
    };
  }

  private planTorch(): { position: [number, number, number]; fire(): void } | undefined {
    const { flashlight, player } = this.options;
    if (!flashlight.on) return undefined;
    const p = player.state();
    const seconds = 2 + this.rng.float() * 2;
    return { position: [p.x, 1.6, p.z], fire: () => flashlight.kill(seconds) };
  }
}

