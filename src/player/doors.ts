import { events } from '../core/events';
import { setDoorOpen } from '../render/chunk-mesh';
import type { WorldView } from '../render/world-view';
import { chunkId, doorOwnerChunk } from '../world/grid';
import type { House } from '../world/house';
import type { ChunkDiff, ChunkId, Door, DoorId } from '../world/types';
import { cellCentre } from '../world/units';
import type { Interactions } from './interaction';

declare module '../core/events' {
  interface GameEvents {
    interact: { id: string };
    /** `byPlayer`: the player opened it with E (spec 24's door scares), not La Sombra or a script. */
    doorOpened: { doorId: DoorId; byPlayer?: boolean };
    doorClosed: { doorId: DoorId };
    doorUnlocked: { doorId: DoorId };
    doorLocked: { doorId: DoorId };
    doorSealed: { doorId: DoorId };
  }
}

/** Seconds for a door to swing fully open or shut. */
const SWING_SECONDS = 0.6;

const LABELS: Record<Door['state'], string> = {
  open: 'Close door',
  closed: 'Open door',
  locked: 'Try the door',
  sealed: 'Try the door',
};

/** Makes every loaded door usable with E and animates the swing. */
export class DoorController {
  private readonly registered = new Map<ChunkId, (() => void)[]>();
  private readonly swing = new Map<DoorId, { amount: number; target: number }>();

  constructor(
    private readonly options: { house: House; view: WorldView; interactions: Interactions; hasKey(keyId: string): boolean },
  ) {}

  /** Call with every chunk diff so doors come and go with their chunks. */
  sync(diff: ChunkDiff): void {
    for (const id of [...diff.unloaded, ...diff.loaded.map((c) => c.id)]) {
      for (const off of this.registered.get(id) ?? []) off();
      this.registered.delete(id);
    }
    for (const chunk of diff.loaded) {
      this.registered.set(
        chunk.id,
        chunk.doors.map((door) => {
          const [ax, az] = cellCentre(door.a);
          const [bx, bz] = cellCentre(door.b);
          const amount = door.state === 'open' ? 1 : 0;
          this.swing.set(door.id, { amount, target: amount });
          const house = this.options.house;
          return this.options.interactions.register({
            id: door.id,
            x: (ax + bx) / 2,
            z: (az + bz) / 2,
            kind: 'door',
            get label() {
              return LABELS[house.getDoor(door.id)?.state ?? 'closed'];
            },
            onInteract: () => this.use(door.id),
          });
        }),
      );
    }
  }

  /** E on a door: open or close it, unlock it with the key, or report it locked or sealed. */
  use(doorId: DoorId): void {
    const { house } = this.options;
    const door = house.getDoor(doorId);
    if (!door) return;
    events.emit('interact', { id: doorId });
    if (door.state === 'sealed') {
      events.emit('doorSealed', { doorId });
    } else if (door.state === 'locked') {
      if (door.keyId && this.options.hasKey(door.keyId)) {
        house.unlock(doorId);
        events.emit('doorUnlocked', { doorId });
        this.setOpen(doorId, true, true);
      } else {
        events.emit('doorLocked', { doorId });
      }
    } else {
      this.setOpen(doorId, door.state !== 'open', true);
    }
  }

  /** Opens or shuts a door by itself, with no one touching it (the front door on arrival). */
  force(doorId: DoorId, open: boolean): void {
    this.setOpen(doorId, open);
  }

  private setOpen(doorId: DoorId, open: boolean, byPlayer = false): void {
    if (!this.options.house.setDoorOpen(doorId, open)) return;
    const swing = this.swing.get(doorId) ?? { amount: open ? 0 : 1, target: 0 };
    swing.target = open ? 1 : 0;
    this.swing.set(doorId, swing);
    if (open) events.emit('doorOpened', byPlayer ? { doorId, byPlayer } : { doorId });
    else events.emit('doorClosed', { doorId });
  }

  update(dt: number): void {
    for (const [doorId, swing] of this.swing) {
      if (swing.amount === swing.target) continue;
      const step = dt / SWING_SECONDS;
      swing.amount = swing.target > swing.amount ? Math.min(swing.target, swing.amount + step) : Math.max(swing.target, swing.amount - step);
      const group = this.options.view.chunk(chunkId(...doorOwnerChunk(doorId)));
      if (group) setDoorOpen(group, doorId, swing.amount);
    }
  }
}
