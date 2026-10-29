import { Float32BufferAttribute, Group, Mesh, PlaneGeometry, type Scene } from 'three';
import type { AudioEngine } from '../audio/engine';
import type { Speaker } from '../audio/voice';
import type { CaseFile } from '../case/types';
import { events } from '../core/events';
import { STREAMS, createRng } from '../core/rng';
import { assignVoices } from '../dialogue/voices';
import type { Lightning } from '../lighting/lightning';
import type { PlayerController } from '../player/controller';
import type { TextureCache } from '../render/atlas';
import { createSpirit, type Spirit } from '../render/spirit';
import type { Scares } from '../scares/scares';
import type { Caption } from '../ui/caption';
import type { Dialogue } from '../ui/dialogue-box';
import type { Hud } from '../ui/hud';
import { showTitle } from '../ui/title';
import { DIR_STEP, parseCell } from '../world/grid';
import type { House } from '../world/house';
import type { ChunkDiff } from '../world/types';
import { CELL_SIZE, WALL_INSET, cellCentre, worldToCell } from '../world/units';
import { DAWN_MINUTES, clockLabel, gameClock } from './flow';
import type { Monologue } from './thoughts';

export type ActStage = 'off' | 'title' | 'prologue' | 'entrance' | 'portraits' | 'chase' | 'cornered' | 'act2';

declare module '../core/events' {
  interface GameEvents {
    actStage: { stage: ActStage };
    /** The grandfather clock strikes midnight: Act 2 begins (spec 14). */
    midnight: Record<string, never>;
    hourStruck: { hour: number };
    /** Six o'clock (spec 22 takes it from here). */
    dawn: Record<string, never>;
  }
}

declare global {
  interface Window {
    __story?: { stage(): ActStage; clock(): string };
  }
}

/** The patriarch's Act 1 lines, word for word from the story. */
export const PATRIARCH_LINES = {
  who: 'Who are you? How dare you enter my house?',
  another: "Another one. The house took you, as it took the others. Find the way out before the last candle burns down, or you'll hang on these walls with them.",
} as const;

const CAPTIONS = ['11 pm, 1 November.', 'Your car died on the mountain road, in the storm.', 'The only light was a mansion on the hill.'];
const CAPTION_SECONDS = 3.5;
/** Lightning in the portrait hall this often. */
const HALL_STRIKES = 4;
/** The faces stay changed this long after each flash. */
const FACES_SECONDS = 0.7;
/** In Act 1 the patriarch never comes closer than this: he can't catch the player. */
const KEEP_BACK = 1.8;
const PATRIARCH_SPEED = 2.3;

export interface StoryOptions {
  seed: number;
  caseFile: CaseFile;
  house: House;
  scene: Scene;
  textures: TextureCache;
  player: PlayerController;
  dialogue: Dialogue;
  speaker: Speaker;
  audio: AudioEngine;
  lightning: Lightning;
  scares: Scares;
  monologue: Monologue;
  hud: Hud;
  applyDiff(diff: ChunkDiff): void;
  /** Wakes La Sombra when Act 2 begins (unless `&shadow=0`). */
  wakeShadow(): void;
  /** Turns the player's controls off for the patriarch's last words. */
  holdControls(held: boolean): void;
  captions: { story: Caption; hint: Caption; line: Caption };
}

/** Is a cell in the portrait hall, or in the Act 1 corridor, by the wing's fixed layout (spec 03)? */
const inPortraitHall = (x: number, y: number) => x >= 5 && x <= 9 && y >= 5 && y <= 14;
const inCorridor = (x: number, y: number) => (x <= 4 && y === 12) || (x === 2 && y >= 2 && y <= 12) || (x <= 1 && y === 2);

/**
 * The story around the house (spec 14): the title and the prologue's captions, the scripted Act 1 in
 * the portrait hall and the corridor (shifting faces, the bat, the patriarch's chase and his words in
 * the dead end), and the clock from midnight to dawn.
 */
export class StoryFlow {
  private current: ActStage = 'off';
  private time = 0;
  private nextStrike = 0;
  private facesUntil = 0;
  private batDone = false;
  private shifted = false;
  private patriarch: Spirit | undefined;
  private fadingOut = false;
  private elapsed = 0;
  private lastHour = 0;
  private dawned = false;
  private readonly faces: Mesh[] = [];
  private emptyFrame: Mesh | undefined;
  private readonly voice;

  constructor(private readonly options: StoryOptions) {
    this.voice = assignVoices(options.seed, options.caseFile.characters)[this.patriarchCharacter().id]!;
    this.buildPortraitOverlays();
  }

