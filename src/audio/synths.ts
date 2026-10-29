import { createRng, type Rng } from '../core/rng';
import { RAIN_LOOP_SECONDS, brownNoise, pinkNoise, rainGrains, whiteNoise } from './noise';

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

const grainCache = new WeakMap<BaseAudioContext, AudioBuffer[]>();

/** The raindrop loops (see `rainGrains`): two lengths, so their repeats never line up. */
function grains(ctx: BaseAudioContext, index: 0 | 1): AudioBuffer {
  let buffers = grainCache.get(ctx);
  if (!buffers) {
    buffers = RAIN_LOOP_SECONDS.map((seconds, i) => {
      const data = rainGrains(createRng(21 + i), ctx.sampleRate, seconds);
      const buffer = ctx.createBuffer(1, data.length, ctx.sampleRate);
      buffer.copyToChannel(data as Float32Array<ArrayBuffer>, 0);
      return buffer;
    });
    grainCache.set(ctx, buffers);
  }
  return buffers[index]!;
}

/** A context whose output passes through an overall level: tune a whole sound with one number. */
function withLevel(s: SynthContext, level: number): SynthContext {
  const out = gain(s, level);
  out.connect(s.out);
  return { ...s, out };
}

/** Noise through a band-pass whose centre slides: scrapes, keys going in, bolts drawing back. */
function sweep(s: SynthContext, at: number, duration: number, colour: NoiseColour, from: number, to: number, q: number, peak: number): void {
  const source = noise(s, colour);
  const band = filter(s, 'bandpass', from, q);
  band.frequency.setValueAtTime(from, at);
  band.frequency.exponentialRampToValueAtTime(to, at + duration);
  const g = gain(s);
  g.gain.setValueAtTime(0.0001, at);
  g.gain.exponentialRampToValueAtTime(peak, at + duration * 0.25);
  g.gain.exponentialRampToValueAtTime(0.0001, at + duration);
  chain(source, band, g, s.out);
  startNoise(source, s, at, duration + 0.05);
}

/** A knock on wood: a short thud with a hollow body resonance. */
function knock(s: SynthContext, at: number, body: number, peak: number): void {
  burst(s, at, 'brown', 'lowpass', 380, peak, 0.09);
  burst(s, at, 'pink', 'bandpass', body, peak * 0.6, 0.06, 4);
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

  // Two drop loops of different lengths at slightly different speeds: they drift against each
  // other and never settle into a rhythm.
  for (const [index, rate] of [[0, 0.97], [1, 1.04]] as const) {
    const drops = s.ctx.createBufferSource();
    drops.buffer = grains(s.ctx, index);
    drops.loop = true;
    drops.playbackRate.value = rate;
    const dropsGain = gain(s, 0.4);
    chain(drops, dropsGain, s.out);
    drops.start(s.t, s.rng.float() * RAIN_LOOP_SECONDS[index]);
    drops.stop(until);
  }
  return s.seconds;
}

