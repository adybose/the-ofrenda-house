import type { Rng } from '../core/rng';

/** White noise in ±1. */
export function whiteNoise(rng: Rng, length: number): Float32Array {
  const out = new Float32Array(length);
  for (let i = 0; i < length; i++) out[i] = rng.float() * 2 - 1;
  return out;
}

/** Pink noise (Paul Kellet's filter): softer, like rain on a roof. */
export function pinkNoise(rng: Rng, length: number): Float32Array {
  const out = new Float32Array(length);
  let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
  for (let i = 0; i < length; i++) {
    const w = rng.float() * 2 - 1;
    b0 = 0.99886 * b0 + w * 0.0555179;
    b1 = 0.99332 * b1 + w * 0.0750759;
    b2 = 0.969 * b2 + w * 0.153852;
    b3 = 0.8665 * b3 + w * 0.3104856;
    b4 = 0.55 * b4 + w * 0.5329522;
    b5 = -0.7616 * b5 - w * 0.016898;
    out[i] = Math.max(-1, Math.min(1, (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11));
    b6 = w * 0.115926;
  }
  return out;
}

/** Brown noise (integrated white): deep, for wind and thunder. */
export function brownNoise(rng: Rng, length: number): Float32Array {
  const out = new Float32Array(length);
  let last = 0;
  for (let i = 0; i < length; i++) {
    last = (last + 0.02 * (rng.float() * 2 - 1)) / 1.02;
    out[i] = Math.max(-1, Math.min(1, last * 3.5));
  }
  return out;
}

/**
 * The lengths of the two raindrop loops, close to the golden ratio apart, so the pair never lines up
 * on a short cycle: no beat.
 */
export const RAIN_LOOP_SECONDS = [7.3, 11.8] as const;

/**
 * Raindrops as a loop: dense, unpitched impacts. Each is a few milliseconds of white noise with
 * a sharp decay and its own brightness (a one-pole low-pass). The density drifts in gusts and
 * lulls along a curve that comes back to where it started, so the loop has no seam. No sines,
 * so nothing rings like a chime; no heavy splats, so nothing marks the loop's repeat (the engine
 * scatters those at random).
 */
export function rainGrains(rng: Rng, sampleRate: number, seconds: number): Float32Array {
  const length = Math.floor(sampleRate * seconds);
  const out = new Float32Array(length);
  // Gusts: a few slow waves with whole numbers of cycles per loop, at random phases.
  const waves = [1, 2, 3].map((cycles) => ({ cycles, phase: rng.float() * Math.PI * 2, depth: 0.45 / cycles }));
  const density = (t: number) => 1 + waves.reduce((sum, w) => sum + w.depth * Math.sin((2 * Math.PI * w.cycles * t) / seconds + w.phase), 0);
  const peak = 1 + waves.reduce((sum, w) => sum + w.depth, 0);
  const meanRate = 260;
  const candidates = Math.floor(meanRate * seconds * peak);
  for (let d = 0; d < candidates; d++) {
    const start = rng.int(0, length - 1);
    // Thin the drops where the curve dips: lulls between gusts.
    if (rng.float() * peak > density(start / sampleRate)) continue;
    const decay = 0.001 + rng.float() * 0.005;
    const amplitude = 0.05 + rng.float() * 0.25;
    const dullness = rng.float() * 0.75;
    const end = start + Math.floor(sampleRate * decay * 6);
    let smooth = 0;
    for (let i = start; i < end; i++) {
      const t = (i - start) / sampleRate;
      smooth = smooth * dullness + (rng.float() * 2 - 1) * (1 - dullness);
      // Drops that run past the end wrap round to the start: the loop is seamless.
      const at = i % length;
      out[at] = out[at]! + amplitude * Math.exp(-t / decay) * smooth * (1 + dullness * 2);
    }
  }
  for (let i = 0; i < length; i++) out[i] = Math.max(-1, Math.min(1, out[i]!));
  return out;
}
