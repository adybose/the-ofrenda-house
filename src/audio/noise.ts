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
 * Raindrops as a loop: dense, unpitched impacts. Each is a few milliseconds of white noise with
 * a sharp decay and its own brightness (a one-pole low-pass), plus the occasional heavier splat.
 * No sines anywhere, so nothing rings like a chime.
 */
export function rainGrains(rng: Rng, sampleRate: number, seconds: number): Float32Array {
  const length = Math.floor(sampleRate * seconds);
  const out = new Float32Array(length);
  const drops = Math.floor(190 * seconds);
  for (let d = 0; d < drops; d++) {
    const splat = rng.chance(0.04);
    const start = rng.int(0, length - 1);
    const decay = splat ? 0.008 + rng.float() * 0.01 : 0.001 + rng.float() * 0.005;
    const amplitude = splat ? 0.35 + rng.float() * 0.3 : 0.05 + rng.float() * 0.25;
    // 0 = bright tick on glass, near 1 = dull thud on wood and earth.
    const dullness = splat ? 0.6 + rng.float() * 0.3 : rng.float() * 0.75;
    const end = Math.min(length, start + Math.floor(sampleRate * decay * 6));
    let smooth = 0;
    for (let i = start; i < end; i++) {
      const t = (i - start) / sampleRate;
      smooth = smooth * dullness + (rng.float() * 2 - 1) * (1 - dullness);
      out[i] = out[i]! + amplitude * Math.exp(-t / decay) * smooth * (1 + dullness * 2);
    }
  }
  for (let i = 0; i < length; i++) out[i] = Math.max(-1, Math.min(1, out[i]!));
  return out;
}
