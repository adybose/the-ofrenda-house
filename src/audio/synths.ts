import { createRng, type Rng } from '../core/rng';
import { brownNoise, pinkNoise, rainGrains, whiteNoise } from './noise';

// Every sound in the game, synthesised from oscillators, noise and filters. Each synth builds
// its nodes on any context (live or offline), connects them to `out`, starts at `t`, and returns
// how long it lasts. Gains keep every synth's peak under 1.0 on its own.

export interface SynthContext {
  ctx: BaseAudioContext;
  out: AudioNode;
  /** Start time in context seconds. */
  t: number;
  /** Sound-specific: thunder closeness 0..1, clock strike count, heartbeat strength. */
  param: number;
  /** For looping ambience: how long to run. */
  seconds: number;
  rng: Rng;
}

type NoiseColour = 'white' | 'pink' | 'brown';
const NOISE_SECONDS = 4;
const noiseCache = new WeakMap<BaseAudioContext, Map<NoiseColour, AudioBuffer>>();

function noiseBuffer(ctx: BaseAudioContext, colour: NoiseColour): AudioBuffer {
  let byColour = noiseCache.get(ctx);
  if (!byColour) {
    byColour = new Map();
    noiseCache.set(ctx, byColour);
  }
  let buffer = byColour.get(colour);
  if (!buffer) {
    // Fixed seeds: the noise itself is texture, not content, so it needn't vary per run.
    const length = Math.floor(ctx.sampleRate * NOISE_SECONDS);
    buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const make = colour === 'white' ? whiteNoise : colour === 'pink' ? pinkNoise : brownNoise;
    const seed = { white: 11, pink: 12, brown: 13 }[colour];
    buffer.copyToChannel(make(createRng(seed), length) as Float32Array<ArrayBuffer>, 0);
    byColour.set(colour, buffer);
  }
  return buffer;
}

function noise(s: SynthContext, colour: NoiseColour, loop = false): AudioBufferSourceNode {
  const source = s.ctx.createBufferSource();
  source.buffer = noiseBuffer(s.ctx, colour);
  source.loop = loop;
  // Start somewhere random in the buffer so repeats don't sound identical.
  source.loopStart = 0;
  return source;
}

function startNoise(source: AudioBufferSourceNode, s: SynthContext, at: number, duration: number): void {
  const offset = s.rng.float() * (NOISE_SECONDS - Math.min(duration, NOISE_SECONDS - 0.1) - 0.05);
  source.start(at, Math.max(0, offset), source.loop ? undefined : duration);
  if (source.loop) source.stop(at + duration);
}

function filter(s: SynthContext, type: BiquadFilterType, frequency: number, q = 0.7): BiquadFilterNode {
  const node = s.ctx.createBiquadFilter();
  node.type = type;
  node.frequency.value = frequency;
  node.Q.value = q;
  return node;
}

function gain(s: SynthContext, value = 0): GainNode {
  const node = s.ctx.createGain();
  node.gain.value = value;
  return node;
}

/** Quick attack, exponential decay. */
function pluck(param: AudioParam, at: number, peak: number, attack: number, decay: number): void {
  param.setValueAtTime(0.0001, at);
  param.exponentialRampToValueAtTime(peak, at + attack);
  param.exponentialRampToValueAtTime(0.0001, at + attack + decay);
}

function chain(...nodes: AudioNode[]): void {
  for (let i = 0; i < nodes.length - 1; i++) nodes[i]!.connect(nodes[i + 1]!);
}

/** A burst of filtered noise: the basis of clicks, thumps and scuffs. */
function burst(s: SynthContext, at: number, colour: NoiseColour, type: BiquadFilterType, frequency: number, peak: number, decay: number, q = 0.7, rate = 1): void {
  const source = noise(s, colour);
  source.playbackRate.value = rate;
  const f = filter(s, type, frequency, q);
  const g = gain(s);
  pluck(g.gain, at, peak, 0.002, decay);
  chain(source, f, g, s.out);
  startNoise(source, s, at, decay + 0.05);
}

