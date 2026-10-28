import { describe, expect, it } from 'vitest';
import { createRng } from '../../src/core/rng';
import { rainGrains } from '../../src/audio/noise';

const RATE = 44_100;
const FRAME = 256;

/** Spectral flatness (0 = a pure tone, 1 = flat noise) of one frame, from a naive DFT. */
function flatness(samples: Float32Array, start: number): number {
  const power: number[] = [];
  // Bins from about 1 kHz to 10 kHz, where the old pings rang.
  for (let k = 6; k <= 58; k++) {
    let re = 0;
    let im = 0;
    for (let n = 0; n < FRAME; n++) {
      const w = 0.5 - 0.5 * Math.cos((2 * Math.PI * n) / (FRAME - 1));
      const v = samples[start + n]! * w;
      re += v * Math.cos((2 * Math.PI * k * n) / FRAME);
      im -= v * Math.sin((2 * Math.PI * k * n) / FRAME);
    }
    power.push(re * re + im * im + 1e-12);
  }
  const geometric = Math.exp(power.reduce((s, p) => s + Math.log(p), 0) / power.length);
  const arithmetic = power.reduce((s, p) => s + p, 0) / power.length;
  return geometric / arithmetic;
}

/** Median flatness over the loudest frames: what you actually hear as each drop lands. */
function loudFrameFlatness(samples: Float32Array): number {
  const frames: { start: number; energy: number }[] = [];
  for (let start = 0; start + FRAME < samples.length; start += FRAME) {
    let energy = 0;
    for (let n = 0; n < FRAME; n++) energy += samples[start + n]! ** 2;
    frames.push({ start, energy });
  }
  frames.sort((a, b) => b.energy - a.energy);
  const values = frames.slice(0, 200).map((f) => flatness(samples, f.start)).sort((a, b) => a - b);
  return values[Math.floor(values.length / 2)]!;
}

/** The old droplets: decaying sine pings, which sounded like wind chimes. */
function sinePings(): Float32Array {
  const rng = createRng(21);
  const data = new Float32Array(RATE * 6);
  for (let drop = 0; drop < 420; drop++) {
    const start = rng.int(0, data.length - 1);
    const frequency = 1500 + rng.float() * 4500;
    const decay = 0.004 + rng.float() * 0.012;
    const amplitude = 0.08 + rng.float() * 0.3;
    for (let i = start; i < Math.min(data.length, start + Math.floor(RATE * decay * 5)); i++) {
      const t = (i - start) / RATE;
      data[i] = data[i]! + amplitude * Math.exp(-t / decay) * Math.sin(2 * Math.PI * frequency * t);
    }
  }
  return data;
}

describe('rainGrains', () => {
  it('is unpitched: the loudest moments are noise, not tones (the old pings fail this)', () => {
    const grains = rainGrains(createRng(1), RATE, 8);
    expect(loudFrameFlatness(sinePings())).toBeLessThan(0.15);
    expect(loudFrameFlatness(grains)).toBeGreaterThan(0.35);
  });

  it('is dense, deterministic, finite and within ±1', () => {
    const grains = rainGrains(createRng(1), RATE, 8);
    expect(grains.length).toBe(RATE * 8);
    expect(grains).toEqual(rainGrains(createRng(1), RATE, 8));
    expect(grains.every((v) => Number.isFinite(v) && Math.abs(v) <= 1)).toBe(true);
    // Rain never lets up: every 50 ms window has impacts in it.
    for (let start = 0; start + RATE * 0.05 < grains.length; start += RATE * 0.05) {
      let loudest = 0;
      for (let i = start; i < start + RATE * 0.05; i++) loudest = Math.max(loudest, Math.abs(grains[i]!));
      expect(loudest).toBeGreaterThan(0.02);
    }
  });
});
