import { type PerspectiveCamera, type Scene, Vector3 } from 'three';
import type { AudioEngine } from '../audio/engine';
import type { CaseFile, Character, CharacterId } from '../case/types';
import { events } from '../core/events';
import { STREAMS, createRng } from '../core/rng';
import { fetchLine, prefetchLines, type LineQuery } from '../dialogue/lines';
import { draw } from '../dialogue/replies';
import { applyReply, initialTrust, STARTING_TRUST, trustBucket, type TrustState } from '../dialogue/trust';
import { assignVoices } from '../dialogue/voices';
import type { Flashlight } from '../lighting/flashlight';
import type { PlayerController } from '../player/controller';
import { createSpirit, type Spirit } from '../render/spirit';
import { clueCardFrom } from '../ui/clue-card';
import type { Dialogue } from '../ui/dialogue-box';
import type { Journal } from '../ui/journal';
import { SLOT_CELLS, cellId, parseCell, slotOfCell } from '../world/grid';
import type { House } from '../world/house';
import type { CellId, Room } from '../world/types';
import { CELL_SIZE, WALL_INSET, cellCentre } from '../world/units';
import { DIR_STEP } from '../world/grid';
import { ACCUSE_LINES, EXIT_KEY, LAUGH_LINE, accusationKey, accusationOptions, enoughClues } from './accusation';
import { encounterReducer, encounterSetup, startEncounter, type EncounterEmit, type EncounterEvent, type EncounterState } from './encounter';

declare module '../core/events' {
  interface GameEvents {
    encounterStarted: { characterId: CharacterId };
    encounterEnded: { characterId: CharacterId; outcome: 'reward' | 'silence' };
    clueAwarded: { factId: string };
    /** A key laid on the spirit's table once it has gone (spec 18). */
    keyAwarded: { keyId: string };
    riddleFailed: { characterId: CharacterId };
    /** True while an encounter runs: the Shadow and the scares hold off (specs 12 and 13). */
    encounterActive: { active: boolean };
    /** Spec 21: the player named someone as the killer to a spirit. */
    accused: { characterId: CharacterId; accusedId: CharacterId; correct: boolean; key?: string };
    spiritLaughed: { characterId: CharacterId };
    exitKeyAwarded: Record<string, never>;
  }
}

/** Seconds to fade a spirit in, and out. */
const FADE_IN = 1.2;
const FADE_OUT = 2.0;
/** Seconds to drift in through the wall behind the portrait (spec 19). */
const DRIFT_IN = 2.2;
/** How far beyond a wall the spirit starts, or ends up when it leaves. */
const BEYOND_WALL = 0.75;
/** Seconds to turn the camera to face the spirit. */
const TURN = 0.8;
/** Key rooms this many rooms away or nearer have their lines (and speech) prepared ahead. */
const PREFETCH_ROOMS = 2;
/** The spirit stops this far in front of the player, towards its portrait (or the middle of its room). */
const APPEAR_DISTANCE = 2.2;
/** The torch beam lights a spirit within this angle (radians) of the view and this distance. */
const BEAM = { angle: 0.32, distance: 9 };

const shortestAngle = (from: number, to: number) => Math.atan2(Math.sin(to - from), Math.cos(to - from));

export interface EncountersOptions {
  seed: number;
  caseFile: CaseFile;
  house: House;
  scene: Scene;
  camera: PerspectiveCamera;
  player: PlayerController;
  dialogue: Dialogue;
  journal: Journal;
  audio: AudioEngine;
  flashlight: Flashlight;
  /** Called when an encounter starts or ends, to turn the player's controls off and on. */
  onActiveChange(active: boolean): void;
  /** Called once the spirit has gone: its candle lights on a reward, and its keys are laid on its table (spec 18). */
  onSpiritLeft?(left: { characterId: CharacterId; outcome: 'reward' | 'silence'; keyIds: readonly string[] }): void;
  /** Debug (`&clues=all`): count every clue as held, so the first spirit set at peace asks who did it. */
  allClues?: boolean;
}

interface Active {
  character: Character;
  spirit: Spirit;
  state: EncounterState;
  turn: { from: number; to: number; elapsed: number };
  fading: 'in' | 'out' | undefined;
}

/**
 * The spirits' encounters (spec 11). Entering a key room whose spirit is unresolved fades the spirit
 * in, turns the player to face it and runs the steps through the reducer (`encounter.ts`): its lines
 * come from the local server or the fallbacks, its choices through the dialogue box, and what it
 * emits goes to the event bus and the journal; once it has gone, its keys are laid on its table (spec 18).
 * Each spirit's encounter runs once per run.
 */
