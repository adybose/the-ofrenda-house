/** The flashlight battery, pure so it can be tested. Level runs from 0 (flat) to 1 (full). */

export const BATTERY = {
  /** Full to empty while on. */
  drainSeconds: 360,
  /** Empty to full while off. */
  rechargeSeconds: 600,
  /** After running flat, the light won't come on again below this. */
  restartLevel: 0.1,
} as const;

export interface BatteryState {
  level: number;
  on: boolean;
  /** Ran flat and hasn't yet recharged to the restart level. */
  exhausted: boolean;
}

export function createBattery(): BatteryState {
  return { level: 1, on: false, exhausted: false };
}

export function stepBattery(state: BatteryState, dt: number): BatteryState {
  if (state.on) {
    const level = Math.max(0, state.level - dt / BATTERY.drainSeconds);
    return level === 0 ? { level: 0, on: false, exhausted: true } : { ...state, level };
  }
  const level = Math.min(1, state.level + dt / BATTERY.rechargeSeconds);
  return { level, on: false, exhausted: state.exhausted && level < BATTERY.restartLevel };
}

/** F: switch off, or on unless the battery is still recovering from running flat. */
export function toggleFlashlight(state: BatteryState): BatteryState {
  if (state.on) return { ...state, on: false };
  return state.exhausted ? state : { ...state, on: true };
}
