import { describe, expect, it } from 'vitest';
import { createRng } from '../../src/core/rng';
import { IMPULSE_SECONDS, generateImpulse } from '../../src/audio/impulse';
import { brownNoise, pinkNoise, whiteNoise } from '../../src/audio/noise';
import { OneShotPool } from '../../src/audio/pool';
import { thunderDelay } from '../../src/audio/thunder';

const RATE = 44_100;

describe('thunderDelay', () => {
  it('is about 3 s per km, clamped to 0.5-6 s', () => {
    expect(thunderDelay(1)).toBeCloseTo(3, 5);
    expect(thunderDelay(0.05)).toBe(0.5);
    expect(thunderDelay(10)).toBe(6);
    let last = 0;
    for (let km = 0; km <= 5; km += 0.1) {
      const delay = thunderDelay(km);
      expect(delay).toBeGreaterThanOrEqual(last);
      expect(delay).toBeGreaterThanOrEqual(0.5);
      expect(delay).toBeLessThanOrEqual(6);
      last = delay;
    }
  });
});

/** Seconds until the impulse response's envelope falls 60 dB below its peak. */
function tail(channel: Float32Array): number {
  const peak = channel.reduce((m, v) => Math.max(m, Math.abs(v)), 0);
  const window = Math.floor(RATE * 0.01);
  for (let end = channel.length; end > window; end -= window) {
    let loud = 0;
    for (let i = end - window; i < end; i++) loud = Math.max(loud, Math.abs(channel[i]!));
    if (loud > peak * 0.001) return end / RATE;
  }
  return 0;
}

describe('generateImpulse', () => {
  it('is deterministic for a seed', () => {
    const a = generateImpulse('medium', RATE, createRng(4));
    const b = generateImpulse('medium', RATE, createRng(4));
    expect(a.left).toEqual(b.left);
    expect(a.right).toEqual(b.right);
    expect(generateImpulse('medium', RATE, createRng(5)).left).not.toEqual(a.left);
  });

  it('gives longer tails for larger rooms', () => {
    const small = tail(generateImpulse('small', RATE, createRng(1)).left);
    const medium = tail(generateImpulse('medium', RATE, createRng(1)).left);
    const large = tail(generateImpulse('large', RATE, createRng(1)).left);
    expect(small).toBeLessThan(medium);
    expect(medium).toBeLessThan(large);
    expect(IMPULSE_SECONDS.small).toBeLessThan(IMPULSE_SECONDS.large);
  });

  it('is stereo, finite and within ±1', () => {
    for (const size of ['small', 'medium', 'large'] as const) {
      const { left, right } = generateImpulse(size, RATE, createRng(2));
      expect(left.length).toBe(right.length);
      expect(left).not.toEqual(right);
      for (const v of [...left, ...right]) {
        expect(Number.isFinite(v)).toBe(true);
        expect(Math.abs(v)).toBeLessThanOrEqual(1);
      }
    }
  });
});

describe('noise', () => {
  it('is deterministic, finite and within ±1 for every colour', () => {
    for (const make of [whiteNoise, pinkNoise, brownNoise]) {
      const a = make(createRng(3), 20_000);
      expect(a).toEqual(make(createRng(3), 20_000));
      expect(a.every((v) => Number.isFinite(v) && Math.abs(v) <= 1)).toBe(true);
      expect(a.some((v) => Math.abs(v) > 0.05)).toBe(true);
    }
  });

  it('gets darker from white to pink to brown (less sample-to-sample change)', () => {
    const roughness = (x: Float32Array) => x.slice(1).reduce((s, v, i) => s + Math.abs(v - x[i]!), 0) / x.length;
    const energy = (x: Float32Array) => x.reduce((s, v) => s + Math.abs(v), 0) / x.length;
    const ratio = (x: Float32Array) => roughness(x) / energy(x);
    expect(ratio(whiteNoise(createRng(1), 50_000))).toBeGreaterThan(ratio(pinkNoise(createRng(1), 50_000)));
    expect(ratio(pinkNoise(createRng(1), 50_000))).toBeGreaterThan(ratio(brownNoise(createRng(1), 50_000)));
  });
});

describe('OneShotPool', () => {
  it('never holds more than the cap and stops the oldest first, over a 60 s stress test', () => {
    const pool = new OneShotPool(32);
    const rng = createRng(8);
    const stopped: number[] = [];
    let started = 0;
    let max = 0;
    for (let t = 0; t < 60; t += 1 / 60) {
      // A burst of footsteps, creaks and scares: several new sounds most frames.
      for (let n = rng.int(0, 4); n > 0; n--) {
        const id = started++;
        pool.add({ stop: () => stopped.push(id) }, t + 0.2 + rng.float() * 4, t);
      }
      max = Math.max(max, pool.size);
      expect(pool.size).toBeLessThanOrEqual(32);
    }
    expect(max).toBe(32);
    expect(stopped.length).toBeGreaterThan(0);
    // Stopped sounds were started in order: always the oldest still playing.
    expect([...stopped].sort((a, b) => a - b)).toEqual(stopped);
  });

  it('lets finished sounds go without stopping them', () => {
    const pool = new OneShotPool(2);
    let stops = 0;
    pool.add({ stop: () => stops++ }, 1, 0);
    pool.add({ stop: () => stops++ }, 1, 0);
    pool.add({ stop: () => stops++ }, 3, 2);
    expect(stops).toBe(0);
    expect(pool.size).toBe(1);
  });
});
