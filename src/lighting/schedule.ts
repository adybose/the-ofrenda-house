import type { Rng } from '../core/rng';

/** Seconds between strikes. */
export const LIGHTNING_INTERVAL = [20, 60] as const;

export interface Pulse {
  /** Seconds after the strike begins. */
  start: number;
  duration: number;
  /** 0..1, already scaled by the strike's strength. */
  peak: number;
}

export interface Strike {
  /** Seconds since the schedule started. */
  at: number;
  /** 0..1; closer strikes are stronger. */
  strength: number;
  distanceKm: number;
  pulses: Pulse[];
}

/** 2 or 3 bright pulses over about 400 ms. */
export function strikeShape(rng: Rng, strength: number): Pulse[] {
  const count = rng.chance(0.5) ? 2 : 3;
  const starts = count === 2 ? [0, rng.float() * 0.08 + 0.22] : [0, rng.float() * 0.05 + 0.11, rng.float() * 0.05 + 0.25];
  return starts.map((start, i) => ({
    start,
    duration: 0.07 + rng.float() * 0.06,
    peak: strength * (i === 0 ? 1 : 0.5 + rng.float() * 0.4),
  }));
}

/** A seeded run of strikes, each 20 to 60 s after the last. */
export function createLightningSchedule(rng: Rng, startAt = 0): { next(): Strike } {
  let time = startAt;
  return {
    next() {
      time += rng.float() * (LIGHTNING_INTERVAL[1] - LIGHTNING_INTERVAL[0]) + LIGHTNING_INTERVAL[0];
      const distanceKm = 0.3 + rng.float() * 4.2;
      // Closer strikes are stronger, with some spread.
      const strength = Math.min(1, Math.max(0.2, 1 - distanceKm / 6 + (rng.float() - 0.5) * 0.25));
      return { at: time, strength, distanceKm, pulses: strikeShape(rng, strength) };
    },
  };
}

/** How bright a strike is `t` seconds after it begins: each pulse snaps on and fades. */
export function flashLevel(strike: Pick<Strike, 'pulses'>, t: number): number {
  let level = 0;
  for (const pulse of strike.pulses) {
    const u = (t - pulse.start) / pulse.duration;
    if (u < 0 || u > 1) continue;
    level = Math.max(level, pulse.peak * (u < 0.15 ? u / 0.15 : 1 - (u - 0.15) / 0.85));
  }
  return level;
}