/** One heavy drop off the eaves or a leaf: the engine scatters these at random over the rain. */
export function splat(input: SynthContext): number {
  const s = withLevel(input, 2.5);
  burst(s, s.t, 'pink', 'bandpass', 1500 + s.rng.float() * 900, 0.45, 0.014, 1);
  burst(s, s.t, 'brown', 'lowpass', 900, 0.25, 0.03);
  return 0.1;
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
/** Thunder's overall level: one knob, set from measured peaks (close strikes peak near 0.9). */
const THUNDER_LEVEL = 1.75;

export function thunder(s: SynthContext): number {
  const close = Math.min(1, Math.max(0, s.param || 0.6));
  const length = 4.5 + (1 - close) * 4;
  const out = gain(s, THUNDER_LEVEL);
  out.connect(s.out);
  const inner: SynthContext = { ...s, out };
  if (close > 0.35) burst(inner, s.t, 'white', 'highpass', 1200, 0.25 * close, 0.25 + close * 0.2);
  // The boom you feel more than hear.
  tone(inner, s.t + 0.05 + (1 - close) * 0.3, 42, 24, 0.3 + 0.15 * close, 0.06, 2.8);
  const rumble = noise(s, 'brown', true);
  const low = filter(s, 'lowpass', 140 + close * 360, 0.9);
  const g = gain(s, 0.0001);
  chain(rumble, low, g, out);
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

/** Overall levels for the door sounds, set from measured peaks. */
const CREAK_LEVEL = 2.4;

/**
 * A dry hinge as the door swings: a shrill squeal that starts high and sinks and fades as the
 * door opens, with the stick-slip judder of wood on iron.
 */
export function creak(s: SynthContext): number {
  const length = 1.1 + s.rng.float() * 0.4;
  const squeal = s.ctx.createOscillator();
  squeal.type = 'sawtooth';
  const steps = 64;
  const start = 650 + s.rng.float() * 120;
  const end = 280 + s.rng.float() * 60;
  const pitch = new Float32Array(steps);
  for (let i = 0; i < steps; i++) {
    const t = i / (steps - 1);
    pitch[i] = start * (end / start) ** t * (1 + (s.rng.float() - 0.5) * 0.12);
  }
  squeal.frequency.setValueCurveAtTime(pitch, s.t, length);
  // Stick-slip: the sound stutters, fast at first, slower as the door gathers speed.
  const judder = s.ctx.createOscillator();
  judder.type = 'square';
  judder.frequency.setValueAtTime(26, s.t);
  judder.frequency.linearRampToValueAtTime(11, s.t + length);
  const stutter = gain(s, 0.55);
  const depth = gain(s, 0.45);
  chain(judder, depth);
  depth.connect(stutter.gain);
  const thin = filter(s, 'highpass', 600);
  const envelope = gain(s);
  envelope.gain.setValueAtTime(0.0001, s.t);
  envelope.gain.exponentialRampToValueAtTime(CREAK_LEVEL, s.t + 0.04);
  envelope.gain.exponentialRampToValueAtTime(0.0001, s.t + length);
  chain(squeal, thin);
  for (const [from, to, q] of [[1700, 1100, 6], [3300, 2300, 8]] as const) {
    const band = filter(s, 'bandpass', from, q);
    band.frequency.setValueAtTime(from, s.t);
    band.frequency.exponentialRampToValueAtTime(to, s.t + length);
    chain(thin, band, stutter);
  }
  chain(stutter, envelope, s.out);
  squeal.start(s.t);
  judder.start(s.t);
  squeal.stop(s.t + length + 0.05);
  judder.stop(s.t + length + 0.05);
  return length;
}

export function slam(input: SynthContext): number {
  const s = withLevel(input, 1.4);
  tone(s, s.t, 80, 40, 0.5, 0.004, 0.5);
  burst(s, s.t, 'brown', 'lowpass', 900, 0.35, 0.32);
  // The heavy wooden door itself.
  burst(s, s.t, 'pink', 'bandpass', 180, 0.3, 0.2, 3);
  // The frame and hinges rattle a moment after.
  for (let i = 0; i < 5; i++) burst(s, s.t + 0.04 + i * 0.03 + s.rng.float() * 0.02, 'white', 'bandpass', 2200, 0.08, 0.03, 3);
  return 0.7;
}

/** Trying a locked door: the brass knob rattles, the latch catches, the door knocks in its frame. */
export function lock(input: SynthContext): number {
  const s = withLevel(input, 3.2);
  for (let i = 0; i < 3; i++) burst(s, s.t + i * 0.06, 'white', 'bandpass', 1300 + s.rng.float() * 400, 0.22, 0.035, 1.5, 0.9 + s.rng.float() * 0.2);
  burst(s, s.t + 0.18, 'pink', 'bandpass', 900, 0.3, 0.025, 3);
  knock(s, s.t + 0.19, 220, 0.45);
  knock(s, s.t + 0.33, 190, 0.35);
  return 0.6;
}

/** A key going in and turning: a scrape, two clicks with a wooden body, the bolt drawing back, a clunk. */
export function unlock(input: SynthContext): number {
  const s = withLevel(input, 2.6);
  sweep(s, s.t, 0.18, 'white', 2600, 1200, 2, 0.12);
  for (const at of [s.t + 0.25, s.t + 0.38]) {
    burst(s, at, 'pink', 'bandpass', 1700 + s.rng.float() * 300, 0.3, 0.015, 2);
    burst(s, at, 'pink', 'bandpass', 260, 0.25, 0.06, 4);
  }
  sweep(s, s.t + 0.42, 0.13, 'pink', 1100, 700, 1, 0.16);
  knock(s, s.t + 0.56, 140, 0.45);
  return 0.8;
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

/** A heel on stone tile: a low-mid knock and a short gritty scuff (no bright click, which ticked). */
export function footstepTile(input: SynthContext): number {
  const s = withLevel(input, 2);
  const rate = 0.9 + s.rng.float() * 0.2;
  burst(s, s.t, 'pink', 'bandpass', 600 * rate, 0.45, 0.05, 1.2);
  burst(s, s.t, 'brown', 'lowpass', 300, 0.3, 0.06);
  burst(s, s.t + 0.02, 'white', 'highpass', 2500, 0.07, 0.07);
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

/** The grandfather clock's escapement: param 0 is the tick, 1 the lower tock. Woody, not electronic. */
export function clockTick(input: SynthContext): number {
  const s = withLevel(input, 3.8);
  const tock = s.param >= 0.5;
  burst(s, s.t, 'white', 'bandpass', tock ? 1700 : 2400, 0.35, 0.012, 3);
  burst(s, s.t, 'pink', 'bandpass', tock ? 650 : 900, 0.25, 0.04, 8);
  return 0.15;
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
  splat,
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
  clockTick,
  stinger,
  whisper,
  bat,
  rat,
  cat,
  heartbeat,
} as const satisfies Record<string, (s: SynthContext) => number>;

export type SoundName = keyof typeof SYNTHS;
export const SOUND_NAMES = Object.keys(SYNTHS) as SoundName[];
