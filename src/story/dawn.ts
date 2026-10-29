import { Color, Mesh, type AmbientLight, type Scene } from 'three';
import type { AudioEngine } from '../audio/engine';
import type { CaseFile, CharacterId } from '../case/types';
import { events } from '../core/events';
import { STREAMS, createRng } from '../core/rng';
import { assignVoices } from '../dialogue/voices';
import type { PlayerController } from '../player/controller';
import type { TextureCache } from '../render/atlas';
import { GeometryBuilder } from '../render/builder';
import { addMarigolds } from '../render/props';
import { createSpirit, type Spirit } from '../render/spirit';
import type { Dialogue } from '../ui/dialogue-box';
import { showEnding } from '../ui/ending';
import { FRONT_DOOR_ID } from '../world/grid';
import type { House } from '../world/house';
import type { ChunkDiff } from '../world/types';
import { cellCentre, worldToCell } from '../world/units';
import { LAUGH_LINE, accusationOptions } from './accusation';
import { DAWN_LINES, dawnOutcome, pathHome } from './dawn-rules';
import { resolveEnding } from './flow';
import type { Monologue } from './thoughts';

declare module '../core/events' {
  interface GameEvents {
    dawnAnswered: { accusedId: CharacterId; correct: boolean };
  }
}

declare global {
  interface Window {
    __dawn?: { stage(): DawnStage; petals(): number };
  }
}

export type DawnStage = 'night' | 'pending' | 'asking' | 'free' | 'over';

/** Seconds for the grey of dawn to come up. */
const DAWN_LIGHT_SECONDS = 3;
const DAWN_COLOUR = new Color(0x8a93a6);
const DAWN_INTENSITY = 0.9;

/**
 * Dawn (spec 22): at six, if the player is still in the house, the night ends; the patriarch asks
 * one last time who did it. The right name stops the house, opens the way back and the front door,
 * and marigolds mark the path; a wrong one traps the player for good.
 */
export class Dawn {
  private current: DawnStage = 'night';
  private patriarch: Spirit | undefined;
  private fade: 'in' | 'out' | undefined;
  private light = 0;
  private petalCount = 0;
  private readonly from = new Color();
  private fromIntensity = 0;

  constructor(
    private readonly options: {
      seed: number;
      caseFile: CaseFile;
      house: House;
      scene: Scene;
      textures: TextureCache;
      player: PlayerController;
      dialogue: Dialogue;
      audio: AudioEngine;
      monologue: Monologue;
      ambient: AmbientLight | undefined;
      applyDiff(diff: ChunkDiff): void;
      named(): boolean;
      toldTheTruth(): boolean;
      holdControls(held: boolean): void;
    },
  ) {
    events.on('dawn', () => {
      if (this.current === 'night') this.current = 'pending';
    });
    events.on('doorOpened', ({ doorId }) => {
      if (doorId === FRONT_DOOR_ID && this.current === 'free') this.leave();
    });
  }

  get stage(): DawnStage {
    return this.current;
  }

  /** The patriarch is speaking: La Sombra, scares, hazards and thoughts hold off. */
  isActive(): boolean {
    return this.current === 'asking';
  }

  /** The night is over: La Sombra is gone for good. */
  over(): boolean {
    return this.current !== 'night';
  }

  petals(): number {
    return this.petalCount;
  }

  /** Each frame. `blocked`: an encounter, dialogue, the journal or an ending is on screen. */
  update(dt: number, time: number, blocked: boolean): void {
    if (this.current === 'pending' && !blocked) void this.ask();
    const { ambient } = this.options;
    if (ambient && this.current !== 'night' && this.current !== 'pending' && this.light < 1) {
      this.light = Math.min(1, this.light + dt / DAWN_LIGHT_SECONDS);
      ambient.color.copy(this.from).lerp(DAWN_COLOUR, this.light);
      ambient.intensity = this.fromIntensity + (DAWN_INTENSITY - this.fromIntensity) * this.light;
    }
    const spirit = this.patriarch;
    if (!spirit) return;
    spirit.update(time);
    if (this.fade === 'in') spirit.setFade(spirit.fade + dt / 1.2);
    if (this.fade === 'out') {
      spirit.setFade(spirit.fade - dt / 1.5);
      if (spirit.fade <= 0) {
        spirit.removeFromParent();
        spirit.dispose();
        this.patriarch = undefined;
      }
    }
  }

  private async ask(): Promise<void> {
    this.current = 'asking';
    const { caseFile, seed, scene, player, dialogue, audio, holdControls, ambient } = this.options;
    holdControls(true);
    if (ambient) {
      this.from.copy(ambient.color);
      this.fromIntensity = ambient.intensity;
    }
    // He stands before the player in the grey light.
    const character = caseFile.characters.find((c) => c.role === 'patriarch')!;
    const p = player.state();
    const [x, z] = [p.x - Math.sin(p.yaw) * 2, p.z - Math.cos(p.yaw) * 2];
    const spirit = createSpirit(character, createRng(seed).fork(STREAMS.render).fork(`spirit:${character.id}`));
    spirit.position.set(x, 0, z);
    spirit.rotation.y = Math.atan2(p.x - x, p.z - z);
    scene.add(spirit);
    this.patriarch = spirit;
    this.fade = 'in';
    const voice = assignVoices(seed, caseFile.characters)[character.id];
    const say = (line: string) => dialogue.say({ speaker: character.name, line, voice });

    let accusedId = caseFile.killerId;
    if (!this.options.named()) {
      void say(DAWN_LINES.ask);
      const names = accusationOptions(caseFile).map((id) => ({ id, text: caseFile.characters.find((c) => c.id === id)!.name }));
      accusedId = (await dialogue.choose(names)) as CharacterId;
    }
    const outcome = dawnOutcome(accusedId, caseFile.killerId);
    events.emit('dawnAnswered', { accusedId, correct: outcome === 'free' });
    audio.play('laugh', { position: [x, 1.6, z], gain: 1.3 });
    await dialogue.say({ speaker: character.name, line: LAUGH_LINE });
    await say(outcome === 'free' ? DAWN_LINES.free : DAWN_LINES.trapped);
    dialogue.close();

    if (outcome === 'trapped') {
      this.current = 'over';
      showEnding('trapped');
      events.emit('ending', { kind: 'trapped' });
      return;
    }
    this.setFree();
    this.fade = 'out';
    holdControls(false);
  }

  /** The rooms stop moving, the way back opens, the front door unseals, and marigolds mark the way. */
  private setFree(): void {
    const { house, applyDiff, player, scene, textures, monologue } = this.options;
    this.current = 'free';
    house.freeze();
    applyDiff(house.reopenAct1Corridor());
    house.unsealFrontDoor();
    const p = player.state();
    const path = pathHome(house, worldToCell(p.x, p.z));
    const b = new GeometryBuilder();
    for (const cell of path) {
      const [cx, cz] = cellCentre(cell);
      addMarigolds(b, textures, cx, cz, 0.35, 0.012);
    }
    if (path.length) {
      const petals = new Mesh(b.build(), textures.material);
      petals.name = 'petals-home';
      petals.receiveShadow = true;
      scene.add(petals);
    }
    this.petalCount = path.length;
    monologue.dawnFree();
  }

  /** Out through the front door into the morning: the true or the escape ending. */
  private leave(): void {
    this.current = 'over';
    setTimeout(() => {
      const kind = resolveEnding({ named: true, toldTheTruth: this.options.toldTheTruth(), caught: false, dawnWrong: false });
      showEnding(kind);
      events.emit('ending', { kind });
    }, 1200);
  }
}