export class Encounters {
  private readonly options: EncountersOptions;
  private readonly voices: ReturnType<typeof assignVoices>;
  private readonly resolved = new Set<CharacterId>();
  private readonly prefetched = new Set<CharacterId>();
  private trustState: TrustState = initialTrust();
  /** Spec 21: the clues held, the riddles solved, whether the killer has been named, and the keys handed out. */
  private readonly held = new Set<string>();
  private solvedCount = 0;
  private killerNamed = false;
  private readonly given = new Set<string>();
  private active: Active | undefined;
  private leaving: { spirit: Spirit; gone(): void }[] = [];
  /** Where the current spirit came through the wall from, and where it stopped (debug). */
  private entering: { from: Vector3; to: Vector3; wall?: { point: Vector3; inward: Vector3 } } | undefined;
  private readonly forward = new Vector3();

  constructor(options: EncountersOptions) {
    this.options = options;
    this.voices = assignVoices(options.seed, options.caseFile.characters);
    if (options.allClues) for (const fact of options.caseFile.facts) this.held.add(fact.id);
  }

  /** Whether the player has named the killer to a spirit (spec 21; spec 22 asks at dawn otherwise). */
  named(): boolean {
    return this.killerNamed;
  }

  /** The player's standing with every spirit, and whether they've ever lied (spec 14's true ending). */
  get trust(): TrustState {
    return this.trustState;
  }

  isActive(): boolean {
    return this.active !== undefined;
  }

  /** The current encounter's step, for tests. */
  step(): string | undefined {
    return this.active?.state.step;
  }

  /** Where the current spirit drifted in from and to, for tests. */
  entrance(): { from: Vector3; to: Vector3; wall?: { point: Vector3; inward: Vector3 } } | undefined {
    return this.active ? this.entering : undefined;
  }

  /** A spirit on its way out through a wall, if any (for tests). */
  leavingSpirit(): Spirit | undefined {
    return this.leaving[this.leaving.length - 1]?.spirit;
  }

  /** The spirit on screen, if any (for tests). */
  spirit(): Spirit | undefined {
    return this.active?.spirit;
  }

  /** When the player moves to a new cell: prepare nearby spirits, and start one on entering its room. */
  enterCell(cell: CellId): void {
    const { house, seed } = this.options;
    const near = house.distancesFrom(cell, PREFETCH_ROOMS);
    for (const keyRoom of house.keyRooms()) {
      const id = keyRoom.characterId;
      if (this.resolved.has(id) || this.prefetched.has(id) || !near.has(`key:${id}`)) continue;
      this.prefetched.add(id);
      prefetchLines(seed, [id], this.trustState.trust[id] ?? STARTING_TRUST);
    }
    const room = house.roomAt(cell);
    if (room?.kind === 'key' && room.characterId && !this.resolved.has(room.characterId) && !this.active) void this.run(room);
  }

  /** Each frame: the spirits' animation and fades, the turn to face the spirit, the torch beam. */
  update(dt: number, time: number): void {
    for (const leaving of [...this.leaving]) {
      const { spirit } = leaving;
      spirit.setFade(spirit.fade - dt / FADE_OUT);
      spirit.update(time);
      if (spirit.fade <= 0) {
        spirit.removeFromParent();
        spirit.dispose();
        this.leaving.splice(this.leaving.indexOf(leaving), 1);
        leaving.gone();
      }
    }
    const active = this.active;
    if (!active) return;
    const { spirit, turn } = active;
    if (active.fading === 'in') {
      spirit.setFade(spirit.fade + dt / FADE_IN);
      if (spirit.fade >= 1) active.fading = undefined;
    }
    if (turn.elapsed < TURN) {
      turn.elapsed = Math.min(TURN, turn.elapsed + dt);
      const k = turn.elapsed / TURN;
      const eased = k * k * (3 - 2 * k);
      const { x, z } = this.options.player.state();
      this.options.player.teleport(x, z, turn.from + shortestAngle(turn.from, turn.to) * eased);
    }
    // Brighter while the torch beam is on it.
    const { camera, flashlight } = this.options;
    camera.getWorldDirection(this.forward);
    const to = new Vector3(spirit.position.x - camera.position.x, spirit.position.y + 1.2 - camera.position.y, spirit.position.z - camera.position.z);
    const inBeam = flashlight.lit && to.length() < BEAM.distance && this.forward.angleTo(to) < BEAM.angle;
    spirit.setLit(spirit.lit + ((inBeam ? 1 : 0) - spirit.lit) * Math.min(1, dt * 4));
    spirit.update(time);
  }

