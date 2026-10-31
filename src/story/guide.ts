import type { AudioEngine } from '../audio/engine';
import type { CharacterId } from '../case/types';
import { events } from '../core/events';
import { createRng, STREAMS, type Rng } from '../core/rng';
import type { PlayerController } from '../player/controller';
import type { House } from '../world/house';
import { cellCentre, worldToCell } from '../world/units';
import { KEY_ROOM_REACH } from '../world/grid';
import type { CellId } from '../world/types';
import { spiritsByDistance, whisperPoint } from './guide-rules';

declare module '../core/events' {
  interface GameEvents {
    /** A spirit's whisper from the way to its room (spec 23). */
    guideWhisper: { characterId: CharacterId; position: [number, number, number] };
    /** Debug: a whisper was due but had nowhere to lead. */
    guideSkipped: { reason: 'nothing in reach' | 'no way there' };
  }
}

/** Doors searched for a spirit to lead the player to: as far as any is ever placed. */
const SEARCH_DOORS = KEY_ROOM_REACH;

/**
 * Finding the spirits (spec 23): now and then, a spirit's whisper from a few cells along the way to
 * the nearest room whose spirit the player hasn't met, so the sound leads them through the doorways.
 */
export class Guide {
  private readonly rng: Rng;
  private nextIn: number;

  constructor(
    private readonly options: {
      seed: number;
      house: House;
      audio: AudioEngine;
      player: PlayerController;
      resolved(characterId: CharacterId): boolean;
      keys: ReadonlySet<string>;
      /** Rooms where a spirit's keys still lie on its stand, not yet picked up. */
      keysWaiting?(): readonly string[];
      /** Seconds between whispers (debug, `&guide=N`); otherwise 12 to 18, seeded (spec 25). */
      every?: number;
    },
  ) {
    this.rng = createRng(options.seed).fork(STREAMS.voices).fork('guide');
    this.nextIn = this.interval();
  }

  private interval(): number {
    return this.options.every ?? 12 + this.rng.float() * 6;
  }

  /** Each frame. `active`: Act 2, and nothing else holds the screen. */
  update(dt: number, active: boolean): void {
    if (!active || (this.nextIn -= dt) > 0) return;
    this.nextIn = this.interval();
    const { house, player, audio, resolved, keys } = this.options;
    const p = player.state();
    const here = worldToCell(p.x, p.z);
    const distances = house.distancesFrom(here, SEARCH_DOORS);
    const spirits = spiritsByDistance(distances, house.keyRooms(), resolved, keys);
    // With no spirit's room to get into, back to keys left lying on a stand (fixed 31 October).
    const waiting = spirits.length
      ? []
      : (this.options.keysWaiting?.() ?? [])
          .filter((roomId) => distances.has(roomId))
          .sort((a, b) => distances.get(a)! - distances.get(b)!)
          .flatMap((roomId) => {
            const characterId = house.keyRooms().find((k) => k.roomId === roomId)?.characterId;
            return characterId ? [{ characterId, roomId, locked: false, doorId: undefined }] : [];
          });
    const targets = [...spirits, ...waiting];
    if (!targets.length) {
      events.emit('guideSkipped', { reason: 'nothing in reach' });
      return;
    }
    // The nearest that has a way there now: a locked room's way ends at its door (the key opens it),
    // and a door La Sombra holds shut sends the whisper to the next.
    for (const target of targets) {
      const goal = this.goal(target.roomId!, target.locked ? target.doorId : undefined);
      const point = goal && whisperPoint(house.pathBetween(here, goal) ?? []);
      if (!point) continue;
      const [x, z] = cellCentre(point);
      const position: [number, number, number] = [x, 1.6, z];
      // Loud and near (spec 25): full level within 4 m, still heard from where it comes.
      audio.play('whisper', { position, gain: 1.8, refDistance: 4 });
      events.emit('guideWhisper', { characterId: target.characterId, position });
      return;
    }
    events.emit('guideSkipped', { reason: 'no way there' });
  }

  /** Where the way leads: the room's middle, or for a locked room the cell outside its door. */
  private goal(roomId: string, lockedDoor: string | undefined): CellId | undefined {
    const { house } = this.options;
    const room = house.getRoom(roomId);
    if (!room) return undefined;
    if (!lockedDoor) return room.cells[Math.floor(room.cells.length / 2)];
    const door = house.getDoor(lockedDoor);
    return door ? [door.a, door.b].find((c) => !room.cells.includes(c)) : undefined;
  }
}
