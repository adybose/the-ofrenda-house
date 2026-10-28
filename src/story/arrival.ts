import type { AudioEngine } from '../audio/engine';
import { events } from '../core/events';
import type { Lightning } from '../lighting/lightning';
import type { DoorController } from '../player/doors';
import { FRONT_DOOR_ID } from '../world/grid';
import type { House } from '../world/house';

export type ArrivalStage = 'outside' | 'doorOpen' | 'inside';

declare module '../core/events' {
  interface GameEvents {
    arrivalStage: { stage: ArrivalStage };
  }
}

/** The door opens by itself when the player is this close. */
const OPEN_DISTANCE = 2.5;
/** It slams once they are this far inside. */
const INSIDE_DEPTH = 1.5;

/**
 * The prologue's arrival (spec 16): the player walks up from the gate; the front door swings
 * open by itself as they reach it; once they are inside it slams and locks, lightning flashes,
 * and the outside is gone.
 */
export class Arrival {
  private current: ArrivalStage;
  private strikeIn: number | undefined;

  constructor(
    private readonly options: {
      house: House;
      doors: DoorController;
      audio: AudioEngine;
      lightning: Lightning;
      door: { x: number; z: number };
      /** Starting inside (`?skip=prologue`, `?skip=act1`) skips the arrival. */
      outside: boolean;
      /** Called once, as the door slams: remove the outside, resume the house. */
      onInside(): void;
    },
  ) {
    this.current = options.outside ? 'outside' : 'inside';
  }

  get stage(): ArrivalStage {
    return this.current;
  }

  private enter(stage: ArrivalStage): void {
    this.current = stage;
    events.emit('arrivalStage', { stage });
  }

  update(dt: number, x: number, z: number): void {
    const { house, doors, audio, door } = this.options;
    if (this.current === 'outside' && z > 0 && Math.hypot(x - door.x, z - door.z) <= OPEN_DISTANCE) {
      // As you reach for the knocker, the door swings open by itself.
      house.unsealFrontDoor();
      doors.force(FRONT_DOOR_ID, true);
      this.enter('doorOpen');
    } else if (this.current === 'doorOpen' && z < door.z - INSIDE_DEPTH) {
      // It slams shut behind you, and the lock turns.
      doors.force(FRONT_DOOR_ID, false);
      house.sealFrontDoor();
      const at: [number, number, number] = [door.x, 1.2, door.z];
      audio.play('slam', { position: at });
      audio.play('lock', { position: at, delay: 0.45 });
      this.strikeIn = 1.1;
      this.options.onInside();
      this.enter('inside');
    }
    if (this.strikeIn !== undefined) {
      this.strikeIn -= dt;
      if (this.strikeIn <= 0) {
        this.strikeIn = undefined;
        // Lightning shows the hall of portraits for a moment, then darkness.
        this.options.lightning.strike({ strength: 0.9, distanceKm: 0.6 });
      }
    }
  }
}