  get stage(): ActStage {
    return this.current;
  }

  /** The scripted parts: La Sombra, scares and thoughts hold off. */
  isActive(): boolean {
    return this.current !== 'off' && this.current !== 'act2';
  }

  /** Normal play: the title screen first, then the prologue's captions. */
  title(): void {
    this.enter('title');
    showTitle(() => this.prologue());
  }

  prologue(): void {
    this.enter('prologue');
    CAPTIONS.forEach((line, i) => setTimeout(() => this.options.captions.story.show('', line, CAPTION_SECONDS - 0.3), i * CAPTION_SECONDS * 1000));
  }

  /** The door has slammed behind the player (or `?skip=prologue` starts in the hall). */
  inside(): void {
    this.enter('entrance');
    this.options.captions.hint.show('', 'F: switch on your torch', 7);
  }

  /** Midnight: Act 2, the clock from `at` ms. */
  startAct2(at = 0): void {
    this.enter('act2');
    this.elapsed = at;
    this.lastHour = gameClock(at).hour;
    events.emit('midnight', {});
    this.options.monologue.think('findCandle');
    this.options.wakeShadow();
    this.showClock();
  }

  clockLabel(): string {
    const c = gameClock(this.elapsed);
    return clockLabel(c.hour, c.minute);
  }

  update(dt: number, time: number): void {
    this.time += dt;
    this.patriarch?.update(time);
    if (this.current === 'act2') return this.tickClock(dt);
    const { player } = this.options;
    const p = player.state();
    const [x, y] = parseCell(worldToCell(p.x, p.z));

    for (const face of this.faces) face.visible = this.time < this.facesUntil && face.userData.changes === true;

    if (this.current === 'entrance' && inPortraitHall(x, y)) {
      this.enter('portraits');
      this.nextStrike = this.time + 0.6;
    }
    if (this.current === 'portraits') {
      // Lightning, and between the flashes the faces have moved.
      if (this.time >= this.nextStrike) {
        this.nextStrike = this.time + HALL_STRIKES;
        this.options.lightning.strike({ strength: 0.8, distanceKm: 1.2 });
        const rng = createRng(this.options.seed).fork(STREAMS.render).fork(`faces:${Math.round(this.time)}`);
        for (const face of this.faces) face.userData.changes = rng.chance(0.5);
        this.facesUntil = this.time + FACES_SECONDS;
      }
      const [cx, cz] = cellCentre('7,9');
      if (!this.batDone && Math.hypot(p.x - cx, p.z - cz) < 2) {
        this.batDone = true;
        this.options.scares.fire('bat', { x: cx, y: 2.8, z: cz }, { force: true });
      }
      if (y >= 12 && inPortraitHall(x, y)) this.reveal();
    }
    if (this.current === 'chase') {
      this.follow(dt);
      if (!this.shifted && inCorridor(x, y)) {
        this.shifted = true;
        // The way back walls itself up.
        this.options.applyDiff(this.options.house.shiftCorridorBehind());
      }
      if (this.shifted && inCorridor(x, y) && y <= 3) void this.cornered();
    }
    if (this.fadingOut && this.patriarch) {
      this.patriarch.setFade(this.patriarch.fade - dt / 1.5);
      if (this.patriarch.fade <= 0) {
        this.patriarch.removeFromParent();
        this.patriarch.dispose();
        this.patriarch = undefined;
        this.fadingOut = false;
      }
    } else if (this.patriarch && this.patriarch.fade < 1) {
      this.patriarch.setFade(this.patriarch.fade + dt / 0.8);
    }
  }

  private enter(stage: ActStage): void {
    this.current = stage;
    events.emit('actStage', { stage });
  }

  private patriarchCharacter() {
    return this.options.caseFile.characters.find((c) => c.role === 'patriarch')!;
  }

  /** The portrait at the end of the hall is empty, and he is standing behind the player. */
  private reveal(): void {
    const { player, scene, seed } = this.options;
    if (this.emptyFrame) this.emptyFrame.visible = true;
    const p = player.state();
    const [bx, bz] = [p.x + Math.sin(p.yaw) * 2, p.z + Math.cos(p.yaw) * 2];
    const character = this.patriarchCharacter();
    const spirit = createSpirit(character, createRng(seed).fork(STREAMS.render).fork(`spirit:${character.id}`));
    spirit.position.set(bx, 0, bz);
    scene.add(spirit);
    this.patriarch = spirit;
    this.options.captions.line.show(character.name, PATRIARCH_LINES.who, 5);
    void this.options.speaker.speak(PATRIARCH_LINES.who, this.voice, [bx, 1.7, bz]);
    this.options.captions.hint.show('', 'Run! The arrow keys move you; hold Shift to run.', 6);
    this.enter('chase');
  }

