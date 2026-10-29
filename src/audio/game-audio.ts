import { events } from '../core/events';
import type { House } from '../world/house';
import type { CellId, DoorId } from '../world/types';
import { cellCentre } from '../world/units';
import type { AudioEngine, Vec3 } from './engine';
import type { SoundName } from './synths';
import { thunderDelay } from './thunder';

const FOOTSTEPS: Record<string, SoundName> = {
  wood: 'footstepWood',
  tile: 'footstepTile',
  carpet: 'footstepCarpet',
  stone: 'footstepStone',
};

/**
 * Connects game events to sound: footsteps, doors and keys at the door, the torch's click,
 * thunder after each flash, and the reverb following the room. Unlocks audio on the first
 * click or key press (the title screen's click, once spec 14 adds it).
 */
export function connectGameAudio(audio: AudioEngine, house: House, startCell?: CellId): void {
  const unlock = () => void audio.unlock();
  window.addEventListener('pointerdown', unlock, { once: true });
  window.addEventListener('keydown', unlock, { once: true });

  const atDoor = (doorId: DoorId): Vec3 | undefined => {
    const door = house.getDoor(doorId);
    if (!door) return undefined;
    const [ax, az] = cellCentre(door.a);
    const [bx, bz] = cellCentre(door.b);
    return [(ax + bx) / 2, 1.2, (az + bz) / 2];
  };

  events.on('footstep', ({ surface, running }) => audio.play(FOOTSTEPS[surface] ?? 'footstepWood', { gain: running ? 1.2 : 0.9 }));
  events.on('doorOpened', ({ doorId }) => audio.play('creak', { position: atDoor(doorId) }));
  events.on('doorClosed', ({ doorId }) => audio.play('slam', { position: atDoor(doorId), gain: 1 }));
  events.on('doorUnlocked', ({ doorId }) => audio.play('unlock', { position: atDoor(doorId) }));
  events.on('doorLocked', ({ doorId }) => audio.play('lock', { position: atDoor(doorId) }));
  events.on('doorSealed', ({ doorId }) => {
    audio.play('lock', { position: atDoor(doorId) });
    audio.play('slam', { position: atDoor(doorId), gain: 0.3, delay: 0.15 });
  });
  events.on('flashlightToggled', () => audio.play('flashlightClick', { gain: 0.8 }));
  events.on('lightning', ({ strength, distanceKm }) => {
    audio.play('thunder', { param: strength, gain: 0.6 + 0.4 * strength, delay: thunderDelay(distanceKm) });
  });
  // The room decides the reverb, and whether a grandfather clock ticks nearby.
  const enterRoom = (cell: CellId) => {
    const room = house.roomAt(cell);
    if (room) audio.setRoomSize(room.size);
    const clock = room?.anchors.find((a) => a.kind === 'clock');
    if (clock) {
      const [x, z] = cellCentre(clock.cell);
      audio.setTicking([x, 1.6, z]);
    } else {
      audio.setTicking(undefined);
    }
  };
  events.on('playerCellChanged', ({ cell }) => enterRoom(cell));
  if (startCell) enterRoom(startCell);
}
