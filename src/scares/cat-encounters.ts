import { BoxGeometry, LatheGeometry, Mesh, MeshLambertMaterial, Vector2, Vector3, type Camera, type Scene } from 'three';
import type { AudioEngine } from '../audio/engine';
import { events } from '../core/events';
import { createRng, STREAMS, type Rng } from '../core/rng';
import type { PlayerController } from '../player/controller';
import { furnishRoom } from '../world/furniture';
import { DIR_STEP } from '../world/grid';
import type { ChunkDiff, ChunkId } from '../world/types';
import { placeCats, type CatSeat } from './cats';
import { createCreature, type Creature } from './creatures';

declare module '../core/events' {
  interface GameEvents {
    /** A startled cat knocked a vase (or a picture) to the floor (spec 24). */
    vaseShattered: { position: [number, number, number] };
  }
}

/** It meows now and then while the player is this near... */
const HEARD = 8;
/** ...and leaps down and bolts if they come this close. */
const TOO_CLOSE = 1.5;

const porcelain = new MeshLambertMaterial({ color: 0xc8d2e0 });
const frameWood = new MeshLambertMaterial({ color: 0x5a3a22 });
const pictureShape = new BoxGeometry(0.3, 0.38, 0.03);
const vaseShape = new LatheGeometry(
  [
    [0.0, 0],
    [0.05, 0],
    [0.07, 0.06],
    [0.06, 0.16],
    [0.03, 0.22],
    [0.04, 0.26],
  ].map(([r, y]) => new Vector2(r!, y!)),
  8,
);

interface Cat {
  seat: CatSeat;
  chunkId: ChunkId;
  creature: Creature;
  /** The vase beside it, or (once startled, if there was none) a small picture off the wall above. */
  vase?: Mesh;
  /** Where the falling thing starts from. */
  fallFrom?: number;
  meowIn: number;
  /** Seconds since it was startled; undefined while it sits. */
  fled?: number;
  vaseFall?: number;
}

/**
 * Cats in the house (spec 24): sitting on furniture with glowing eyes, meowing now and then; startled
 * by an opened door or a player too close, they scream, leap down and bolt, and a vase goes over.
 */
export class CatEncounters {
  private readonly cats = new Map<string, Cat>();
  /** Cats that have bolted stay gone for the run. */
  private readonly gone = new Set<string>();
  private readonly rng: Rng;

  constructor(private readonly options: { seed: number; scene: Scene; camera: Camera; audio: AudioEngine; player: PlayerController; all?: boolean }) {
    this.rng = createRng(options.seed).fork(STREAMS.scares).fork('cats');
  }

  seats(): CatSeat[] {
    return [...this.cats.values()].filter((c) => c.fled === undefined).map((c) => c.seat);
  }

  sync(diff: ChunkDiff): void {
    for (const id of [...diff.unloaded, ...diff.loaded.map((c) => c.id)]) {
      for (const [roomId, cat] of this.cats) {
        if (cat.chunkId !== id) continue;
        cat.creature.group.removeFromParent();
        cat.vase?.removeFromParent();
        this.cats.delete(roomId);
      }
    }
    for (const chunk of diff.loaded) {
      for (const room of chunk.rooms) {
        if (this.gone.has(room.id)) continue;
        for (const seat of placeCats(room, furnishRoom(room, this.options.seed), this.options.seed, this.options.all)) {
          const creature = createCreature('cat');
          this.sit(creature, seat);
          this.options.scene.add(creature.group);
          let vase: Mesh | undefined;
          if (seat.vase) {
            vase = new Mesh(vaseShape, porcelain);
            vase.position.set(seat.vase.x, seat.vase.y, seat.vase.z);
            this.options.scene.add(vase);
          }
          this.cats.set(room.id, { seat, chunkId: chunk.id, creature, vase, meowIn: 6 + this.rng.float() * 12 });
        }
      }
    }
  }

