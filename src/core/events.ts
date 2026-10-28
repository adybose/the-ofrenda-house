/**
 * Events shared across the game. Later specs add their own events with
 * declaration merging:
 *
 *   declare module '../core/events' {
 *     interface GameEvents { lightning: { strength: number; distanceKm: number } }
 *   }
 */
export interface GameEvents {
  gameReady: { width: number; height: number };
}

export type Listener<P> = (payload: P) => void;

export interface EventBus<M> {
  /** Adds a listener and returns a function that removes it. */
  on<K extends keyof M>(event: K, listener: Listener<M[K]>): () => void;
  off<K extends keyof M>(event: K, listener: Listener<M[K]>): void;
  emit<K extends keyof M>(event: K, payload: M[K]): void;
}

export function createEventBus<M>(): EventBus<M> {
  const listeners = new Map<keyof M, Set<Listener<never>>>();

  return {
    on(event, listener) {
      let set = listeners.get(event);
      if (!set) {
        set = new Set();
        listeners.set(event, set);
      }
      set.add(listener);
      return () => this.off(event, listener);
    },
    off(event, listener) {
      listeners.get(event)?.delete(listener);
    },
    emit(event, payload) {
      // Copy first so listeners can remove themselves while being called.
      const set = listeners.get(event) as Set<Listener<typeof payload>> | undefined;
      for (const listener of [...(set ?? [])]) listener(payload);
    },
  };
}

export const events = createEventBus<GameEvents>();
