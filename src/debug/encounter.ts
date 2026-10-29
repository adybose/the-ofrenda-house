import { Box3, Color, Vector3, type Object3D, type PerspectiveCamera, type Scene } from 'three';
import type { CaseFile } from '../case/types';
import { STREAMS, createRng } from '../core/rng';
import type { PlayerController } from '../player/controller';
import { createSpirit } from '../render/spirit';
import type { Encounters } from '../story/encounters';
import type { House } from '../world/house';
import type { KeyRoomState } from '../world/types';

/** Test handle on window.__encounter, installed by `?debug=encounter`. */
export interface EncounterDebug {
  keyRooms(): KeyRoomState[];
  /** The case file's riddle answer for a spirit, for the mock model in tests. */
  riddleAnswer(characterId: string): string;
  /** How many clue cards a spirit holds. */
  clueCount(characterId: string): number;
  step(): string | undefined;
  active(): boolean;
  /** Hides or shows the spirit on screen, for the translucency test. */
  showSpirit(visible: boolean): void;
  spiritFade(): number;
  /** Draws only the spirit, on a plain background of this colour; undefined puts the world back. */
  isolateSpirit(background: number | undefined): void;
  spiritLit(): number;
  /** The spirit's box on screen, as fractions of the view: [x0, y0, x1, y1]. */
  spiritRegion(): [number, number, number, number] | undefined;
}

declare global {
  interface Window {
    __encounter?: EncounterDebug;
  }
}

export function installEncounterDebug(options: { encounters: Encounters; house: House; camera: PerspectiveCamera; scene: Scene; caseFile: CaseFile }): void {
  const { encounters, house, camera, scene, caseFile } = options;
  let hidden: { object: Object3D; visible: boolean }[] | undefined;
  let background: Scene['background'] = null;
  window.__encounter = {
    keyRooms: () => house.keyRooms(),
    riddleAnswer: (id) => caseFile.characters.find((c) => c.id === id)!.riddle.answer,
    clueCount: (id) => caseFile.facts.filter((f) => f.holderId === id).length,
    step: () => encounters.step(),
    active: () => encounters.isActive(),
    showSpirit(visible) {
      const spirit = encounters.spirit();
      if (spirit) spirit.visible = visible;
    },
    spiritFade: () => encounters.spirit()?.fade ?? 0,
    isolateSpirit(colour) {
      if (colour === undefined) {
        for (const { object, visible } of hidden ?? []) object.visible = visible;
        if (hidden) scene.background = background;
        hidden = undefined;
        return;
      }
      const spirit = encounters.spirit();
      if (!hidden) {
        hidden = scene.children.filter((c) => c !== spirit).map((object) => ({ object, visible: object.visible }));
        background = scene.background;
      }
      for (const { object } of hidden) object.visible = false;
      scene.background = new Color(colour);
    },
    spiritLit: () => encounters.spirit()?.lit ?? 0,
    spiritRegion() {
      const spirit = encounters.spirit();
      if (!spirit) return undefined;
      const box = new Box3().setFromObject(spirit);
      const corners = [0, 1].flatMap((i) => [0, 1].flatMap((j) => [0, 1].map((k) => new Vector3(i ? box.max.x : box.min.x, j ? box.max.y : box.min.y, k ? box.max.z : box.min.z).project(camera))));
      const xs = corners.map((c) => (c.x + 1) / 2);
      const ys = corners.map((c) => (1 - c.y) / 2);
      const clamp = (v: number) => Math.max(0, Math.min(1, v));
      return [clamp(Math.min(...xs)), clamp(Math.min(...ys)), clamp(Math.max(...xs)), clamp(Math.max(...ys))];
    },
  };
}

/** `?debug=spirits`: every spirit of the seed in a row in front of the player, fully faded in. */
export function showSpiritLineup(options: { caseFile: CaseFile; seed: number; scene: Scene; player: PlayerController }): void {
  const { caseFile, seed, scene, player } = options;
  const { x, z, yaw } = player.state();
  const spirits = caseFile.characters.map((c) => createSpirit(c, createRng(seed).fork(STREAMS.render).fork(`spirit:${c.id}`)));
  const ahead = [-Math.sin(yaw), -Math.cos(yaw)];
  const across = [Math.cos(yaw), -Math.sin(yaw)];
  spirits.forEach((spirit, i) => {
    const offset = (i - (spirits.length - 1) / 2) * 0.75;
    spirit.position.set(x + ahead[0]! * 3.2 + across[0]! * offset, 0, z + ahead[1]! * 3.2 + across[1]! * offset);
    spirit.rotation.y = yaw;
    spirit.setFade(1);
    scene.add(spirit);
  });
  const tick = (time: number) => {
    for (const spirit of spirits) spirit.update(time / 1000);
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}
