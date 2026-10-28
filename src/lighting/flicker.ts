/** How bright the flashlight is right now, as a 0..1 factor. Pure: time in, brightness out. */

/** Smooth noise in 0..1 over time, from a hashed lattice (no state, so it's testable). */
function noise(t: number, salt: number): number {
  const hash = (i: number) => {
    const x = Math.sin(i * 127.1 + salt * 311.7) * 43758.5453;
    return x - Math.floor(x);
  };
  const i = Math.floor(t);
  const f = t - i;
  const s = f * f * (3 - 2 * f);
  return hash(i) + (hash(i + 1) - hash(i)) * s;
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
}

export function flashlightIntensity({ time, level, flicker, killedUntil }: FlickerInput): number {
  if (time < killedUntil) return 0;
  // Always a slight, uneven flutter, like an old bulb.
  let factor = 1 - 0.06 * noise(time * 9, 1) - 0.03 * noise(time * 31, 2);

  // Below 20% the bulb dims and stutters.
  if (level < 0.2) {
    const weak = 1 - level / 0.2;
    factor *= 0.35 + 0.65 * (level / 0.2);
    if (noise(time * 13, 3) < weak * 0.45) factor *= 0.25 + 0.5 * noise(time * 40, 4);
  }

  // The Shadow's presence: sudden drop-outs and a nervous tremble.
  if (flicker > 0) {
    factor *= 1 - 0.25 * flicker * noise(time * 25, 5);
    if (noise(time * 17, 6) < flicker * 0.55) factor *= 0.08 + 0.3 * noise(time * 60, 7);
  }
  return Math.min(1, Math.max(0, factor));
}
