import { Vector3, type Camera, type Scene } from 'three';
import type { AudioEngine } from '../audio/engine';
import type { SoundName } from '../audio/synths';
import { events } from '../core/events';
import { createRng } from '../core/rng';
import { doorScare, type DoorScare } from './door-scares';
import type { Flashlight } from '../lighting/flashlight';
import type { PlayerController } from '../player/controller';
import type { House } from '../world/house';
import type { ChunkDiff, ChunkId } from '../world/types';
import { cellCentre, worldToCell } from '../world/units';
import { createCreature, type Creature } from './creatures';
import { SCARES, createScareState, placeTriggers, scareScheduler, type ScareEvent, type ScareKind, type ScareState, type ScareTrigger } from './scheduler';

declare module '../core/events' {
  interface GameEvents {
    scareFired: { kind: ScareKind; position: [number, number, number]; sounds: SoundName[] };
  }
}

const CALL: Record<ScareKind, SoundName> = { bat: 'bat', rat: 'rat', cat: 'catScream' };

interface Active {
  creature: Creature;
  t: number;
  from: Vector3;
  toward: Vector3;
}

/**
 * Jump scares in the house (spec 13): triggers placed in the loaded rooms set a creature loose when
 * the player walks up to one or turns the torch on it, as the pure scheduler allows; a story script
 * can force one. Each burst plays a stinger and the creature's own call.
 */
export class Scares {
  private state: ScareState = createScareState();
  private readonly triggers = new Map<ChunkId, ScareTrigger[]>();
  private readonly active: Active[] = [];
  private readonly pool: Creature[] = [];
  private room: string | undefined;
  private now = 0;
  private readonly forward = new Vector3();

  private blocked = false;
  private doorsOpened = 0;

  constructor(
    private readonly options: {
      seed: number;
      house: House;
      scene: Scene;
      camera: Camera;
      audio: AudioEngine;
      flashlight: Flashlight;
      player: PlayerController;
      /** Brings a room's chandelier down (spec 24's door scare): it hangs at `cell`. */
      dropChandelier?(x: number, z: number, cell: string): void;
      /** Debug (`&doorscare=`): the scare behind every door the player opens. */
      forceDoorScare?: DoorScare;
      /** Spec 24's cats: a startled cat takes the place of a door scare. Returns whether one was there. */
      startleCat?(roomId: string): boolean;
    },
  ) {
    events.on('hazard', () => this.dispatch({ type: 'hazard' }));
    events.on('doorOpened', ({ doorId, byPlayer }) => {
      if (byPlayer) this.doorOpened(doorId);
    });
  }

  /**
   * The player has opened a door (spec 24): sometimes something bursts out of the room beyond, bats
   * (bringing the chandelier down in front of them) or rats, as the cooldown allows.
   */
  private doorOpened(doorId: string): void {
    const { house, player, camera } = this.options;
    const door = house.getDoor(doorId);
    if (!door || this.blocked) return;
    const p = player.state();
    const here = house.roomAt(worldToCell(p.x, p.z))?.id;
    const beyond = [door.a, door.b].map((c) => house.roomAt(c)).find((r) => r && r.id !== here);
    if (!beyond) return;
    if (this.options.startleCat?.(beyond.id)) return;
    const n = this.doorsOpened++;
    const scare = doorScare(beyond, createRng(this.options.seed).fork('door-scares').fork(`${doorId}:${n}`), this.options.forceDoorScare);
    if (!scare) return;
    // Into the room: from the doorway, along the way the player faces.
    const fx = -Math.sin(p.yaw);
    const fz = -Math.cos(p.yaw);
    const [ax, az] = cellCentre(door.a);
    const [bx, bz] = cellCentre(door.b);
    const [mx, mz] = [(ax + bx) / 2, (az + bz) / 2];
    const kind: ScareKind = scare === 'rats' ? 'rat' : 'bat';
    const at = kind === 'bat' ? { x: mx + fx * 3, y: 2.2, z: mz + fz * 3 } : { x: mx + fx * 2.5, y: 0.1, z: mz + fz * 2.5 };
    const trigger: ScareTrigger = { id: `door:${doorId}:${n}`, kind, roomId: beyond.id, ...at };
    const before = this.state.lastAt;
    this.dispatch(this.options.forceDoorScare ? { type: 'force', trigger } : { type: 'trip', trigger, blocked: false });
    if (this.state.lastAt === before) return;
    // More of them behind the first, through the doorway at the player.
    const more = scare === 'rats' ? 1 : 1 + createRng(this.options.seed).fork('door-bats').fork(String(n)).int(0, 1);
    for (let i = 1; i <= more; i++) {
      const side = i % 2 ? 0.5 : -0.5;
      this.looseExtra(kind, { x: at.x + fz * side + fx * 0.6 * i, y: at.y - 0.2 * i, z: at.z - fx * side + fz * 0.6 * i }, camera.position.clone());
    }
    // The room's own chandelier, in front of the player as they open the door, comes crashing down.
    const chandelier = beyond.anchors.find((a) => a.kind === 'chandelier');
    if (scare === 'batsChandelier' && chandelier) this.options.dropChandelier?.(...cellCentre(chandelier.cell), chandelier.cell);
  }

