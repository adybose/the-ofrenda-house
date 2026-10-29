import { Vector3, type Camera, type Scene } from 'three';
import type { AudioEngine } from '../audio/engine';
import type { SoundName } from '../audio/synths';
import { events } from '../core/events';
import type { Flashlight } from '../lighting/flashlight';
import type { PlayerController } from '../player/controller';
import type { House } from '../world/house';
import type { ChunkDiff, ChunkId } from '../world/types';
import { worldToCell } from '../world/units';
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

  constructor(
    private readonly options: { seed: number; house: House; scene: Scene; camera: Camera; audio: AudioEngine; flashlight: Flashlight; player: PlayerController },
  ) {
    events.on('hazard', () => this.dispatch({ type: 'hazard' }));
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
    const toward = camera.position.clone();
    c.pose(0, from, toward);
    scene.add(c.group);
    this.active.push({ creature: c, t: 0, from, toward });
    const position: [number, number, number] = [trigger.x, trigger.y, trigger.z];
    audio.play('stinger', { gain: 0.9 });
    audio.play(CALL[trigger.kind], { position });
    events.emit('scareFired', { kind: trigger.kind, position, sounds: ['stinger', CALL[trigger.kind]] });
  }
}
