import { describe, expect, it } from 'vitest';
import { createRng } from '../../src/core/rng';
import { RAIN_LOOP_SECONDS, rainGrains } from '../../src/audio/noise';

const RATE = 44_100;

/** How uneven the rain is: the spread of its loudness in quarter-second windows (coefficient of variation). */
function unevenness(samples: Float32Array): number {
  const window = Math.floor(RATE / 4);
  const energies: number[] = [];
  for (let start = 0; start + window <= samples.length; start += window) {
    let e = 0;
    for (let i = start; i < start + window; i++) e += samples[i]! ** 2;
    energies.push(e);
  }
  const mean = energies.reduce((a, b) => a + b, 0) / energies.length;
  const sd = Math.sqrt(energies.reduce((a, b) => a + (b - mean) ** 2, 0) / energies.length);
  return sd / mean;
}

/** Drops at a perfectly even rate: what the old loop did, and what read as a beat. */
function evenRain(seconds: number): Float32Array {
  const rng = createRng(3);
  const out = new Float32Array(RATE * seconds);
  for (let d = 0; d < 190 * seconds; d++) {
    const start = rng.int(0, out.length - 1);
    for (let i = start; i < Math.min(out.length, start + 200); i++) out[i] = out[i]! + 0.15 * Math.exp(-(i - start) / 120) * (rng.float() * 2 - 1);
  }
  return out;
}

describe('rain loops', () => {
  it('are two loops of different lengths that repeat together only rarely', () => {
    const [a, b] = RAIN_LOOP_SECONDS;
    expect(a).not.toBe(b);
    const ratio = Math.max(a, b) / Math.min(a, b);
    // Not near any simple fraction p/q with q up to 4, which would line the loops up quickly.
    for (let q = 1; q <= 4; q++) {
      for (let p = q; p <= 4 * q; p++) expect(Math.abs(ratio - p / q), `${p}/${q}`).toBeGreaterThan(0.04);
    }
  });

  it('come and go in gusts and lulls instead of an even patter', () => {
    const even = unevenness(evenRain(12));
    for (const [i, seconds] of RAIN_LOOP_SECONDS.entries()) {
      const loop = rainGrains(createRng(i + 1), RATE, seconds);
      expect(unevenness(loop), `loop ${i}`).toBeGreaterThan(even * 2);
    }
  });

  it('loop without a seam: the end of each loop is as busy as the start', () => {
    for (const [i, seconds] of RAIN_LOOP_SECONDS.entries()) {
      const loop = rainGrains(createRng(i + 1), RATE, seconds);
      const energy = (from: number, to: number) => {
        let e = 0;
        for (let k = Math.floor(from); k < Math.floor(to); k++) e += loop[k]! ** 2;
        return e;
      };
      const head = energy(0, RATE * 0.5);
      const tail = energy(loop.length - RATE * 0.5, loop.length);
      expect(Math.max(head, tail) / Math.min(head, tail)).toBeLessThan(3);
    }
  });
});
