import type { PlayerController } from '../player/controller';
import type { Scares } from '../scares/scares';
import type { ScareKind, ScareTrigger } from '../scares/scheduler';

/** Test handle on window.__scares, installed by `?debug=scares` (spec 13). */
export interface ScaresDebug {
  /** Sets one loose ahead of the player; forced by default. Returns whether it fired. */
  fire(kind: ScareKind, force?: boolean): boolean;
  /** The same, but through the scheduler, as a trigger the player tripped. */
  trip(kind: ScareKind): boolean;
  active(): number;
  triggers(): ScareTrigger[];
}

declare global {
  interface Window {
    __scares?: ScaresDebug;
  }
}

export function installScaresDebug(options: { scares: Scares; player: PlayerController; fire: string | null }): void {
  const { scares, player } = options;
  /** A bat from 4 m out near the ceiling; a rat or a cat on the floor a few metres ahead. */
  const ahead = (kind: ScareKind) => {
    const { x, z, yaw } = player.state();
    const d = kind === 'bat' ? 4 : kind === 'rat' ? 2.5 : 3;
    return { x: x - Math.sin(yaw) * d, y: kind === 'bat' ? 2.4 : 0, z: z - Math.cos(yaw) * d };
  };
  window.__scares = {
    fire: (kind, force = true) => scares.fire(kind, ahead(kind), { force }),
    trip: (kind) => scares.fire(kind, ahead(kind)),
    active: () => scares.activeCount(),
    triggers: () => scares.allTriggers(),
  };
  const kind = options.fire;
  if (kind === 'bat' || kind === 'rat' || kind === 'cat') setTimeout(() => window.__scares!.fire(kind), 1000);
}
