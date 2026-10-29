import type { Rng } from '../core/rng';

/**
 * The flashlight battery (spec 17), pure so it can be tested. Level runs from 0 (flat) to 1 (full).
 * It starts the night two-thirds charged and only runs down; once nearly flat it creeps back, but
 * never past the floor, so the torch is never dead for good but never strong again.
 */
export const BATTERY = {
  /** The start of the night, seeded between these. */
  startMin: 0.6,
  startMax: 0.7,
  /** Full to empty while on. */
  drainSeconds: 600,
  /** It never charges above this; below it the battery is critical. */
  floor: 0.1,
  /** The light goes out here, and won't come on again until the battery is back at the floor. */
  offLevel: 0.05,
  /** From `offLevel` back up to the floor while off. */
  recoverSeconds: 40,
} as const;

/** A critical battery cuts out suddenly: for this long, this far apart. */
const CUT_SECONDS = [1.5, 4] as const;
const CUT_GAP_SECONDS = [8, 20] as const;

export interface BatteryState {
  level: number;
  on: boolean;
  /** Ran down to `offLevel` and hasn't yet recovered to the floor. */
  exhausted: boolean;
}

/** Off, and two-thirds charged, from the run's own stream; `level` overrides it (debug). */
export function createBattery(rng: Rng, level?: number): BatteryState {
  const start = BATTERY.startMin + rng.float() * (BATTERY.startMax - BATTERY.startMin);
  return { level: level ?? start, on: false, exhausted: false };
}

export function isCritical(level: number): boolean {
  return level < BATTERY.floor;
}

export function stepBattery(state: BatteryState, dt: number): BatteryState {
  if (state.on) {
    const level = state.level - dt / BATTERY.drainSeconds;
    return level <= BATTERY.offLevel ? { level: BATTERY.offLevel, on: false, exhausted: true } : { ...state, level };
  }
  if (state.level >= BATTERY.floor) return state;
  const level = Math.min(BATTERY.floor, state.level + (dt * (BATTERY.floor - BATTERY.offLevel)) / BATTERY.recoverSeconds);
  return { level, on: false, exhausted: state.exhausted && level < BATTERY.floor };
}

/** F: switch off, or on unless the battery is still recovering from running down. */
export function toggleFlashlight(state: BatteryState): BatteryState {
  if (state.on) return { ...state, on: false };
  return state.exhausted ? state : { ...state, on: true };
}

export interface CutOuts {
  /** The time the current cut-out ends (in the past when there is none). `active`: on and critical. */
  step(time: number, active: boolean): number;
}

/** Sudden cut-outs of a critical battery, from a seeded stream. */
export function createCutOuts(rng: Rng): CutOuts {
  const between = ([min, max]: readonly [number, number]) => min + rng.float() * (max - min);
  let nextAt: number | undefined;
  let until = 0;
  return {
    step(time, active) {
      if (!active) {
        nextAt = undefined;
        return until;
      }
      nextAt ??= Math.max(time, until) + between(CUT_GAP_SECONDS);
      if (time >= nextAt) {
        until = nextAt + between(CUT_SECONDS);
        nextAt = until + between(CUT_GAP_SECONDS);
      }
      return until;
    },
  };
}
