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
import { parseCell } from '../world/grid';
import { cellCentre, worldToCell } from '../world/units';
import { ShadowFigure } from './shadow-figure';
import { PRESENT, SHADOW, chooseSpawn, createShadow, findPath, shadowReducer, speedFor, type ShadowMode, type ShadowState, type SpawnCandidate } from './shadow';
import { fetchTaunt } from './taunts';
import { DARK_LINES, FLEE_LINES, pickLine } from './lines';

declare module '../core/events' {
  interface GameEvents {
    shadowStateChanged: { state: ShadowMode };
    /** La Sombra caught a player in the dark: the possessed ending (spec 14). */
    caughtByShadow: Record<string, never>;
    /** It laughed at a player holding a light, before fleeing (spec 24). */
    shadowLaughed: Record<string, never>;
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
/** Spec 24: it steps out in front of the player at most this often... */
const AMBUSH_GAP = 60;
/** ...this far ahead of them... */
const AMBUSH_AHEAD = [5, 4.5, 5.5, 4, 6];
/** ...and darkness draws it this many seconds after the light goes out. */
const ATTRACT_DELAY = [5, 10] as const;
/** It flees a light this fast. */
const FLEE_SPEED = 2.6;

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
  /** Debug (`&sombra=door`): step out at every door the player opens. */
  alwaysAmbush?: boolean;
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
  private time = 0;
  private lastAmbush = -Infinity;
  /** Whether the player had light last frame (unknown at first: Act 2 begins in the dark, which draws nothing). */
  private wasLit: boolean | undefined;
  private attractAt: number | undefined;
  private recentLines: string[] = [];
  private lastCell: CellId | undefined;
  private lastStep: [number, number] | undefined;

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
    // Spec 24: it may step out in front of a player who opens a door.
    events.on('doorOpened', ({ byPlayer }) => {
      if (byPlayer) this.maybeAmbush();
    });
  }

  /** Sometimes (more often as it grows bolder) it steps out a few metres ahead of the player. */
  private maybeAmbush(): void {
    const { house, player, suppressed, alwaysAmbush } = this.options;
    if (!this.enabled || suppressed() || this.time - this.lastAmbush < (alwaysAmbush ? 0 : AMBUSH_GAP)) return;
    if (this.state.mode !== 'stalking' && this.state.mode !== 'withdrawn' && this.state.mode !== 'lost') return;
    if (!alwaysAmbush && !this.rng.chance(0.15 + 0.05 * this.state.threat)) return;
    const p = player.state();
    const playerCell = worldToCell(p.x, p.z);
    const [fx, fz] = [-Math.sin(p.yaw), -Math.cos(p.yaw)];
    for (const d of AMBUSH_AHEAD) {
      const [x, z] = [p.x + fx * d, p.z + fz * d];
      const cell = worldToCell(x, z);
      if (!house.roomAt(cell) || this.blocked(cell) || !findPath(house, cell, playerCell)) continue;
      this.lastAmbush = this.time;
      [this.x, this.z] = [x, z];
      this.path = [];
      this.repath = 0;
      this.dispatch({ type: 'ambush' });
      this.figure.setFade(0.6);
      return;
    }
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
    this.time += dt;
    const { player, items, flashlight, suppressed, house } = this.options;
    const p = player.state();
    const playerCell = worldToCell(p.x, p.z);
    const hushed = suppressed();
    const lit = items.inLight(flashlight.lit, playerCell);

    // Spec 24: darkness draws it, a few seconds after the light goes out, unless it comes back.
    if (this.wasLit === true && !lit) this.attractAt = this.time + ATTRACT_DELAY[0] + this.rng.float() * (ATTRACT_DELAY[1] - ATTRACT_DELAY[0]);
    if (lit) this.attractAt = undefined;
    this.wasLit = lit;
    if (this.attractAt !== undefined && this.time >= this.attractAt && !hushed) {
      this.attractAt = undefined;
      this.dispatch({ type: 'attract' });
    }

    // Spec 24: turning a corner in a corridor, it may be waiting round it.
    if (playerCell !== this.lastCell) {
      if (this.lastCell) {
        const [x0, y0] = parseCell(this.lastCell);
        const [x1, y1] = parseCell(playerCell);
        const step: [number, number] = [x1 - x0, y1 - y0];
        const corridor = house.roomAt(playerCell)?.kind === 'corridor';
        if (corridor && this.lastStep && (step[0] !== this.lastStep[0] || step[1] !== this.lastStep[1])) this.maybeAmbush();
        this.lastStep = step;
      }
      this.lastCell = playerCell;
    }

    const present = PRESENT.has(this.state.mode);
    // Faced with a light it flees, still visible as it goes (spec 24); otherwise it comes on.
    if (this.state.mode === 'confronting' || (this.state.mode === 'withdrawn' && this.figure.fade > 0)) this.flee(dt, p.x, p.z);
    else if (present) this.move(dt, p.x, p.z, playerCell);
    const distance = present ? Math.hypot(this.x - p.x, this.z - p.z) : Infinity;
    this.dispatch({
      type: 'tick',
      dt,
      sees: present && this.sees(distance, playerCell),
      distance,
      inLight: lit,
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

  /** Away from the player, through open floor only. */
  private flee(dt: number, px: number, pz: number): void {
    const dx = this.x - px;
    const dz = this.z - pz;
    const d = Math.hypot(dx, dz) || 1;
    const [nx, nz] = [this.x + (dx / d) * FLEE_SPEED * dt, this.z + (dz / d) * FLEE_SPEED * dt];
    if (this.options.house.roomAt(worldToCell(nx, nz))) [this.x, this.z] = [nx, nz];
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
      else if (emit === 'laugh') this.laugh();
      else if (emit === 'threaten') void this.say(FLEE_LINES);
      else if (emit === 'darkLine') void this.say(DARK_LINES);
      else if (emit === 'taunt') void this.say();
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

  /** Its laugh, deep and close, at a player who holds a light. */
  private laugh(): void {
    this.options.audio.play('laugh', { position: [this.x, 1.9, this.z], param: 0.55, gain: 1.8 });
    events.emit('shadowLaughed', {});
  }

  /** A line in its voice, at the figure, and as a caption: one of `lines`, or a chase taunt from the model. */
  private async say(lines?: readonly string[]): Promise<void> {
    if (this.speaking) return;
    this.speaking = true;
    let line: string;
    if (lines) {
      const picked = pickLine(lines, this.recentLines, this.rng);
      this.recentLines = picked.recent;
      line = picked.line;
    } else {
      line = await fetchTaunt(this.options.seed, 'chase', this.rng.float());
    }
    this.options.caption.show('La Sombra', line);
    await this.options.speaker.speak(line, SHADOW_VOICE, [this.x, 1.9, this.z]);
    setTimeout(() => (this.speaking = false), 1500);
  }
}
