import type { AudioEngine } from '../audio/engine';
import type { CharacterId } from '../case/types';
import { events } from '../core/events';
import { createRng, STREAMS, type Rng } from '../core/rng';
import type { PlayerController } from '../player/controller';
import type { House } from '../world/house';
import { cellCentre, worldToCell } from '../world/units';
import { nearestSpirit, whisperPoint } from './guide-rules';

declare module '../core/events' {
  interface GameEvents {
    /** A spirit's whisper from the way to its room (spec 23). */
    guideWhisper: { characterId: CharacterId; position: [number, number, number] };
  }
}

/** Doors searched for a spirit to lead the player to. */
const SEARCH_DOORS = 10;

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
      /** Seconds between whispers (debug, `&guide=N`); otherwise 25 to 35, seeded. */
      every?: number;
    },
  ) {
    this.rng = createRng(options.seed).fork(STREAMS.voices).fork('guide');
    this.nextIn = this.interval();
  }

  private interval(): number {
    return this.options.every ?? 25 + this.rng.float() * 10;
  }

  /** Each frame. `active`: Act 2, and nothing else holds the screen. */
  update(dt: number, active: boolean): void {
    if (!active || (this.nextIn -= dt) > 0) return;
    this.nextIn = this.interval();
    const { house, player, audio, resolved, keys } = this.options;
    const p = player.state();
    const here = worldToCell(p.x, p.z);
    const spirit = nearestSpirit(house.distancesFrom(here, SEARCH_DOORS), house.keyRooms(), resolved, keys);
    const room = spirit?.roomId ? house.getRoom(spirit.roomId) : undefined;
    if (!spirit || !room) return;
    const point = whisperPoint(house.pathBetween(here, room.cells[Math.floor(room.cells.length / 2)]!) ?? []);
    if (!point) return;
    const [x, z] = cellCentre(point);
    const position: [number, number, number] = [x, 1.6, z];
    audio.play('whisper', { position, gain: 0.9 });
    events.emit('guideWhisper', { characterId: spirit.characterId, position });
  }
}