/** A sine (or other) tone with a pitch glide and a pluck envelope. */
function tone(s: SynthContext, at: number, from: number, to: number, peak: number, attack: number, decay: number, type: OscillatorType = 'sine'): OscillatorNode {
  const osc = s.ctx.createOscillator();
  osc.type = type;
  osc.frequency.setValueAtTime(from, at);
  osc.frequency.exponentialRampToValueAtTime(to, at + attack + decay);
  const g = gain(s);
  pluck(g.gain, at, peak, attack, decay);
  chain(osc, g, s.out);
  osc.start(at);
  osc.stop(at + attack + decay + 0.05);
  return osc;
}

const grainCache = new WeakMap<BaseAudioContext, AudioBuffer>();

/** An 8 s loop of raindrop impacts (see `rainGrains`): unpitched, so nothing rings like a chime. */
function grains(ctx: BaseAudioContext): AudioBuffer {
  let buffer = grainCache.get(ctx);
  if (!buffer) {
    const data = rainGrains(createRng(21), ctx.sampleRate, 8);
    buffer = ctx.createBuffer(1, data.length, ctx.sampleRate);
    buffer.copyToChannel(data as Float32Array<ArrayBuffer>, 0);
    grainCache.set(ctx, buffer);
  }
  return buffer;
}

/** A very slow oscillator scaled to `depth`, added onto a parameter: endless, unrepeating drift. */
function drift(s: SynthContext, target: AudioParam, frequency: number, depth: number, until: number): void {
  const lfo = s.ctx.createOscillator();
  lfo.frequency.value = frequency;
  const scale = gain(s, depth);
  chain(lfo, scale);
  scale.connect(target);
  lfo.start(s.t);
  lfo.stop(until);
}

// ---- Ambience ----
// Both loop indefinitely at no ongoing cost: no per-drop or per-gust scheduling.

/** Heavy rain: a broadband roar, a low body (rain on roof and ground), and a loop of drop impacts. */
export function rain(s: SynthContext): number {
  const until = s.t + s.seconds;
  const roar = noise(s, 'white', true);
  const air = filter(s, 'highpass', 500);
  const presence = filter(s, 'peaking', 3500, 0.8);
  presence.gain.value = 3;
  const top = filter(s, 'lowpass', 9000);
  const roarGain = gain(s, 0.16);
  chain(roar, air, presence, top, roarGain, s.out);
  startNoise(roar, s, s.t, s.seconds);

  const body = noise(s, 'pink', true);
  const low = filter(s, 'lowpass', 1200);
  const bodyGain = gain(s, 0.35);
  chain(body, low, bodyGain, s.out);
  startNoise(body, s, s.t, s.seconds);

  const drops = s.ctx.createBufferSource();
  drops.buffer = grains(s.ctx);
  drops.loop = true;
  const dropsGain = gain(s, 0.55);
  chain(drops, dropsGain, s.out);
  drops.start(s.t, s.rng.float() * 7);
  drops.stop(until);
  return s.seconds;
}

export function wind(s: SynthContext): number {
  const until = s.t + s.seconds;
  const source = noise(s, 'brown', true);
  const band = filter(s, 'bandpass', 420, 1.4);
  const g = gain(s, 0.45);
  chain(source, band, g, s.out);
  startNoise(source, s, s.t, s.seconds);
  // Gusts: unrelated slow oscillators sliding the band and swelling the level.
  drift(s, band.frequency, 0.071, 170, until);
  drift(s, band.frequency, 0.163, 110, until);
  drift(s, g.gain, 0.053, 0.2, until);
  drift(s, g.gain, 0.131, 0.15, until);
  return s.seconds;
}

/** Thunder: param is closeness, 0 (far, a low grumble) to 1 (overhead, a sharp crack). */
export function thunder(s: SynthContext): number {
  const close = Math.min(1, Math.max(0, s.param || 0.6));
  const length = 4 + (1 - close) * 4;
  if (close > 0.35) burst(s, s.t, 'white', 'highpass', 1200, 0.25 * close, 0.25 + close * 0.2);
  // The boom you feel more than hear.
  tone(s, s.t + 0.05 + (1 - close) * 0.3, 42, 24, 0.3 + 0.15 * close, 0.06, 2.5);
  const rumble = noise(s, 'brown', true);
  const low = filter(s, 'lowpass', 140 + close * 360, 0.9);
  const g = gain(s, 0.0001);
  chain(rumble, low, g, s.out);
  startNoise(rumble, s, s.t, length);
  g.gain.setValueAtTime(0.0001, s.t);
  g.gain.exponentialRampToValueAtTime(0.42, s.t + 0.08 + (1 - close) * 0.5);
  // Rolling: a few lurches as the sound arrives from different parts of the strike.
  let at = s.t + 0.4;
  while (at < s.t + length - 0.8) {
    g.gain.linearRampToValueAtTime(0.15 + s.rng.float() * 0.27, at);
    at += 0.25 + s.rng.float() * 0.6;
  }
  g.gain.exponentialRampToValueAtTime(0.0001, s.t + length);
  return length;
}

