/** Interactables the player can use with E, and how the target is chosen. */

export const INTERACT_RANGE = 1.5;
export const INTERACT_ANGLE = Math.PI / 4;

export type InteractableKind = 'door' | 'object' | 'spirit' | 'portrait';

export interface Interactable {
  id: string;
  /** World position in metres. */
  x: number;
  z: number;
  kind: InteractableKind;
  /** Shown in the prompt, e.g. "Open door". */
  label: string;
  onInteract(): void;
}

export interface Viewer {
  x: number;
  z: number;
  /** 0 faces north (-z); positive turns left. */
  yaw: number;
}

/** The nearest item within INTERACT_RANGE and INTERACT_ANGLE of where the viewer looks. */
export function pickInteractable<T extends { x: number; z: number }>(viewer: Viewer, items: Iterable<T>): T | undefined {
  const fx = -Math.sin(viewer.yaw);
  const fz = -Math.cos(viewer.yaw);
  let best: T | undefined;
  let bestDistance = Infinity;
  for (const item of items) {
    const dx = item.x - viewer.x;
    const dz = item.z - viewer.z;
    const distance = Math.hypot(dx, dz);
    if (distance > INTERACT_RANGE || distance >= bestDistance) continue;
    // Standing right on top of it counts as facing it.
    if (distance > 0.05 && (dx * fx + dz * fz) / distance < Math.cos(INTERACT_ANGLE)) continue;
    best = item;
    bestDistance = distance;
  }
  return best;
}

/** The registry behind registerInteractable. */
export class Interactions {
  private readonly items = new Map<string, Interactable>();

  register(item: Interactable): () => void {
    this.items.set(item.id, item);
    return () => {
      if (this.items.get(item.id) === item) this.items.delete(item.id);
    };
  }

  target(viewer: Viewer): Interactable | undefined {
    return pickInteractable(viewer, this.items.values());
  }

  /** Uses the current target. Returns false when there is nothing to use. */
  interact(viewer: Viewer): boolean {
    const item = this.target(viewer);
    item?.onInteract();
    return item !== undefined;
  }
}
