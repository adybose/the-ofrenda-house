/** How bright the flashlight is right now, as a 0..1 factor. Pure: time in, brightness out. */

function hash(i: number, salt: number): number {
  const x = Math.sin(i * 127.1 + salt * 311.7) * 43758.5453;
  return x - Math.floor(x);
}

/** Smooth noise in 0..1 over time, from a hashed lattice (no state, so it's testable). */
function noise(t: number, salt: number): number {
  const i = Math.floor(t);
  const f = t - i;
  const s = f * f * (3 - 2 * f);
  return hash(i, salt) + (hash(i + 1, salt) - hash(i, salt)) * s;
}

export interface FlickerInput {
  /** Seconds. */
  time: number;
  /** Battery level, 0..1. */
  level: number;
  /** Extra flicker from spec 12 when the Shadow is near, 0..1. */
  flicker: number;
  /** The light is dead until this time (spec 12, "lights dying"). */
  killedUntil: number;
  /** A critical battery has cut out until this time (spec 17). */
  cutUntil: number;
}

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));

/** Full at 50% and above, 35% of it at 10%, 30% at 5%. */
function brightness(level: number): number {
  if (level >= 0.1) return 0.35 + 0.65 * clamp01((level - 0.1) / 0.4);
  return 0.3 + 0.05 * clamp01((level - 0.05) / 0.05);
}

/** Seconds between flicker dips: about 30 at 70% or more, 3 at 10%, 1.5 below. */
function dipPeriod(level: number): number {
  if (level < 0.1) return 1.5;
  return 3 + 27 * clamp01((level - 0.1) / 0.6);
}

/** Time is cut into slots this long; a slot is a dip with the chance that gives the period. */
const DIP_SLOT = 0.25;

export function flashlightIntensity({ time, level, flicker, killedUntil, cutUntil }: FlickerInput): number {
  if (time < killedUntil || time < cutUntil) return 0;
  // Always a slight, uneven flutter, like an old bulb.
  let factor = brightness(level) * (1 - 0.06 * noise(time * 9, 1) - 0.03 * noise(time * 31, 2));

  // Now and then the bulb dips, more often as the battery runs down.
  const slot = Math.floor(time / DIP_SLOT);
  if (hash(slot, 8) < DIP_SLOT / dipPeriod(level)) factor *= 0.3 + 0.3 * noise(time * 45, 9);

  // Critical: it never stops stuttering.
  if (level < 0.1) {
    const weak = 1 - clamp01((level - 0.05) / 0.05) * 0.5;
    if (noise(time * 13, 3) < weak * 0.45) factor *= 0.25 + 0.5 * noise(time * 40, 4);
  }

  // The Shadow's presence: sudden drop-outs and a nervous tremble.
  if (flicker > 0) {
    factor *= 1 - 0.25 * flicker * noise(time * 25, 5);
    if (noise(time * 17, 6) < flicker * 0.55) factor *= 0.08 + 0.3 * noise(time * 60, 7);
  }
  return clamp01(factor);
}