// ---- Doors and keys ----

export function creak(s: SynthContext): number {
  const length = 0.9 + s.rng.float() * 0.6;
  // Stick-slip: a slow, wavering sawtooth through a narrow resonance, like a dry hinge.
  const saw = s.ctx.createOscillator();
  saw.type = 'sawtooth';
  const steps = 24;
  const rate = new Float32Array(steps);
  for (let i = 0; i < steps; i++) rate[i] = 18 + s.rng.float() * 30 + (i / steps) * 15;
  saw.frequency.setValueCurveAtTime(rate, s.t, length);
  const band = filter(s, 'bandpass', 650, 14);
  band.frequency.setValueAtTime(600 + s.rng.float() * 200, s.t);
  band.frequency.linearRampToValueAtTime(1000 + s.rng.float() * 400, s.t + length);
  const g = gain(s);
  g.gain.setValueAtTime(0.0001, s.t);
  g.gain.exponentialRampToValueAtTime(3.2, s.t + 0.08);
  g.gain.setValueAtTime(3.2, s.t + length - 0.2);
  g.gain.exponentialRampToValueAtTime(0.0001, s.t + length);
  chain(saw, band, g, s.out);
  saw.start(s.t);
  saw.stop(s.t + length + 0.05);
  return length;
}

export function slam(s: SynthContext): number {
  tone(s, s.t, 75, 42, 0.55, 0.004, 0.45);
  burst(s, s.t, 'brown', 'lowpass', 900, 0.4, 0.3);
  // The frame and hinges rattle a moment after.
  for (let i = 0; i < 5; i++) burst(s, s.t + 0.04 + i * 0.03 + s.rng.float() * 0.02, 'white', 'bandpass', 2500, 0.08, 0.03, 4);
  return 0.6;
}

function metalClick(s: SynthContext, at: number, pitch: number, peak: number): void {
  burst(s, at, 'white', 'bandpass', pitch * 1.3, peak, 0.02, 6);
  tone(s, at, pitch, pitch * 0.98, peak * 0.4, 0.001, 0.07);
}

/** Trying a locked door: the latch catches and the handle rattles. */
export function lock(s: SynthContext): number {
  metalClick(s, s.t, 2800, 0.35);
  metalClick(s, s.t + 0.11, 2300, 0.3);
  for (let i = 0; i < 3; i++) metalClick(s, s.t + 0.25 + i * 0.07, 2000 + s.rng.float() * 600, 0.15);
  return 0.6;
}

/** A key turning: two clicks and the bolt drawing back. */
export function unlock(s: SynthContext): number {
  metalClick(s, s.t, 2200, 0.3);
  metalClick(s, s.t + 0.09, 3100, 0.3);
  tone(s, s.t + 0.16, 210, 150, 0.35, 0.003, 0.12, 'triangle');
  burst(s, s.t + 0.16, 'brown', 'lowpass', 600, 0.2, 0.1);
  return 0.4;
}

// ---- Footsteps ----

export function footstepWood(s: SynthContext): number {
  const rate = 0.9 + s.rng.float() * 0.2;
  burst(s, s.t, 'pink', 'lowpass', 900, 0.45, 0.09, 0.7, rate);
  tone(s, s.t, 120 * rate, 80, 0.35, 0.003, 0.08);
  // An occasional board complains.
  if (s.rng.chance(0.15)) burst(s, s.t + 0.05, 'white', 'bandpass', 900, 0.06, 0.15, 12);
  return 0.3;
}

export function footstepTile(s: SynthContext): number {
  const rate = 0.9 + s.rng.float() * 0.2;
  burst(s, s.t, 'white', 'highpass', 1800, 0.3, 0.04, 0.7, rate);
  burst(s, s.t, 'white', 'bandpass', 3200 * rate, 0.25, 0.05, 5);
  tone(s, s.t, 160, 120, 0.2, 0.002, 0.05);
  return 0.2;
}

