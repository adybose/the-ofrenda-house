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

/**
 * Stick-slip friction (after Farnell, Designing Sound): the moments a dry hinge or a rough surface
 * lets go. Slips come at `rate(t)` a second, jittered by smoothly wandering noise between
 * 1/`jitter` and `jitter` times that (by default half to twice), so the train never settles into a
 * tone. Fast slips fuse into a squeal; slow ones are heard as separate cracks.
 */
export function slipTimes(rng: Rng, seconds: number, rate: (t: number) => number, jitter = 2): number[] {
  const JITTER_PER_SECOND = 50;
  const points = Array.from({ length: Math.ceil(seconds * JITTER_PER_SECOND) + 2 }, () => rng.float() * 2 - 1);
  const wander = (t: number) => {
    const x = t * JITTER_PER_SECOND;
    const i = Math.floor(x);
    const v = points[i]! + (points[i + 1]! - points[i]!) * (x - i);
    return jitter ** v;
  };
  const times: number[] = [];
  for (let t = 0; ; ) {
    t += 1 / Math.max(1, rate(t) * wander(t));
    if (t >= seconds) return times;
    times.push(t);
  }
}

export interface SlipOptions {
  /** Seconds each slip takes to die away (before the resonators ring it out). */
  decay?: number;
  /** 0: each slip is a clean impulse (a hinge); 1: a burst of noise (a crack of thunder). */
  rough?: number;
  /** How far the rate wanders (see `slipTimes`): 2 is rough, nearer 1 is smooth. */
  jitter?: number;
}

/**
 * The slips as samples: each a sharp pulse whose strength grows with the force built up since the
 * last one (a long stick lets go harder), scaled by `amp(t)`. Feed it through resonators.
 */
export function stickSlip(rng: Rng, sampleRate: number, seconds: number, rate: (t: number) => number, amp: (t: number) => number, options: SlipOptions = {}): Float32Array {
  const decay = options.decay ?? 0.002;
  const rough = options.rough ?? 0;
  const out = new Float32Array(Math.floor(sampleRate * seconds));
  let last = 0;
  for (const t of slipTimes(rng, seconds, rate, options.jitter)) {
    // Force builds over about a tenth of a second between slips.
    const strength = Math.sqrt(Math.min(1, (t - last) * 10)) * amp(t);
    last = t;
    const start = Math.floor(t * sampleRate);
    const end = Math.min(out.length, start + Math.ceil(decay * 5 * sampleRate));
    for (let i = start; i < end; i++) {
      const grain = 1 - rough + rough * (rng.float() * 2 - 1);
      out[i] = out[i]! + strength * Math.exp(-(i - start) / sampleRate / decay) * grain;
    }
  }
  for (let i = 0; i < out.length; i++) out[i] = Math.max(-1, Math.min(1, out[i]!));
  return out;
}

export type WhisperVowel = 'a' | 'e' | 'i' | 'o' | 'u';
export type WhisperOnset = 's' | 'sh' | 'f' | 'h';

/** The first three formants of each vowel in Hz, a little higher than voiced, as whispers are. */
export const WHISPER_VOWELS: Record<WhisperVowel, readonly [number, number, number]> = {
  a: [850, 1300, 2650],
  e: [600, 1950, 2700],
  i: [380, 2350, 3100],
  o: [650, 1000, 2550],
  u: [420, 950, 2450],
};

/**
 * Only soft, hushing consonants, as bands of hiss: sibilants high and narrow, f and h broad. No stops
 * (t, k): they make it sound like words, and the whisper should never quite be understood.
 */
export const WHISPER_ONSETS: Record<WhisperOnset, { frequency: number; q: number; level: number }> = {
  s: { frequency: 6500, q: 2.5, level: 0.35 },
  sh: { frequency: 3000, q: 1.6, level: 0.5 },
  f: { frequency: 5000, q: 0.5, level: 0.25 },
  h: { frequency: 1600, q: 0.6, level: 0.35 },
};

export interface WhisperSyllable {
  /** Seconds from the start of the phrase. */
  start: number;
  onset?: WhisperOnset;
  onsetLength: number;
  vowel: WhisperVowel;
  vowelLength: number;
  /** Loudness 0..1: the phrase swells in the middle. */
  level: number;
}

/**
 * A whispered phrase of made-up words, about four syllables a second: a hushing consonant (most of
 * the time), a vowel, and now and then a breath between words. It opens with a hiss.
 */
export function whisperScore(rng: Rng, seconds: number): WhisperSyllable[] {
  const vowels = Object.keys(WHISPER_VOWELS) as WhisperVowel[];
  const onsets: WhisperOnset[] = ['sh', 'sh', 'h', 'h', 's', 'f'];
  const score: WhisperSyllable[] = [];
  let t = 0.02;
  for (;;) {
    const onset = score.length === 0 ? rng.pick(['s', 'sh'] as const) : rng.chance(0.6) ? rng.pick(onsets) : undefined;
    const onsetLength = onset ? 0.06 + rng.float() * 0.06 : 0;
    const vowelLength = 0.11 + rng.float() * 0.09;
    if (t + onsetLength + vowelLength > seconds) return score;
    const middle = t + (onsetLength + vowelLength) / 2;
    const level = (0.55 + 0.45 * Math.sin((Math.PI * middle) / seconds)) * (0.85 + rng.float() * 0.15);
    score.push({ start: t, onset, onsetLength, vowel: rng.pick(vowels), vowelLength, level });
    t += onsetLength + vowelLength + (rng.chance(0.25) ? 0.1 + rng.float() * 0.08 : 0.015 + rng.float() * 0.03);
  }
}