  /** One spirit's whole encounter, from appearing to fading away. */
  private async run(room: Room): Promise<void> {
    const { caseFile, seed, house, scene, player, dialogue, audio, journal } = this.options;
    const character = caseFile.characters.find((c) => c.id === room.characterId)!;
    // It comes out through the wall behind its portrait (spec 19) and drifts towards the player,
    // stopping a little way in front of them; without a portrait, from beyond the room's middle.
    const here = player.state();
    const portrait = room.anchors.find((a) => a.kind === 'portrait' && a.side);
    let toward: [number, number];
    let from: Vector3;
    let wall: { point: Vector3; inward: Vector3 } | undefined;
    if (portrait) {
      const [px, pz] = cellCentre(portrait.cell);
      const [dx, dy] = DIR_STEP[portrait.side!];
      const face = CELL_SIZE / 2 - WALL_INSET;
      toward = [px + dx * face, pz - dy * face];
      from = new Vector3(px + dx * (face + BEYOND_WALL), 0, pz - dy * (face + BEYOND_WALL));
      wall = { point: new Vector3(toward[0], 0, toward[1]), inward: new Vector3(-dx, 0, dy) };
    } else {
      const [sx, sy] = slotOfCell(...parseCell(room.cells[0]!));
      toward = cellCentre(cellId(sx * SLOT_CELLS + 2, sy * SLOT_CELLS + 2));
      from = new Vector3(toward[0], 0, toward[1]);
    }
    const away = Math.hypot(toward[0] - here.x, toward[1] - here.z) || 1;
    const reach = Math.max(0.6, Math.min(APPEAR_DISTANCE, away - 0.8));
    const [x, z] = [here.x + ((toward[0] - here.x) / away) * reach, here.z + ((toward[1] - here.z) / away) * reach];
    if (!portrait) from.add(new Vector3(x - here.x, 0, z - here.z).normalize().multiplyScalar(1.5));

    const spirit = createSpirit(character, createRng(seed).fork(STREAMS.render).fork(`spirit:${character.id}`));
    const arrived = spirit.drift(from, new Vector3(x, 0, z), DRIFT_IN);
    this.entering = { from: from.clone(), to: new Vector3(x, 0, z), wall };
    scene.add(spirit);
    spirit.rotation.y = Math.atan2(here.x - x, here.z - z);
    const facing = Math.atan2(-(x - here.x), -(z - here.z));
    const setup = encounterSetup(caseFile, house.keyRooms(), character.id);
    this.active = {
      character,
      spirit,
      state: startEncounter({ ...setup, trust: this.trustState.trust[character.id] ?? STARTING_TRUST }),
      turn: { from: here.yaw, to: facing, elapsed: 0 },
      fading: 'in',
    };
    this.options.onActiveChange(true);
    events.emit('encounterActive', { active: true });
    this.emitAll(this.active.state.emits);
    audio.play('whisper', { position: [from.x, 1.6, from.z] });

    const voice = this.voices[character.id];
    const say = (line: string) => dialogue.say({ speaker: character.name, line, voice });
    const ask = (step: LineQuery['step'], extra: Partial<LineQuery> = {}) => fetchLine(seed, caseFile, { characterId: character.id, step, trust: this.state().trust, ...extra });

    // The greeting waits until it has come through the wall; its line is fetched meanwhile.
    const greeting = ask('greeting');
    await arrived;
    await say((await greeting).line);
    this.dispatch({ type: 'greeted' });

    const question = await ask('whoAreYou');
    void say(question.line);
    const replies = draw(createRng(seed).fork(STREAMS.dialogue), character.id);
    const chosen = await dialogue.choose(replies.map((r) => ({ id: r.id, text: r.text })));
    const reply = replies.find((r) => r.id === chosen) ?? replies[0]!;
    this.trustState = applyReply(this.trustState, character.id, reply);
    this.dispatch({ type: 'replied', reply });

    await say((await ask('reaction', { lastChoiceText: reply.text, lastChoiceCategory: reply.category })).line);
    this.dispatch({ type: 'reacted' });

    const riddle = (await ask('riddle')).riddle!;
    let line = riddle.question;
    while (this.state().step === 'riddle') {
      void say(line);
      const removed = this.state().removed;
      const options = riddle.options.map((text, i) => ({ id: String(i), text })).filter((o) => !removed.includes(Number(o.id)));
      const answer = Number(await dialogue.choose(options));
      this.dispatch({ type: 'answered', index: answer, correctIndex: riddle.correctIndex });
      line = 'Think again.';
    }

    const outcome = this.state().step;
    await say((await ask(outcome === 'reward' ? 'reward' : 'silence')).line);
    if (outcome === 'reward') this.solvedCount++;

    // Its own keys first (never one already handed out), so an answer's key is never the same one.
    const ownKeys = this.state().keyIds.filter((k) => !this.given.has(k));
    for (const keyId of ownKeys) this.given.add(keyId);
    // Spec 21: with enough clues, a spirit set at peace asks who did it, and laughs at the answer.
    let extraKey: string | undefined;
    if (outcome === 'reward' && !this.killerNamed && enoughClues(caseFile, [...this.held], this.solvedCount)) {
      void say(ACCUSE_LINES[trustBucket(this.state().trust)]);
      const names = accusationOptions(caseFile).map((id) => ({ id, text: caseFile.characters.find((c) => c.id === id)!.name }));
      const accusedId = (await dialogue.choose(names)) as CharacterId;
      const correct = accusedId === caseFile.killerId;
      if (correct) this.killerNamed = true;
      extraKey = accusationKey({ correct, locked: house.keyRooms(), given: this.given });
      events.emit('accused', { characterId: character.id, accusedId, correct, key: extraKey });
      audio.play('laugh', { position: [spirit.position.x, 1.6, spirit.position.z], gain: 1.3 });
      events.emit('spiritLaughed', { characterId: character.id });
      await dialogue.say({ speaker: character.name, line: LAUGH_LINE });
    }
    this.dispatch({ type: 'ended' });
    dialogue.close();

    // It leaves through the nearest wall, fading, at peace or in silence (spec 19). Once it has gone
    // its keys lie by its candle, whichever it was, so a locked room never becomes unreachable
    // (spec 18), and a solved spirit's candle lights. A key already handed out isn't laid twice.
    const keyIds = extraKey ? [...ownKeys, extraKey] : ownKeys;
    if (extraKey) this.given.add(extraKey);
    void spirit.drift(spirit.position.clone(), throughNearestWall(room, spirit.position), FADE_OUT);
    this.leaving.push({
      spirit,
      gone: () => {
        for (const keyId of keyIds) events.emit('keyAwarded', { keyId });
        if (keyIds.includes(EXIT_KEY)) events.emit('exitKeyAwarded', {});
        this.options.onSpiritLeft?.({ characterId: character.id, outcome: outcome === 'reward' ? 'reward' : 'silence', keyIds });
      },
    });
    this.resolved.add(character.id);
    journal.meet(character.id);
    this.active = undefined;
    this.options.onActiveChange(false);
    events.emit('encounterActive', { active: false });
  }