export function footstepCarpet(s: SynthContext): number {
  burst(s, s.t, 'pink', 'lowpass', 420, 0.4, 0.12, 0.7, 0.9 + s.rng.float() * 0.2);
  return 0.25;
}

export function footstepStone(s: SynthContext): number {
  burst(s, s.t, 'white', 'bandpass', 1300, 0.35, 0.06, 2, 0.9 + s.rng.float() * 0.2);
  tone(s, s.t, 95, 70, 0.3, 0.002, 0.07);
  return 0.25;
}

export function flashlightClick(s: SynthContext): number {
  burst(s, s.t, 'white', 'highpass', 3000, 0.35, 0.008);
  burst(s, s.t + 0.028, 'white', 'highpass', 4000, 0.2, 0.006);
  return 0.1;
}

// ---- The grandfather clock ----

/** param: how many strikes (midnight is 12, dawn is 6). */
export function clock(s: SynthContext): number {
  const strikes = Math.max(1, Math.round(s.param || 1));
  const base = 196;
  const partials: [number, number, number][] = [
    [1, 0.26, 3.8],
    [2.0, 0.12, 2.6],
    [2.76, 0.1, 2.0],
    [4.07, 0.05, 1.3],
    [5.4, 0.04, 0.9],
  ];
  for (let i = 0; i < strikes; i++) {
    const at = s.t + i * 1.6;
    for (const [ratio, peak, decay] of partials) tone(s, at, base * ratio, base * ratio * 0.999, peak, 0.004, decay);
    burst(s, at, 'white', 'bandpass', 2400, 0.08, 0.02, 3);
  }
  return (strikes - 1) * 1.6 + 4;
}

// ---- Scares ----

export function stinger(s: SynthContext): number {
  // A dissonant cluster of strings that swells, with a scraping screech on top.
  const sweep = filter(s, 'lowpass', 300, 2);
  sweep.frequency.setValueAtTime(300, s.t);
  sweep.frequency.exponentialRampToValueAtTime(4200, s.t + 0.35);
  sweep.frequency.exponentialRampToValueAtTime(900, s.t + 2.2);
  const g = gain(s);
  g.gain.setValueAtTime(0.0001, s.t);
  g.gain.exponentialRampToValueAtTime(0.42, s.t + 0.05);
  g.gain.setValueAtTime(0.42, s.t + 0.45);
  g.gain.exponentialRampToValueAtTime(0.0001, s.t + 2.4);
  chain(sweep, g, s.out);
  for (const f of [233, 247, 277, 311, 466, 494]) {
    const osc = s.ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.value = f * (1 + (s.rng.float() - 0.5) * 0.01);
    const vibrato = s.ctx.createOscillator();
    vibrato.frequency.value = 5 + s.rng.float() * 3;
    const depth = gain(s, f * 0.012);
    chain(vibrato, depth);
    depth.connect(osc.frequency);
    const each = gain(s, 0.22);
    chain(osc, each, sweep);
    osc.start(s.t);
    vibrato.start(s.t);
    osc.stop(s.t + 2.5);
    vibrato.stop(s.t + 2.5);
  }
  burst(s, s.t, 'white', 'highpass', 3200, 0.18, 0.6);
  return 2.5;
}

export function whisper(s: SynthContext): number {
  const length = 1.6 + s.rng.float() * 0.8;
  const formants = [650, 1150, 2500].map((f) => filter(s, 'bandpass', f * (0.9 + s.rng.float() * 0.2), 7));
  const breath = noise(s, 'white');
  const g = gain(s, 0.0001);
  for (const f of formants) {
    breath.connect(f);
    f.connect(g);
  }
  g.connect(s.out);
  startNoise(breath, s, s.t, length);
  // Syllables: short swells with the vowel shifting between them.
  let at = s.t;
  while (at < s.t + length - 0.2) {
    const syllable = 0.1 + s.rng.float() * 0.16;
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(0.9 + s.rng.float() * 0.5, at + syllable * 0.3);
    g.gain.exponentialRampToValueAtTime(0.0001, at + syllable);
    for (const f of formants) f.frequency.setValueAtTime(f.frequency.value * (0.85 + s.rng.float() * 0.3), at);
    at += syllable + 0.03 + s.rng.float() * 0.08;
  }
  return length;
}