  /** Another creature in the same burst (no stinger of its own). */
  private looseExtra(kind: ScareKind, at: { x: number; y: number; z: number }, camera: Vector3): void {
    if (this.active.length >= SCARES.maxActive) return;
    const index = this.pool.findIndex((c) => c.kind === kind);
    const c = index >= 0 ? this.pool.splice(index, 1)[0]! : createCreature(kind);
    const from = new Vector3(at.x, at.y, at.z);
    // Rats run at the player: "away from" a point behind where they start.
    const toward = kind === 'rat' ? from.clone().multiplyScalar(2).sub(camera).setY(0) : camera;
    c.pose(0, from, toward);
    this.options.scene.add(c.group);
    this.active.push({ creature: c, t: 0, from, toward });
    this.options.audio.play(CALL[kind], { position: [at.x, at.y, at.z], gain: 0.8 });
  }

  sync(diff: ChunkDiff): void {
    for (const id of diff.unloaded) this.triggers.delete(id);
    for (const chunk of diff.loaded) this.triggers.set(chunk.id, chunk.rooms.flatMap((r) => placeTriggers(r, this.options.seed)));
  }

  activeCount(): number {
    return this.active.length;
  }

  allTriggers(): ScareTrigger[] {
    return [...this.triggers.values()].flat();
  }

  /** Each frame: the player's room, the triggers they set off, and the creatures already loose. */
  update(dt: number, blocked: boolean): void {
    this.now += dt;
    this.blocked = blocked;
    const { house, player, flashlight, camera } = this.options;
    const p = player.state();
    const room = house.roomAt(worldToCell(p.x, p.z))?.id;
    if (room !== this.room) {
      this.room = room;
      if (room) this.dispatch({ type: 'enterRoom', roomId: room });
    }
    if (room) {
      camera.getWorldDirection(this.forward);
      for (const trigger of this.allTriggers()) {
        if (trigger.roomId !== room || this.state.used.has(trigger.id)) continue;
        const to = new Vector3(trigger.x - camera.position.x, trigger.y - camera.position.y, trigger.z - camera.position.z);
        const near = Math.hypot(trigger.x - p.x, trigger.z - p.z) <= SCARES.tripRadius;
        const lit = flashlight.lit && to.length() <= SCARES.beamRange && this.forward.angleTo(to) <= SCARES.beamAngle;
        if (near || lit) this.dispatch({ type: 'trip', trigger, blocked });
      }
    }
    for (const a of [...this.active]) {
      a.t += dt;
      if (a.t >= a.creature.seconds) {
        a.creature.group.removeFromParent();
        this.active.splice(this.active.indexOf(a), 1);
        this.pool.push(a.creature);
        continue;
      }
      a.creature.pose(a.t, a.from, a.toward);
    }
  }

  /** Sets a creature loose at `at` (a story script, or debug). `force` ignores the cooldown and the rest. */
  fire(kind: ScareKind, at: { x: number; y: number; z: number }, opts: { force?: boolean } = {}): boolean {
    const trigger: ScareTrigger = { id: `script:${kind}:${this.now.toFixed(3)}`, kind, roomId: this.room ?? '', ...at };
    const before = this.state.lastAt;
    this.dispatch(opts.force ? { type: 'force', trigger } : { type: 'trip', trigger, blocked: false });
    return this.state.lastAt !== before;
  }

  private dispatch(event: ScareEvent): void {
    const { state, fire } = scareScheduler(this.state, event, this.now);
    this.state = state;
    if (fire) this.loose(fire);
  }

  private loose(trigger: ScareTrigger): void {
    if (this.active.length >= SCARES.maxActive) return;
    const creature = this.pool.findIndex((c) => c.kind === trigger.kind);
    const c = creature >= 0 ? this.pool.splice(creature, 1)[0]! : createCreature(trigger.kind);
    const { camera, scene, audio } = this.options;
    const from = new Vector3(trigger.x, trigger.y, trigger.z);
    // A rat from a doorway runs at the player (it runs "away from" a point behind where it starts).
    const toward = trigger.id.startsWith('door:') && trigger.kind === 'rat' ? from.clone().multiplyScalar(2).sub(camera.position).setY(0) : camera.position.clone();
    c.pose(0, from, toward);
    scene.add(c.group);
    this.active.push({ creature: c, t: 0, from, toward });
    const position: [number, number, number] = [trigger.x, trigger.y, trigger.z];
    audio.play('stinger', { gain: 0.9 });
    audio.play(CALL[trigger.kind], { position });
    events.emit('scareFired', { kind: trigger.kind, position, sounds: ['stinger', CALL[trigger.kind]] });
  }
}
