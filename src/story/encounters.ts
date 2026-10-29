import { type PerspectiveCamera, type Scene, Vector3 } from 'three';
import type { AudioEngine } from '../audio/engine';
import type { CaseFile, Character, CharacterId } from '../case/types';
import { events } from '../core/events';
import { STREAMS, createRng } from '../core/rng';
import { fetchLine, prefetchLines, type LineQuery } from '../dialogue/lines';
import { draw } from '../dialogue/replies';
import { applyReply, initialTrust, STARTING_TRUST, type TrustState } from '../dialogue/trust';
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
import { cellCentre } from '../world/units';
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
  }
}

/** Seconds to fade a spirit in, and out. */
const FADE_IN = 1.2;
const FADE_OUT = 1.6;
/** Seconds to turn the camera to face the spirit. */
const TURN = 0.8;
/** Key rooms this many rooms away or nearer have their lines (and speech) prepared ahead. */
const PREFETCH_ROOMS = 2;
/** The spirit appears this far in front of the player, towards the middle of its room. */
const APPEAR_DISTANCE = 2.8;
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
  private active: Active | undefined;
  private leaving: { spirit: Spirit; gone(): void }[] = [];
  private readonly forward = new Vector3();

  constructor(options: EncountersOptions) {
    this.options = options;
    this.voices = assignVoices(options.seed, options.caseFile.characters);
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
    // It appears a little way in from the doorway, between the player and the middle of the room.
    const [sx, sy] = slotOfCell(...parseCell(room.cells[0]!));
    const [cx, cz] = cellCentre(cellId(sx * SLOT_CELLS + 2, sy * SLOT_CELLS + 2));
    const here = player.state();
    const toCentre = Math.hypot(cx - here.x, cz - here.z) || 1;
    const reach = Math.min(APPEAR_DISTANCE, toCentre);
    const [x, z] = [here.x + ((cx - here.x) / toCentre) * reach, here.z + ((cz - here.z) / toCentre) * reach];

    const spirit = createSpirit(character, createRng(seed).fork(STREAMS.render).fork(`spirit:${character.id}`));
    spirit.position.set(x, 0, z);
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
    audio.play('whisper', { position: [x, 1.6, z] });

    const voice = this.voices[character.id];
    const say = (line: string) => dialogue.say({ speaker: character.name, line, voice });
    const ask = (step: LineQuery['step'], extra: Partial<LineQuery> = {}) => fetchLine(seed, caseFile, { characterId: character.id, step, trust: this.state().trust, ...extra });

    await say((await ask('greeting')).line);
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
    this.dispatch({ type: 'ended' });
    dialogue.close();

    // It fades, at peace or in silence. Once it has gone its keys lie by its candle, whichever it
    // was, so a locked room never becomes unreachable (spec 18), and a solved spirit's candle lights.
    const keyIds = this.state().keyIds;
    this.leaving.push({
      spirit,
      gone: () => {
        for (const keyId of keyIds) events.emit('keyAwarded', { keyId });
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