export function bat(s: SynthContext): number {
  const length = 0.9;
  // Wingbeats: noise chopped about 15 times a second.
  for (let at = s.t; at < s.t + length; at += 1 / (13 + s.rng.float() * 4)) {
    burst(s, at, 'pink', 'bandpass', 1300 + s.rng.float() * 600, 0.9, 0.04, 1.5);
  }
  for (let i = 0; i < 7; i++) {
    const at = s.t + s.rng.float() * length;
    tone(s, at, 11_000, 8000, 0.15, 0.002, 0.012);
  }
  return length + 0.1;
}

export function rat(s: SynthContext): number {
  for (let i = 0; i < 4; i++) {
    const at = s.t + i * (0.12 + s.rng.float() * 0.1);
    const squeak = tone(s, at, 3400 + s.rng.float() * 900, 4400, 0.22, 0.01, 0.08 + s.rng.float() * 0.07);
    const flutter = s.ctx.createOscillator();
    flutter.frequency.value = 28;
    const depth = gain(s, 250);
    chain(flutter, depth);
    depth.connect(squeak.frequency);
    flutter.start(at);
    flutter.stop(at + 0.2);
  }
  // Claws skittering on boards.
  for (let i = 0; i < 12; i++) burst(s, s.t + 0.5 + i * 0.05 + s.rng.float() * 0.02, 'white', 'bandpass', 4200, 0.12, 0.006, 3);
  return 1.2;
}

export function cat(s: SynthContext): number {
  const length = 1.5;
  const voice = s.ctx.createOscillator();
  voice.type = 'sawtooth';
  voice.frequency.setValueAtTime(420, s.t);
  voice.frequency.exponentialRampToValueAtTime(900, s.t + 0.25);
  voice.frequency.exponentialRampToValueAtTime(650, s.t + 0.9);
  voice.frequency.exponentialRampToValueAtTime(380, s.t + length);
  const vibrato = s.ctx.createOscillator();
  vibrato.frequency.value = 7;
  const depth = gain(s, 30);
  chain(vibrato, depth);
  depth.connect(voice.frequency);
  const g = gain(s);
  g.gain.setValueAtTime(0.0001, s.t);
  g.gain.exponentialRampToValueAtTime(0.32, s.t + 0.08);
  g.gain.setValueAtTime(0.32, s.t + 0.9);
  g.gain.exponentialRampToValueAtTime(0.0001, s.t + length);
  // Two formants give the "ow" of a yowl.
  const mix = gain(s, 1);
  for (const [f, q] of [[950, 5], [1900, 6]] as const) {
    const band = filter(s, 'bandpass', f, q);
    chain(voice, band, mix);
  }
  chain(voice, filter(s, 'lowpass', 2800), gain(s, 0.15), mix);
  chain(mix, g, s.out);
  voice.start(s.t);
  vibrato.start(s.t);
  voice.stop(s.t + length + 0.05);
  vibrato.stop(s.t + length + 0.05);
  burst(s, s.t + 0.1, 'white', 'bandpass', 2600, 0.08, 0.8, 2);
  return length + 0.1;
}

/** One lub-dub. param scales the strength (spec 12's tension). */
export function heartbeat(s: SynthContext): number {
  const strength = Math.min(1, Math.max(0.1, s.param || 1));
  tone(s, s.t, 58, 40, 0.8 * strength, 0.01, 0.16);
  burst(s, s.t, 'brown', 'lowpass', 120, 0.25 * strength, 0.12);
  tone(s, s.t + 0.28, 50, 38, 0.55 * strength, 0.01, 0.13);
  return 0.6;
}

export const SYNTHS = {
  rain,
  wind,
  thunder,
  creak,
  slam,
  lock,
  unlock,
  footstepWood,
  footstepTile,
  footstepCarpet,
  footstepStone,
  flashlightClick,
  clock,
  stinger,
  whisper,
  bat,
  rat,
  cat,
  heartbeat,
} as const satisfies Record<string, (s: SynthContext) => number>;

export type SoundName = keyof typeof SYNTHS;
export const SOUND_NAMES = Object.keys(SYNTHS) as SoundName[];