  private state(): EncounterState {
    return this.active!.state;
  }

  private dispatch(event: EncounterEvent): void {
    const active = this.active!;
    active.state = encounterReducer(active.state, event);
    this.emitAll(active.state.emits);
  }

  /** The reducer's outputs: to the event bus, and clues to the journal. */
  private emitAll(emits: readonly EncounterEmit[]): void {
    const { caseFile, journal } = this.options;
    for (const emit of emits) {
      switch (emit.name) {
        case 'encounterStarted':
          events.emit('encounterStarted', { characterId: emit.characterId });
          break;
        case 'clueAwarded': {
          const fact = caseFile.facts.find((f) => f.id === emit.factId);
          if (fact) journal.addClue(clueCardFrom(fact));
          this.held.add(emit.factId);
          events.emit('clueAwarded', { factId: emit.factId });
          break;
        }
        case 'keyAwarded':
          // Laid on the table once the spirit has gone (see `run`), not handed over here.
          break;
        case 'riddleFailed':
          events.emit('riddleFailed', { characterId: emit.characterId });
          break;
        case 'encounterEnded':
          events.emit('encounterEnded', { characterId: emit.characterId, outcome: emit.outcome });
          break;
      }
    }
  }
}

/** A point just beyond the room's wall nearest to `at`, straight out from it. */
function throughNearestWall(room: Room, at: Vector3): Vector3 {
  const xs = room.cells.map((c) => parseCell(c)[0]);
  const ys = room.cells.map((c) => parseCell(c)[1]);
  // The room's wall faces in world metres (north is -z).
  const west = Math.min(...xs) * CELL_SIZE + WALL_INSET;
  const east = (Math.max(...xs) + 1) * CELL_SIZE - WALL_INSET;
  const north = -(Math.max(...ys) + 1) * CELL_SIZE + WALL_INSET;
  const south = -Math.min(...ys) * CELL_SIZE - WALL_INSET;
  const exits = [
    { d: at.x - west, to: new Vector3(west - BEYOND_WALL, 0, at.z) },
    { d: east - at.x, to: new Vector3(east + BEYOND_WALL, 0, at.z) },
    { d: at.z - north, to: new Vector3(at.x, 0, north - BEYOND_WALL) },
    { d: south - at.z, to: new Vector3(at.x, 0, south + BEYOND_WALL) },
  ];
  return exits.reduce((best, e) => (e.d < best.d ? e : best)).to;
}
