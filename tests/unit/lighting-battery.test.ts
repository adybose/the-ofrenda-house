import { describe, expect, it } from 'vitest';
import { BATTERY, createBattery, stepBattery, toggleFlashlight } from '../../src/lighting/battery';

const run = (state = createBattery(), seconds: number, dt = 1) => {
  let s = state;
  for (let t = 0; t < seconds; t += dt) s = stepBattery(s, dt);
  return s;
};

describe('battery', () => {
  it('starts full and off, and toggles on', () => {
    const s = createBattery();
    expect(s).toEqual({ level: 1, on: false, exhausted: false });
    expect(toggleFlashlight(s).on).toBe(true);
    expect(toggleFlashlight(toggleFlashlight(s)).on).toBe(false);
  });

  it('drains from full to empty in about 6 minutes while on', () => {
    expect(BATTERY.drainSeconds).toBe(360);
    const on = toggleFlashlight(createBattery());
    expect(run(on, 180).level).toBeCloseTo(0.5, 5);
    expect(run(on, 359).on).toBe(true);
    const flat = run(on, 361);
    expect(flat.level).toBe(0);
    expect(flat.on).toBe(false);
    expect(flat.exhausted).toBe(true);
  });

  it('recharges slowly while off and never above full', () => {
    const half = { level: 0.5, on: false, exhausted: false };
    const later = run(half, 60);
    expect(later.level).toBeCloseTo(0.5 + 60 / BATTERY.rechargeSeconds, 5);
    expect(BATTERY.rechargeSeconds).toBeGreaterThan(BATTERY.drainSeconds);
    expect(run(half, 10_000).level).toBe(1);
  });

  it('will not switch back on after running flat until it reaches 10%', () => {
    // The moment it runs flat (the drain test shows how it gets here).
    const flat = { level: 0, on: false, exhausted: true };
    expect(toggleFlashlight(flat).on).toBe(false);
    // 10% of a 600 s recharge is 60 s.
    const almost = run(flat, 59);
    expect(toggleFlashlight(almost).on).toBe(false);
    const enough = run(flat, 61);
    expect(enough.exhausted).toBe(false);
    expect(toggleFlashlight(enough).on).toBe(true);
  });

  it('can be switched back on below 10% if it never ran flat', () => {
    expect(toggleFlashlight({ level: 0.05, on: false, exhausted: false }).on).toBe(true);
  });
});
