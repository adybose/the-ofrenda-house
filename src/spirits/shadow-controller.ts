import type { Scene } from 'three';
import type { AudioEngine } from '../audio/engine';
import type { Speaker } from '../audio/voice';
import { events } from '../core/events';
import { createRng, STREAMS, type Rng } from '../core/rng';
import { SHADOW_VOICE } from '../dialogue/voices';
import type { ItemsController } from '../items/controller';
import type { Flashlight } from '../lighting/flashlight';
import type { PlayerController } from '../player/controller';
import type { DoorController } from '../player/doors';
import type { Caption } from '../ui/caption';
import type { House } from '../world/house';
import type { CellId } from '../world/types';
import { cellCentre, worldToCell } from '../world/units';
import { ShadowFigure } from './shadow-figure';
import { PRESENT, SHADOW, chooseSpawn, createShadow, findPath, shadowReducer, speedFor, type ShadowMode, type ShadowState, type SpawnCandidate } from './shadow';
import { fetchTaunt } from './taunts';

declare module '../core/events' {
  interface GameEvents {
    shadowStateChanged: { state: ShadowMode };
    /** La Sombra caught a player in the dark: the possessed ending (spec 14). */
    caughtByShadow: Record<string, never>;
  }
}

/** Seconds between repaths. */
const REPATH = 0.5;
/** Seconds to fade in and out. */
const FADE = 0.6;
/** It sees no further than this. */
const SIGHT = 14;
/** Doors from the player's room within which it may appear. */
const SPAWN_DOORS = 6;

export interface ShadowOptions {
  seed: number;
  house: House;
  items: ItemsController;
  flashlight: Flashlight;
  audio: AudioEngine;
  speaker: Speaker;
  doors: DoorController;
  player: PlayerController;
  scene: Scene;
  caption: Caption;
  /** Encounters, the journal, dialogue: it holds off. */
  suppressed(): boolean;
  /** How frightening its nearness is, 0..1 (spec 24's fear holds at least this). */
  onTension?(level: number): void;
}

/**
 * La Sombra in the house (spec 12): the pure `shadowReducer` decides what it does; this moves the
 * figure along A* paths (never into a sanctuary), opens doors in its way, whispers, speaks its
 * threats and taunts, and drives the heartbeat and the torch's flicker from how near it is.
 */
export class ShadowController {
  private state: ShadowState;
  private readonly figure = new ShadowFigure();
  private readonly rng: Rng;
  private x = 0;
  private z = 0;
  private path: CellId[] = [];
  /** The path ignoring sanctuaries: to tell whether it can see the player through a door. */
  private sightPath: CellId[] = [];
  private repath = 0;
  private enabled = false;
  private speaking = false;

  constructor(private readonly options: ShadowOptions) {
    this.state = createShadow(createRng(options.seed).fork(STREAMS.shadow).seed);
    this.rng = createRng(options.seed).fork(STREAMS.shadow).fork('controller');
    options.scene.add(this.figure);
    events.on('riddleFailed', () => this.dispatch({ type: 'riddleFailed' }));
    // Each hour the clock strikes (spec 14), it grows bolder.
    events.on('hourStruck', () => this.dispatch({ type: 'hourPassed' }));
    events.on('accused', ({ correct }) => {
      if (!correct) this.dispatch({ type: 'wrongName' });
    });
  }

  get mode(): ShadowMode {
    return this.state.mode;
  }

  get threat(): number {
    return this.state.threat;
  }

  /** Act 2 has begun. */
  enable(): void {
    this.enabled = true;
    this.dispatch({ type: 'enable' });
  }

  /** Straight-line metres to the player while it is in the house; Infinity when it isn't. */
  distance(): number {
    if (!PRESENT.has(this.state.mode)) return Infinity;
    const p = this.options.player.state();
    return Math.hypot(this.x - p.x, this.z - p.z);
  }

  position(): [number, number] {
    return [this.x, this.z];
  }

  setThreat(threat: number): void {
    this.state = { ...this.state, threat: Math.max(0, Math.min(SHADOW.maxThreat, threat)) };
  }

