import type { ItemsController } from '../items/controller';
import type { ItemsState } from '../items/items';
import type { Flashlight } from '../lighting/flashlight';
import type { PlayerController } from '../player/controller';
import { DIR_STEP } from '../world/grid';
import type { House } from '../world/house';
import { standsOf, type Stand } from '../world/stands';
import { worldToCell } from '../world/units';

/** Test handle on window.__items, installed by `?debug=items` (spec 18). */
export interface ItemsDebug {
  state(): ItemsState;
  /** The stands in the loaded chunks. */
  stands(): Stand[];
  /** Stands the player 0.9 m in front of a loaded stand, facing it. */
  goTo(standId: string): boolean;
  inLight(): boolean;
  isSanctuary(roomId: string): boolean;
}

declare global {
  interface Window {
    __items?: ItemsDebug;
  }
}

export function installItemsDebug(options: { items: ItemsController; house: House; player: PlayerController; flashlight: Flashlight }): void {
  const { items, house, player, flashlight } = options;
  const stands = () => house.loadedChunks().flatMap((chunk) => chunk.rooms.flatMap(standsOf));
  window.__items = {
    state: () => items.snapshot(),
    stands,
    goTo(id) {
      const stand = stands().find((s) => s.id === id);
      if (!stand) return false;
      // The wall is (dx, dy) on the grid; in the world, north is -z.
      const [dx, dy] = DIR_STEP[stand.wall];
      player.teleport(stand.x - dx * 0.9, stand.z + dy * 0.9, Math.atan2(-dx, dy));
      return true;
    },
    inLight() {
      const { x, z } = player.state();
      return items.inLight(flashlight.lit, worldToCell(x, z));
    },
    isSanctuary: (roomId) => items.isSanctuary(roomId),
  };
}
