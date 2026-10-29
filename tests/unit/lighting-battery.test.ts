import { describe, expect, it } from 'vitest';
import { createRng } from '../../src/core/rng';
import { BATTERY, createBattery, createCutOuts, isCritical, stepBattery, toggleFlashlight, type BatteryState } from '../../src/lighting/battery';

const run = (state: BatteryState, seconds: number, dt = 0.5) => {
  let s = state;
  for (let t = 0; t < seconds; t += dt) s = stepBattery(s, dt);
  return s;
};
const at = (level: number, on = false): BatteryState => ({ level, on, exhausted: false });

describe('battery', () => {
  it('starts between 60% and 70%, off, the same for a seed', () => {
    const levels = Array.from({ length: 200 }, (_, i) => createBattery(createRng(i)).level);
    for (const level of levels) {
      expect(level).toBeGreaterThanOrEqual(BATTERY.startMin);
      expect(level).toBeLessThanOrEqual(BATTERY.startMax);
    }
    expect(new Set(levels.map((l) => l.toFixed(4))).size).toBeGreaterThan(100);
    expect(createBattery(createRng(42))).toEqual(createBattery(createRng(42)));
    expect(createBattery(createRng(42)).on).toBe(false);
    expect(createBattery(createRng(42), 0.08).level).toBe(0.08);
  });

  it('drains while on, a full battery in about 10 minutes', () => {
    expect(BATTERY.drainSeconds).toBe(600);
    expect(run(at(0.6, true), 60).level).toBeCloseTo(0.5, 5);
  });

  it('never charges while off above 10%', () => {
    for (const level of [0.1, 0.3, 0.65]) expect(run(at(level), 600).level).toBe(level);
  });

  it('once below 10%, recovers only up to 10%, from 5% in about 40 s', () => {
    const half = run(at(0.05), 20);
    expect(half.level).toBeCloseTo(0.075, 3);
    expect(run(at(0.05), 40).level).toBeCloseTo(BATTERY.floor, 5);
    expect(run(at(0.05), 600).level).toBe(BATTERY.floor);
    let s = at(0.06);
    for (let i = 0; i < 4000; i++) {
      s = stepBattery(i % 300 < 120 ? toggleFlashlight({ ...s, on: false }) : { ...s, on: false }, 0.25);
      expect(s.level).toBeLessThanOrEqual(BATTERY.floor + 1e-9);
    }
  });

  it('switches off at 5% and cannot come on again until it is back at 10%', () => {
    let s = at(0.06, true);
    while (s.on) s = stepBattery(s, 0.5);
    expect(s).toEqual({ level: BATTERY.offLevel, on: false, exhausted: true });
    const flat = s;
    const almost = run(flat, 35);
    expect(almost.level).toBeLessThan(BATTERY.floor);
    expect(toggleFlashlight(almost).on).toBe(false);
    const enough = run(flat, 41);
    expect(enough.level).toBe(BATTERY.floor);
    expect(enough.exhausted).toBe(false);
    expect(toggleFlashlight(enough).on).toBe(true);
  });

  it('is critical below 10%', () => {
    expect(isCritical(0.099)).toBe(true);
    expect(isCritical(0.1)).toBe(false);
    expect(isCritical(0.65)).toBe(false);
  });
});

describe('cut-outs', () => {
  /** [start, end] of each cut-out over `seconds`, stepping at 60 fps. */
  const cuts = (seed: number, seconds: number, active: (t: number) => boolean) => {
    const cutOuts = createCutOuts(createRng(seed));
    const found: [number, number][] = [];
    for (let t = 0; t < seconds; t += 1 / 60) {
      const until = cutOuts.step(t, active(t));
      if (until > t && (!found.length || found[found.length - 1]![1] !== until)) found.push([t, until]);
    }
    return found;
  };

  it('never cut out unless active', () => {
    expect(cuts(1, 2000, () => false)).toEqual([]);
  });

  it('while active, last 1.5 to 4 s, 8 to 20 s apart', () => {
    for (const seed of [1, 2, 3, 42]) {
      const found = cuts(seed, 600, () => true);
      expect(found.length).toBeGreaterThan(15);
      expect(found[0]![0]).toBeGreaterThanOrEqual(8 - 1e-6);
      expect(found[0]![0]).toBeLessThanOrEqual(20 + 0.02);
      for (const [start, end] of found) {
        expect(end - start).toBeGreaterThanOrEqual(1.5 - 0.02);
        expect(end - start).toBeLessThanOrEqual(4);
      }
      for (let i = 1; i < found.length; i++) {
        const gap = found[i]![0] - found[i - 1]![1];
        expect(gap).toBeGreaterThanOrEqual(8 - 0.02);
        expect(gap).toBeLessThanOrEqual(20 + 0.02);
      }
    }
  });

  it('start afresh after a spell of not being active', () => {
    const found = cuts(5, 200, (t) => t > 100);
    expect(found.every(([start]) => start >= 108 - 0.02)).toBe(true);
  });

  it('are the same for a seed', () => {
    expect(cuts(42, 300, () => true)).toEqual(cuts(42, 300, () => true));
    expect(cuts(42, 300, () => true)).not.toEqual(cuts(43, 300, () => true));
  });
});