  /** Debug: appear about `metres` from the player along a path, in `mode`. Returns false when there is nowhere. */
  summon(metres: number, mode: ShadowMode = 'hunting'): boolean {
    const { house } = this.options;
    const p = this.options.player.state();
    const playerCell = worldToCell(p.x, p.z);
    const cells = house.loadedChunks().flatMap((c) => c.rooms.flatMap((r) => r.cells));
    const ranked = cells
      .map((cell) => {
        const [x, z] = cellCentre(cell);
        return { cell, x, z, off: Math.abs(Math.hypot(x - p.x, z - p.z) - metres) };
      })
      .sort((a, b) => a.off - b.off);
    for (const c of ranked.slice(0, 40)) {
      // Never inside a sanctuary, but the player may be in one: it comes to the threshold.
      if (this.blocked(c.cell) || !findPath(house, c.cell, playerCell)) continue;
      this.x = c.x;
      this.z = c.z;
      this.path = [];
      this.repath = 0;
      this.dispatch({ type: 'force', mode });
      this.figure.setFade(1);
      return true;
    }
    return false;
  }

  update(dt: number, time: number): void {
    this.figure.update(time);
    if (!this.enabled) return;
    const { player, items, flashlight, suppressed } = this.options;
    const p = player.state();
    const playerCell = worldToCell(p.x, p.z);
    const hushed = suppressed();

    const present = PRESENT.has(this.state.mode);
    if (present) this.move(dt, p.x, p.z, playerCell);
    const distance = present ? Math.hypot(this.x - p.x, this.z - p.z) : Infinity;
    this.dispatch({
      type: 'tick',
      dt,
      sees: present && this.sees(distance, playerCell),
      distance,
      inLight: items.inLight(flashlight.lit, playerCell),
      suppressed: hushed,
    });

    const shown = PRESENT.has(this.state.mode);
    this.figure.setFade(this.figure.fade + (shown ? dt : -dt) / FADE);
    this.figure.position.set(this.x, 0, this.z);
    this.figure.rotation.y = Math.atan2(p.x - this.x, p.z - this.z);
    const near = shown ? Math.min(1, Math.max(0, 1 - (distance - 2) / 16)) : 0;
    this.options.onTension?.(this.state.mode === 'chasing' ? Math.max(0.85, near) : near * 0.6);
    flashlight.setFlicker(this.state.mode === 'chasing' && distance < 8 ? 0.8 * (1 - distance / 8) : 0);
  }

  /** Cells of a sanctuary: a solved spirit's room whose candle burns (spec 18). */
  private readonly blocked = (cell: CellId): boolean => {
    const room = this.options.house.roomAt(cell);
    return room !== undefined && this.options.items.isSanctuary(room.id);
  };

  private move(dt: number, px: number, pz: number, playerCell: CellId): void {
    const { house, doors } = this.options;
    const here = worldToCell(this.x, this.z);
    if ((this.repath -= dt) <= 0) {
      this.repath = REPATH;
      this.sightPath = findPath(house, here, playerCell) ?? [];
      // Into a sanctuary it can't go: it comes as far as the threshold and waits there.
      const safe = findPath(house, here, playerCell, this.blocked);
      if (safe) this.path = safe;
      else {
        const stop = this.sightPath.findIndex((c) => this.blocked(c));
        this.path = stop > 0 ? this.sightPath.slice(0, stop) : [here];
      }
    }
    const reachesPlayer = this.path.at(-1) === playerCell;
    const distance = Math.hypot(this.x - px, this.z - pz);
    const speed =
      this.state.mode === 'confronting' ? (distance > SHADOW.confrontDistance + 0.5 ? speedFor(this.state.threat, 'hunting') : 0) : speedFor(this.state.threat, this.state.mode);
    let step = speed * dt;
    if (step <= 0) return;
    // Follow the path cell by cell; in the player's own cell or the next, go straight for them.
    const index = this.path.indexOf(here);
    const nextCell = this.path[index + 1];
    let tx: number;
    let tz: number;
    if (reachesPlayer && this.path.length - index <= 2) [tx, tz] = [px, pz];
    else if (nextCell) [tx, tz] = cellCentre(nextCell);
    else [tx, tz] = cellCentre(here);
    const dx = tx - this.x;
    const dz = tz - this.z;
    const d = Math.hypot(dx, dz);
    if (d < 1e-3) return;
    step = Math.min(step, d);
    const [nx, nz] = [this.x + (dx / d) * step, this.z + (dz / d) * step];
    const into = worldToCell(nx, nz);
    if (into !== here) {
      if (this.blocked(into)) return;
      // It opens closed doors in its way.
      const door = house.doorBetween(here, into);
      if (door?.state === 'closed') doors.force(door.id, true);
      else if (door && door.state !== 'open') return;
      else if (!door && house.roomAt(into)?.id !== house.roomAt(here)?.id) return;
    }
    this.x = nx;
    this.z = nz;
  }

