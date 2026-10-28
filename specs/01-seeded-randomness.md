# 01: Seeded randomness
Status: Done
Depends on: 00

## Goal
Every run can be replayed exactly from one seed, so bugs, screenshots and tests are reproducible, while each run still feels new.

## Requirements
- WHEN given the same seed THE SYSTEM SHALL produce the same sequence of values on every machine and every run.
- THE SYSTEM SHALL accept a seed as a number or a string; strings are hashed to a 32-bit seed.
- WHEN a generator calls `fork(label)` THE SYSTEM SHALL return an independent stream derived only from the parent seed and the label, so drawing more values from one stream never changes another (for example, adding a scare never changes the household).
- THE SYSTEM SHALL provide `float` in [0, 1), inclusive `int(min, max)`, `chance(p)`, `pick`, `weighted` and a non-mutating `shuffle`.
- WHEN `pick` or `weighted` is given an empty list THE SYSTEM SHALL throw.
- WHEN the page URL has `?seed=<value>` THE SYSTEM SHALL use it as the run seed; otherwise THE SYSTEM SHALL choose a fresh seed and log it to the console so the run can be replayed.
- THE SYSTEM SHALL use a small hand-written PRNG (for example sfc32 seeded by a string hash). No dependency.
- Pure logic in `src/core`, `src/case`, `src/world` and `server/` SHALL NOT call `Math.random()`; an ESLint rule enforces this, with one allowed exception where a fresh run seed is chosen.

## Interfaces
```ts
type Seed = number | string;
interface Rng {
  readonly seed: number;
  float(): number;
  int(min: number, max: number): number;
  chance(p: number): boolean;
  pick<T>(items: readonly T[]): T;
  weighted<T>(items: readonly { value: T; weight: number }[]): T;
  shuffle<T>(items: readonly T[]): T[];
  fork(label: string): Rng;
}
function createRng(seed: Seed): Rng;
function hashSeed(seed: Seed): number;
function readRunSeed(url: URL): { seed: number; fromUrl: boolean };
```
Standard stream labels, exported as constants: `case`, `house`, `render`, `lighting`, `scares`, `voices`, `shadow`, `dialogue`.

## Out of scope
What any stream is used to generate.

## Acceptance checks
Must:
- [x] The same seed gives the same first 10,000 values; the first 5 values for seed 42 are pinned in a test so an accidental algorithm change is caught.
- [x] Drawing any number of values from `fork("a")` leaves `fork("b")` unchanged.
- [x] The same label on the same seed gives the same stream; different labels give different streams.
- [x] `int` stays inside its inclusive bounds over 100,000 draws and passes a loose chi-square uniformity test.
- [x] `pick`, `weighted` and `shuffle` never mutate their input; `pick([])` throws.
Should:
- [x] Playwright: `?seed=42` is used as the run seed, and with no seed the chosen seed is logged.
- [x] The lint rule rejects `Math.random()` in the pure-logic folders.

## Test plan
Vitest: determinism snapshot, fork independence, bounds and uniformity, immutability. Playwright: seed from the URL and the console log.
