import { BoxGeometry, Float32BufferAttribute, Group, Mesh, MeshLambertMaterial, PlaneGeometry, type Object3D, type Scene } from 'three';
import type { AudioEngine } from '../audio/engine';
import { events } from '../core/events';
import { createRng, STREAMS, type Rng } from '../core/rng';
import type { Flashlight } from '../lighting/flashlight';
import type { PlayerController } from '../player/controller';
import type { DoorController } from '../player/doors';
import type { Box, CollisionMap } from '../player/movement';
import type { TextureCache } from '../render/atlas';
import { props } from '../render/props';
import { paintingSpot } from '../scares/door-scares';
import { DIR_STEP } from '../world/grid';
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
  elapsed: number;
  /** Poses it for k, 0 (hanging) to 1 (down). */
  animate(k: number): void;
  box?: Box;
  left: number;
}

declare module '../core/events' {
  interface GameEvents {
    /** A chandelier brought down by bats the player startled (spec 24). */
    chandelierFell: { position: [number, number, number] };
  }
}

const frameWood = new MeshLambertMaterial({ color: 0x5a3a22 });

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
      f.animate(Math.min(1, f.elapsed / FALL));
      if ((f.left -= dt) <= 0) {
        f.mesh.removeFromParent();
        // Each painting and chandelier builds its own geometry; the materials are shared.
        f.mesh.traverse((o) => {
          if (o instanceof Mesh) o.geometry.dispose();
        });
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
    return this.falling.flatMap((f) => (f.box ? [f.box] : [])).filter((b) => b.minX - radius < x && x < b.maxX + radius && b.minZ - radius < z && z < b.maxZ + radius);
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

  /**
   * La Sombra's crash (spec 24): a painting comes down off the wall the player is facing, 1.2 to 3 m
   * ahead, so they see it fall; when they face no such wall, nothing.
   */
  private planCrash(): { position: [number, number, number]; fire(): void } | undefined {
    const { house, player, scene, textures, audio } = this.options;
    const p = player.state();
    const room = house.roomAt(worldToCell(p.x, p.z));
    const spot = room ? paintingSpot(room, p) : undefined;
    if (!spot) return undefined;
    const [dx, dy] = DIR_STEP[spot.side];
    // Hung on the wall's face (the cell's edge less the wall's inset), facing into the room.
    const [wx, wz] = [spot.x - dx * 0.14, spot.z + dy * 0.14];
    return {
      position: [wx, 1.6, wz],
      fire: () => {
        const painting = new Group();
        const frame = new Mesh(new BoxGeometry(0.72, 0.92, 0.05), frameWood);
        const rect = textures.portraitUv('smile');
        const plane = new PlaneGeometry(0.6, 0.8);
        const uv = plane.getAttribute('uv');
        uv.setXY(0, rect.u0, rect.vTop);
        uv.setXY(1, rect.u1, rect.vTop);
        uv.setXY(2, rect.u0, rect.vBottom);
        uv.setXY(3, rect.u1, rect.vBottom);
        plane.setAttribute('color', new Float32BufferAttribute(new Array(12).fill(1), 3));
        const picture = new Mesh(plane, textures.portraitMaterial);
        picture.position.z = 0.03;
        // Pivot at the bottom edge, so it tips forward off the wall as it drops.
        frame.position.y = 0.46;
        picture.position.y = 0.46;
        painting.add(frame, picture);
        painting.rotation.order = 'YXZ';
        painting.rotation.y = Math.atan2(-dx, dy);
        painting.position.set(wx, 1.2, wz);
        scene.add(painting);
        this.falling.push({
          mesh: painting,
          elapsed: 0,
          animate: (k) => {
            painting.position.y = 1.2 * (1 - k * k);
            painting.rotation.x = (Math.PI / 2.4) * k * k;
          },
          left: BLOCKS,
        });
        setTimeout(() => {
          audio.play('slam', { position: [wx, 0.3, wz], gain: 1.3 });
          audio.play('stinger', { gain: 0.8 });
        }, FALL * 1000);
      },
    };
  }

  /**
   * A chandelier comes crashing down at (x, z) (spec 24: bats startled by the player opening a door
   * bring it down in front of them). It blocks the way for a while.
   */
  dropChandelier(x: number, z: number): void {
    const { house, scene, textures, audio } = this.options;
    const height = ROOM_HEIGHT[house.roomAt(worldToCell(x, z))?.size ?? 'medium'];
    const chandelier = props.chandelier(textures);
    chandelier.position.set(x, height, z);
    chandelier.rotation.z = 0.25;
    scene.add(chandelier);
    const half = 0.45;
    this.falling.push({
      mesh: chandelier,
      elapsed: 0,
      animate: (k) => (chandelier.position.y = height + (0.78 - height) * k * k),
      box: { minX: x - half, maxX: x + half, minZ: z - half, maxZ: z + half },
      left: BLOCKS,
    });
    audio.play('creak', { position: [x, height - 0.3, z], gain: 1.2 });
    setTimeout(() => {
      audio.play('slam', { position: [x, 0.5, z], gain: 1.5 });
      audio.play('stinger', { gain: 0.8 });
      events.emit('chandelierFell', { position: [x, 0.5, z] });
    }, FALL * 1000);
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