  /** The player opened the door of `roomId`: if a cat sits there, it's startled. */
  startle(roomId: string): boolean {
    const cat = this.cats.get(roomId);
    if (!cat || cat.fled !== undefined) return false;
    this.bolt(cat);
    return true;
  }

  update(dt: number): void {
    const { player, audio } = this.options;
    const p = player.state();
    for (const [roomId, cat] of this.cats) {
      const { seat, creature } = cat;
      if (cat.fled === undefined) {
        const d = Math.hypot(seat.x - p.x, seat.z - p.z);
        // Watching the player, eyes glowing.
        creature.group.lookAt(p.x, seat.y, p.z);
        if (d <= TOO_CLOSE) this.bolt(cat);
        else if (d <= HEARD && (cat.meowIn -= dt) <= 0) {
          cat.meowIn = 12 + this.rng.float() * 13;
          audio.play('cat', { position: [seat.x, seat.y + 0.2, seat.z], gain: 0.9 });
        }
        continue;
      }
      // Leaping down and away, then gone.
      cat.fled += dt;
      const k = Math.min(1, cat.fled / 0.9);
      const away = new Vector3(seat.x - p.x, 0, seat.z - p.z).normalize();
      const [wx, wz] = DIR_STEP[seat.wall];
      // Along the wall, away from the player, not into it.
      const along = new Vector3(-wz, 0, wx);
      if (along.dot(away) < 0) along.negate();
      creature.group.position.set(seat.x + along.x * k * 2.5, seat.y * (1 - k) + Math.sin(k * Math.PI) * 0.35, seat.z + along.z * k * 2.5);
      creature.group.lookAt(creature.group.position.clone().add(along));
      if (cat.vase && cat.vaseFall !== undefined) {
        cat.vaseFall += dt;
        const v = Math.min(1, cat.vaseFall / 0.45);
        cat.vase.position.y = (cat.fallFrom ?? seat.y) * (1 - v * v);
        cat.vase.rotation.z = (Math.PI / 2) * v;
        if (v >= 1) {
          const at: [number, number, number] = [cat.vase.position.x, 0.05, cat.vase.position.z];
          cat.vase.removeFromParent();
          cat.vase = undefined;
          audio.play('shatter', { position: at, gain: 1.3 });
          events.emit('vaseShattered', { position: at });
        }
      }
      if (k >= 1 && !cat.vase) {
        creature.group.removeFromParent();
        this.cats.delete(roomId);
        this.gone.add(roomId);
      }
    }
  }

  private sit(creature: Creature, seat: CatSeat): void {
    // Crouched, glaring: the first moment of its scare pose, lifted onto the furniture.
    const [wx, wz] = DIR_STEP[seat.wall];
    const from = new Vector3(seat.x, 0, seat.z);
    creature.pose(0.1, from, new Vector3(seat.x - wx, 0, seat.z + wz));
    creature.group.position.y = seat.y;
  }

  private bolt(cat: Cat): void {
    cat.fled = 0;
    const at: [number, number, number] = [cat.seat.x, cat.seat.y + 0.2, cat.seat.z];
    this.options.audio.play('catScream', { position: at, gain: 1.2 });
    this.options.audio.play('stinger', { gain: 0.6 });
    events.emit('scareFired', { kind: 'cat', position: at, sounds: ['catScream', 'stinger'] });
    if (!cat.vase) {
      // No vase: a small picture comes down off the wall above where it sat.
      const [wx, wz] = DIR_STEP[cat.seat.wall];
      const picture = new Mesh(pictureShape, frameWood);
      picture.position.set(cat.seat.x + wx * 0.3, 1.45, cat.seat.z - wz * 0.3);
      picture.rotation.y = Math.atan2(-wx, wz);
      this.options.scene.add(picture);
      cat.vase = picture;
      cat.fallFrom = 1.45;
    }
    cat.vaseFall = 0;
  }
}

