/**
 * The player's fear (spec 24), pure: it jumps with each fright and eases off; a chase holds it high.
 * It drives the heartbeat and the heart on the HUD.
 */

/** Seconds for fear to ease to about a third. */
const EASE_SECONDS = 10;

export interface FearState {
  level: number;
  /** A level held for now (a chase); it lasts until the next floor or tick that lowers it. */
  floor: number;
}

export type FearEvent = { type: 'spike'; amount: number } | { type: 'floor'; level: number } | { type: 'tick'; dt: number };

export function createFear(): FearState {
  return { level: 0, floor: 0 };
}

export function fearReducer(state: FearState, event: FearEvent): FearState {
  switch (event.type) {
    case 'spike':
      return { ...state, level: Math.min(1, Math.max(state.level, event.amount, state.level + event.amount * 0.5)) };
    case 'floor': {
      const floor = Math.min(1, Math.max(0, event.level));
      return { level: Math.max(state.level, floor), floor };
    }
    case 'tick':
      return { ...state, level: Math.max(state.floor, state.level * Math.exp(-event.dt / EASE_SECONDS)) };
  }
}

/** Heart rate for a fear level: 68 at rest, 160 at the worst. */
export function bpm(level: number): number {
  return Math.round(68 + 92 * Math.min(1, Math.max(0, level)));
}

/** How much each fright frightens. */
export const FRIGHTS = {
  scare: 0.55,
  hazard: 0.45,
  shadowAppears: 0.5,
  shadowConfronts: 0.6,
  chase: 0.85,
  caught: 1,
  patriarch: 0.75,
  catScream: 0.5,
  patriarchSpeaks: 0.3,
} as const;
