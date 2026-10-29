import { Mesh, MeshBasicMaterial, PlaneGeometry, type Scene } from 'three';
import type { CaseFile } from '../case/types';
import { events } from '../core/events';
import { STREAMS, createRng } from '../core/rng';
import { assignVoices } from '../dialogue/voices';
import type { PlayerController } from '../player/controller';
import { createSpirit, type Spirit } from '../render/spirit';
import type { Dialogue } from '../ui/dialogue-box';
import { showEnding, type EndingKind } from '../ui/ending';
import { DIR_STEP } from '../world/grid';
import type { House } from '../world/house';
import { freeWallSpots } from '../world/stands';
import type { CellId, Room } from '../world/types';
import { CELL_SIZE, WALL_INSET, cellCentre } from '../world/units';
import { EXIT_KEY } from './accusation';

declare module '../core/events' {
  interface GameEvents {
    /** The game has ended this way (spec 21 for now; spec 14 adds the rest). */
    ending: { kind: EndingKind };
  }
}

/** The patriarch's last words, by ending (fixed text, from the story). */
const LINES: Record<EndingKind, string> = {
  true: 'You named the one who did this. Now we can rest. Go home, child. Light a candle for us.',
  escape: 'You named the one who did this. The garden door is open. Go.',
};

/**
 * The finale (spec 21): the player walks into the dining room with the key to the way out. The
 * ofrenda stands lit, the garden door stands open to the night, the patriarch waits beside the
 * table and speaks, and the true or the escape ending follows.
 */
export class Finale {
  private started = false;
  private active = false;
  private patriarch: Spirit | undefined;

  constructor(
    private readonly options: {
      seed: number;
      caseFile: CaseFile;
      house: House;
      scene: Scene;
      player: PlayerController;
      dialogue: Dialogue;
      hasKey(keyId: string): boolean;
      toldTheTruth(): boolean;
      onActiveChange(active: boolean): void;
    },
  ) {}

  isActive(): boolean {
    return this.active;
  }

  enterCell(cell: CellId): void {
    const room = this.options.house.roomAt(cell);
    if (this.started || room?.id !== 'dining-room' || !this.options.hasKey(EXIT_KEY)) return;
    this.started = true;
    void this.run(room);
  }

  update(dt: number, time: number): void {
    const spirit = this.patriarch;
    if (!spirit) return;
    spirit.setFade(spirit.fade + dt / 1.5);
    spirit.update(time);
  }

  private async run(room: Room): Promise<void> {
    const { caseFile, seed, scene, player, dialogue } = this.options;
    this.active = true;
    this.options.onActiveChange(true);
    events.emit('encounterActive', { active: true });

    // The garden door, standing open to the night, on a free wall.
    const door = freeWallSpots(room)[0];
    if (door) {
      const [cx, cz] = cellCentre(door.cell);
      const [dx, dy] = DIR_STEP[door.side];
      const face = CELL_SIZE / 2 - WALL_INSET - 0.01;
      const night = new Mesh(new PlaneGeometry(1.0, 2.2), new MeshBasicMaterial({ color: 0x1c2a48 }));
      night.position.set(cx + dx * face, 1.1, cz - dy * face);
      night.rotation.y = Math.atan2(-dx, dy);
      night.name = 'garden-door';
      scene.add(night);
    }

    // The patriarch, behind the ofrenda, facing the player.
    const ofrenda = room.anchors.find((a) => a.kind === 'ofrenda');
    const [ox, oz] = cellCentre(ofrenda?.cell ?? room.cells[0]!);
    const character = caseFile.characters.find((c) => c.role === 'patriarch')!;
    const spirit = createSpirit(character, createRng(seed).fork(STREAMS.render).fork(`spirit:${character.id}`));
    const [x, z] = [ox, oz - 1.3];
    spirit.position.set(x, 0, z);
    const here = player.state();
    spirit.rotation.y = Math.atan2(here.x - x, here.z - z);
    scene.add(spirit);
    this.patriarch = spirit;
    player.teleport(here.x, here.z, Math.atan2(-(x - here.x), -(z - here.z)));

    await new Promise((resolve) => setTimeout(resolve, 1500));
    const kind: EndingKind = this.options.toldTheTruth() ? 'true' : 'escape';
    const voice = assignVoices(seed, caseFile.characters)[character.id];
    await dialogue.say({ speaker: character.name, line: LINES[kind], voice });
    dialogue.close();
    events.emit('ending', { kind });
    showEnding(kind);
  }
}