  /** He comes after the player, but never close enough to catch them. */
  private follow(dt: number): void {
    const spirit = this.patriarch;
    if (!spirit) return;
    const p = this.options.player.state();
    const dx = p.x - spirit.position.x;
    const dz = p.z - spirit.position.z;
    const d = Math.hypot(dx, dz);
    if (d > KEEP_BACK) {
      const step = Math.min(PATRIARCH_SPEED * dt, d - KEEP_BACK);
      spirit.position.x += (dx / d) * step;
      spirit.position.z += (dz / d) * step;
    }
    spirit.rotation.y = Math.atan2(dx, dz);
  }

  /** The dead end: he looms, studies the player's face, speaks, and is gone; the clock strikes twelve. */
  private async cornered(): Promise<void> {
    if (this.current !== 'chase') return;
    this.enter('cornered');
    const { player, dialogue, house, audio, holdControls } = this.options;
    holdControls(true);
    const spirit = this.patriarch;
    const p = player.state();
    if (spirit) {
      // He stands in the corridor the player came down, and the player turns to face him.
      const [sx, sz] = cellCentre('2,4');
      spirit.position.set(sx, 0, sz);
      spirit.rotation.y = Math.atan2(p.x - sx, p.z - sz);
      player.teleport(p.x, p.z, Math.atan2(-(sx - p.x), -(sz - p.z)));
    }
    await new Promise((resolve) => setTimeout(resolve, 1200));
    await dialogue.say({ speaker: this.patriarchCharacter().name, line: PATRIARCH_LINES.another, voice: this.voice });
    dialogue.close();
    this.fadingOut = true;
    audio.play('clock', { param: 12 });
    house.endAct1();
    holdControls(false);
    this.startAct2();
  }

  private tickClock(dt: number): void {
    this.elapsed += dt * 1000;
    const c = gameClock(this.elapsed);
    if (c.hour > this.lastHour) {
      this.lastHour = c.hour;
      this.options.audio.play('clock', { param: c.hour });
      events.emit('hourStruck', { hour: c.hour });
    }
    if (c.dawn && !this.dawned) {
      this.dawned = true;
      events.emit('dawn', {});
    }
    this.showClock();
  }

  private showClock(): void {
    const c = gameClock(this.elapsed);
    this.options.hud.clock(clockLabel(c.hour, c.minute), 1 - this.elapsed / (DAWN_MINUTES * 60_000));
  }

  /** Over the hall's portraits: a changed face for each (shown in flashes), and the empty frame for the patriarch's. */
  private buildPortraitOverlays(): void {
    const { house, textures, scene } = this.options;
    const hall = house.getRoom('portrait-hall');
    if (!hall) return;
    const patriarch = this.patriarchCharacter().id;
    const group = new Group();
    group.name = 'portrait-overlays';
    for (const anchor of hall.anchors) {
      if (anchor.kind !== 'portrait' || !anchor.side || !anchor.characterId) continue;
      const rect = textures.portraitUv(anchor.characterId === patriarch ? 'empty' : 'smile');
      const plane = new PlaneGeometry(0.72, 0.96);
      const uv = plane.getAttribute('uv');
      // PlaneGeometry's corners: top left, top right, bottom left, bottom right.
      uv.setXY(0, rect.u0, rect.vTop);
      uv.setXY(1, rect.u1, rect.vTop);
      uv.setXY(2, rect.u0, rect.vBottom);
      uv.setXY(3, rect.u1, rect.vBottom);
      // The portrait material uses vertex colours: white, so the picture shows as painted.
      plane.setAttribute('color', new Float32BufferAttribute(new Array(12).fill(1), 3));
      const mesh = new Mesh(plane, textures.portraitMaterial);
      const [cx, cz] = cellCentre(anchor.cell);
      const [dx, dy] = DIR_STEP[anchor.side];
      const face = CELL_SIZE / 2 - WALL_INSET - 0.065;
      mesh.position.set(cx + dx * face, 1.8, cz - dy * face);
      mesh.rotation.y = Math.atan2(-dx, dy);
      mesh.visible = false;
      group.add(mesh);
      if (anchor.characterId === patriarch) this.emptyFrame = mesh;
      else this.faces.push(mesh);
    }
    scene.add(group);
  }
}