  /** The same room, or the next one through an open door, within sight. */
  private sees(distance: number, playerCell: CellId): boolean {
    if (distance > SIGHT) return false;
    const { house } = this.options;
    const here = worldToCell(this.x, this.z);
    const mine = house.roomAt(here)?.id;
    if (mine === house.roomAt(playerCell)?.id) return true;
    const path = this.sightPath;
    let crossings = 0;
    for (let i = 1; i < path.length; i++) {
      if (house.roomAt(path[i]!)?.id === house.roomAt(path[i - 1]!)?.id) continue;
      if (++crossings > 1 || house.doorBetween(path[i - 1]!, path[i]!)?.state !== 'open') return false;
    }
    return crossings === 1;
  }

  private dispatch(event: Parameters<typeof shadowReducer>[1]): void {
    const before = this.state.mode;
    this.state = shadowReducer(this.state, event);
    if (this.state.mode !== before) events.emit('shadowStateChanged', { state: this.state.mode });
    for (const emit of this.state.emits) {
      if (emit === 'appear' && event.type !== 'force') this.appear();
      else if (emit === 'whisper') this.whisper();
      else if (emit === 'threaten' || emit === 'taunt') void this.say();
      else if (emit === 'caught') events.emit('caughtByShadow', {});
    }
  }

  /** Comes out of the dark at least 8 m away, out of view, somewhere it can reach the player from. */
  private appear(): void {
    const { house, player } = this.options;
    const p = player.state();
    const playerCell = worldToCell(p.x, p.z);
    const playerRoom = house.roomAt(playerCell)?.id ?? '';
    const doors = house.distancesFrom(playerCell, SPAWN_DOORS);
    const candidates: SpawnCandidate[] = [];
    for (const chunk of house.loadedChunks()) {
      for (const room of chunk.rooms) {
        const d = doors.get(room.id);
        if (d === undefined || this.options.items.isSanctuary(room.id)) continue;
        for (const cell of room.cells) {
          const [x, z] = cellCentre(cell);
          candidates.push({ cell, x, z, roomId: room.id, doors: d });
        }
      }
    }
    const viewer = { x: p.x, z: p.z, yaw: p.yaw, roomId: playerRoom };
    for (let tries = 0; tries < 8; tries++) {
      const spawn = chooseSpawn(candidates, viewer, this.rng.float());
      if (!spawn) break;
      if (findPath(house, spawn.cell, playerCell, this.blocked)) {
        [this.x, this.z] = [spawn.x, spawn.z];
        this.path = [];
        this.repath = 0;
        return;
      }
    }
    // Nowhere to come from: it waits, and stalks again.
    this.state = { ...createShadow(this.state.seed, this.state.threat), mode: 'stalking', nextWhisper: SHADOW.whisperSeconds[this.state.threat]! };
  }

  /** A whisper through the walls, somewhere 6 to 10 m off. */
  private whisper(): void {
    const p = this.options.player.state();
    const angle = this.rng.float() * Math.PI * 2;
    const reach = 6 + this.rng.float() * 4;
    this.options.audio.play('whisper', { position: [p.x + Math.cos(angle) * reach, 1.6, p.z + Math.sin(angle) * reach], gain: 0.8 });
  }

  /** A threat or a taunt, in its voice, at the figure, and as a caption. */
  private async say(): Promise<void> {
    if (this.speaking) return;
    this.speaking = true;
    const line = await fetchTaunt(this.options.seed, 'chase', this.rng.float());
    this.options.caption.show('La Sombra', line);
    await this.options.speaker.speak(line, SHADOW_VOICE, [this.x, 1.9, this.z]);
    setTimeout(() => (this.speaking = false), 1500);
  }
}
