import { createRng, type Rng } from '../core/rng';
import { RAIN_LOOP_SECONDS, WHISPER_ONSETS, WHISPER_VARIANTS, WHISPER_VOWELS, brownNoise, pinkNoise, rainGrains, stickSlip, whiteNoise, whisperScore, type SlipOptions } from './noise';

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

/** A knock on wood: a short thud with a hollow body resonance. */
function knock(s: SynthContext, at: number, body: number, peak: number): void {
  burst(s, at, 'brown', 'lowpass', 380, peak, 0.09);
  burst(s, at, 'pink', 'bandpass', body, peak * 0.6, 0.06, 4);
}

/** Stick-slip friction as a one-shot source (see `stickSlip`): creaks, scrapes, crackle. */
function slips(s: SynthContext, seconds: number, rate: (t: number) => number, amp: (t: number) => number, options?: SlipOptions): AudioBufferSourceNode {
  const data = stickSlip(s.rng, s.ctx.sampleRate, seconds, rate, amp, options);
  const buffer = s.ctx.createBuffer(1, data.length, s.ctx.sampleRate);
  buffer.copyToChannel(data as Float32Array<ArrayBuffer>, 0);
  const source = s.ctx.createBufferSource();
  source.buffer = buffer;
  return source;
}

/** A wooden door's body (after Farnell): six broad resonances, a little dry signal, then the panel's short echoes. */
const WOOD_MODES = [[62.5, 1], [125, 1], [250, 2], [395, 2], [560, 3], [790, 3]] as const;
const PANEL_DELAYS_MS = [4.52, 5.06, 6.27, 8, 5.48, 7.14, 10.12, 16];

function woodBody(s: SynthContext, lowest = 0): AudioNode {
  const input = gain(s, 1);
  const resonance = gain(s, 1);
  for (const [frequency, q] of WOOD_MODES) if (frequency >= lowest) chain(input, filter(s, 'bandpass', frequency, q), resonance);
  chain(input, gain(s, 0.2), resonance);
  const panel = gain(s, 4 / PANEL_DELAYS_MS.length);
  for (const ms of PANEL_DELAYS_MS) {
    const delay = s.ctx.createDelay(0.02);
    delay.delayTime.value = ms / 1000;
    chain(resonance, delay, panel);
  }
  chain(panel, filter(s, 'highpass', 125), s.out);
  return input;
}

const clickCache = new WeakMap<BaseAudioContext, AudioBuffer>();

/** A millisecond of decaying noise: the contact that sets a resonator ringing. */
function click(s: SynthContext, at: number, destination: AudioNode, level = 1): void {
  let buffer = clickCache.get(s.ctx);
  if (!buffer) {
    const length = Math.ceil(s.ctx.sampleRate * 0.002);
    const data = whiteNoise(createRng(14), length).map((v, i) => v * Math.exp(-i / (length / 5)));
    buffer = s.ctx.createBuffer(1, length, s.ctx.sampleRate);
    buffer.copyToChannel(data as Float32Array<ArrayBuffer>, 0);
    clickCache.set(s.ctx, buffer);
  }
  const source = s.ctx.createBufferSource();
  source.buffer = buffer;
  chain(source, gain(s, level), destination);
  source.start(at);
}

/**
 * A latch or knob in a wooden door: a dry mechanical click, no ring. A short bright tick and a woody
 * clack a few milliseconds apart, and a little knock through the door. `pitch` scales the whole
 * (lower for a heavy bolt), `peak` its loudness.
 */
function latchClick(s: SynthContext, at: number, pitch: number, peak: number): void {
  burst(s, at, 'white', 'bandpass', 2200 * pitch, peak, 0.004, 2.5);
  burst(s, at + 0.003 + s.rng.float() * 0.003, 'pink', 'bandpass', 650 * pitch, peak * 0.8, 0.012, 3);
  knock(s, at + 0.002, 240 * pitch, peak * 0.25);
}

/** Soft clipping: more weight and loudness for thunder and the slam, never past 1. */
function saturate(s: SynthContext, drive: number, level = 0.95): SynthContext {
  const shaper = s.ctx.createWaveShaper();
  const curve = new Float32Array(1025);
  for (let i = 0; i < curve.length; i++) curve[i] = (level * Math.tanh(drive * ((i / 512) - 1))) / Math.tanh(drive);
  shaper.curve = curve;
  shaper.oversample = '2x';
  shaper.connect(s.out);
  return { ...s, out: shaper };
}

const voiceCache = new WeakMap<BaseAudioContext, Map<number, PeriodicWave>>();

/** A voice-like source: harmonics falling off as 1/n^`fall`. 1.5 is soft; nearer 1 is bright and strained. */
function voiceWave(ctx: BaseAudioContext, fall = 1.5): PeriodicWave {
  let waves = voiceCache.get(ctx);
  if (!waves) {
    waves = new Map();
    voiceCache.set(ctx, waves);
  }
  let wave = waves.get(fall);
  if (!wave) {
    const harmonics = 40;
    const real = new Float32Array(harmonics + 1);
    const imag = new Float32Array(harmonics + 1);
    for (let n = 1; n <= harmonics; n++) imag[n] = 1 / n ** fall;
    wave = ctx.createPeriodicWave(real, imag);
    waves.set(fall, wave);
  }
  return wave;
}

/**
 * Irregular voicing: band-limited noise wobbling a pitch at audio rate, about `hz` either way. A little
 * (1%) is the jitter of any living voice; a lot (15%) is the chaotic harshness of a strained throat.
 * Returns the node so a second voice can follow it.
 */
function rasp(s: SynthContext, hz: number, bandwidth: number, until: number): GainNode {
  const source = noise(s, 'white', true);
  const band = filter(s, 'lowpass', bandwidth);
  const depth = gain(s, hz * 3);
  chain(source, band, depth);
  startNoise(source, s, s.t, until - s.t);
  return depth;
}

/**
 * A cat's vocal tract: resonant peaks [Hz, dB, Q] in cascade over the whole spectrum, then the mouth
 * (a low-pass). Peaks, not band-passes: band-passes would leave single harmonics whistling.
 */
function vocalTract(s: SynthContext, formants: readonly (readonly [number, number, number])[], out: AudioNode): { input: AudioNode; peaks: BiquadFilterNode[]; mouth: BiquadFilterNode } {
  const input = gain(s, 1);
  let last: AudioNode = input;
  const peaks = formants.map(([frequency, boost, q]) => {
    const peak = filter(s, 'peaking', frequency, q);
    peak.gain.value = boost;
    last.connect(peak);
    last = peak;
    return peak;
  });
  const mouth = filter(s, 'lowpass', 7000, 0.5);
  chain(last, mouth, out);
  return { input, peaks, mouth };
}

const pushCache = new WeakMap<BaseAudioContext, AudioBuffer>();

/** One low push of air, a single raised-cosine bump about 18 ms long: all weight, no pitch, nothing to ring. */
function push(s: SynthContext, at: number, peak: number): void {
  let buffer = pushCache.get(s.ctx);
  if (!buffer) {
    const length = Math.ceil(s.ctx.sampleRate * 0.018);
    buffer = s.ctx.createBuffer(1, length, s.ctx.sampleRate);
    buffer.copyToChannel(Float32Array.from({ length }, (_, i) => 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / length)), 0);
    pushCache.set(s.ctx, buffer);
  }
  const source = s.ctx.createBufferSource();
  source.buffer = buffer;
  chain(source, gain(s, peak), filter(s, 'lowpass', 120), s.out);
  source.start(at);
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
  const roarGain = gain(s, 0.22);
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
    const dropsGain = gain(s, 0.55);
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
  const g = gain(s, 0.25);
  chain(source, band, g, s.out);
  startNoise(source, s, s.t, s.seconds);
  // Gusts: unrelated slow oscillators sliding the band and swelling the level.
  drift(s, band.frequency, 0.071, 170, until);
  drift(s, band.frequency, 0.163, 110, until);
  drift(s, g.gain, 0.053, 0.11, until);
  drift(s, g.gain, 0.131, 0.08, until);
  return s.seconds;
}

/** Thunder's overall level, and how hard it drives the soft clipper: set from measured levels. */
const THUNDER_LEVEL = 2.2;
const THUNDER_DRIVE = 1.6;

/**
 * Thunder: param is closeness, 0 (far, a low grumble) to 1 (overhead: a ripping crack, then the boom).
 * Close strikes roll on for seconds, their brightness falling away gradually rather than all at once.
 */
export function thunder(input: SynthContext): number {
  const close = Math.min(1, Math.max(0, input.param || 0.6));
  const length = close > 0.6 ? 7 + (close - 0.6) * 2.5 : 4.5 + (1 - close) * 4;
  const s = withLevel(saturate(input, THUNDER_DRIVE), THUNDER_LEVEL);
  if (close > 0.6) {
    // Overhead: a dense, uneven run of shocks that tears across the sky and thins out, opening with a slap.
    const strength = (close - 0.6) / 0.4;
    const span = 0.35 + 0.25 * strength;
    const crackle = slips(s, span, (t) => 2500 * (80 / 2500) ** (t / span), (t) => (1 - t / span) ** 0.7, { decay: 0.0015, rough: 1 });
    chain(crackle, filter(s, 'highpass', 300), gain(s, 0.5 + 0.6 * strength), s.out);
    crackle.start(s.t);
    burst(s, s.t, 'white', 'lowpass', 5000, 0.2 + 0.4 * strength, 0.06);
    // The roll that carries on from the crack: bright at first, darkening and fading over seconds.
    const roll = noise(s, 'pink', true);
    const shade = filter(s, 'lowpass', 4000, 0.7);
    shade.frequency.setValueAtTime(4000, s.t);
    shade.frequency.exponentialRampToValueAtTime(300, s.t + 4);
    const fade = gain(s, 0.0001);
    fade.gain.setValueAtTime(0.0001, s.t);
    fade.gain.exponentialRampToValueAtTime(0.35 * (0.6 + 0.4 * strength), s.t + 0.25);
    fade.gain.exponentialRampToValueAtTime(0.0001, s.t + 4.2);
    chain(roll, shade, fade, s.out);
    startNoise(roll, s, s.t, 4.3);
  } else if (close > 0.35) {
    burst(s, s.t, 'white', 'highpass', 1200, 0.25 * close, 0.25 + close * 0.2);
  }
  // The boom you feel more than hear.
  tone(s, s.t + 0.05 + (1 - close) * 0.3, 42, 24, 0.3 + 0.3 * close, 0.06, 2.8);
  // The rumble: its low-pass slides down over the whole strike, so it darkens gradually.
  const rumble = noise(s, 'brown', true);
  const top = 140 + close * 360;
  const low = filter(s, 'lowpass', top * (1 + 4 * close), 0.9);
  low.frequency.setValueAtTime(top * (1 + 4 * close), s.t);
  low.frequency.exponentialRampToValueAtTime(Math.min(top, 250), s.t + length);
  const g = gain(s, 0.0001);
  chain(rumble, low, g, s.out);
  startNoise(rumble, s, s.t, length);
  const loud = 1 + 0.5 * close;
  g.gain.setValueAtTime(0.0001, s.t);
  g.gain.exponentialRampToValueAtTime(0.42 * loud, s.t + 0.08 + (1 - close) * 0.5);
  // Rolling: lurches as the sound arrives from different parts of the strike, riding a long decay.
  let at = s.t + 0.4;
  while (at < s.t + length - 1) {
    const decay = Math.exp(-(at - s.t) / (length * 0.4));
    g.gain.linearRampToValueAtTime((0.25 + s.rng.float() * 0.2) * loud * decay, at);
    at += 0.25 + s.rng.float() * 0.6;
  }
  g.gain.exponentialRampToValueAtTime(0.0001, s.t + length);
  return length;
}

// ---- Doors and keys ----

/** Overall levels for the door sounds, set from measured peaks. */
const CREAK_LEVEL = 2.5;
const SLAM_LEVEL = 4.5;
const LOCK_LEVEL = 4;
const UNLOCK_LEVEL = 3.5;

/**
 * A door creaking open (stick-slip friction, after Farnell): the dry hinge sticks and lets go hundreds
 * of times a second, a shrill squeal that slides down into a groan as the door swings. The rate wanders
 * only a little, so it stays smooth; every slip rings the wooden door and the iron hinge.
 */
export function creak(input: SynthContext): number {
  const s = withLevel(input, CREAK_LEVEL);
  const length = 1.2 + s.rng.float() * 0.4;
  const start = 550 + s.rng.float() * 200;
  const end = 110 + s.rng.float() * 30;
  const friction = slips(s, length, (t) => start * (end / start) ** ((t / length) ** 1.2), (t) => 1 - 0.6 * (t / length), { decay: 0.003, jitter: 1.25 });
  const soft = filter(s, 'lowpass', 4000);
  const envelope = gain(s);
  envelope.gain.setValueAtTime(0.0001, s.t);
  envelope.gain.exponentialRampToValueAtTime(1, s.t + 0.08);
  envelope.gain.setValueAtTime(1, s.t + length * 0.5);
  envelope.gain.exponentialRampToValueAtTime(0.0001, s.t + length);
  chain(friction, soft, envelope);
  envelope.connect(woodBody(s));
  for (const [frequency, q, level] of [[1150, 7, 0.5], [2300, 9, 0.2]] as const) {
    chain(envelope, filter(s, 'bandpass', frequency * (0.9 + s.rng.float() * 0.2), q), gain(s, level), s.out);
  }
  friction.start(s.t);
  return length + 0.1;
}

/**
 * A wooden door slammed: a sharp crack as it hits the frame (broadband, ringing the wood), a low-mid
 * thud from the panel and the air it moves, gone within a few tenths of a second, and the latch
 * snapping home. Not sub-bass (a drum) and no pitched tone (a plucked string); the room does the rest.
 */
export function slam(input: SynthContext): number {
  const s = withLevel(saturate(input, 1.5, 0.85), SLAM_LEVEL);
  click(s, s.t, woodBody(s, 100), 4);
  burst(s, s.t, 'white', 'bandpass', 2200, 0.35, 0.006, 0.6);
  burst(s, s.t, 'pink', 'bandpass', 170, 0.7, 0.09, 1.2);
  burst(s, s.t, 'pink', 'bandpass', 330, 0.45, 0.05, 1.5);
  push(s, s.t, 0.35);
  latchClick(s, s.t + 0.008, 1, 0.12);
  for (let i = 0; i < 3; i++) burst(s, s.t + 0.03 + i * 0.03 + s.rng.float() * 0.02, 'white', 'bandpass', 2200, 0.03, 0.03, 3);
  return 0.4;
}

/**
 * Trying a locked door: a soft click as the knob turns, a clack as the latch catches on the bolt and
 * the door bumps in its frame; a second, weaker jiggle; then a click as the knob springs back.
 */
export function lock(input: SynthContext): number {
  const s = withLevel(input, LOCK_LEVEL);
  const jiggle = (at: number, strength: number) => {
    latchClick(s, at, 1.2, 0.25 * strength);
    latchClick(s, at + 0.09, 0.9, 0.5 * strength);
    knock(s, at + 0.095, 200, 0.35 * strength);
  };
  jiggle(s.t, 1);
  jiggle(s.t + 0.24, 0.7);
  latchClick(s, s.t + 0.5, 1.15, 0.3);
  return 0.65;
}

/**
 * A key unlocking the door: small dry ticks as it slides in over the pins, then a click-clunk as the
 * bolt goes back, felt through the wood, and a last soft click as the knob settles.
 */
export function unlock(input: SynthContext): number {
  const s = withLevel(input, UNLOCK_LEVEL);
  for (let i = 0; i < 4; i++) latchClick(s, s.t + i * 0.05 + s.rng.float() * 0.015, 1.5, 0.1);
  latchClick(s, s.t + 0.35, 1, 0.35);
  latchClick(s, s.t + 0.42, 0.7, 0.6);
  knock(s, s.t + 0.425, 150, 0.45);
  latchClick(s, s.t + 0.62, 1.1, 0.2);
  return 0.75;
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

/** A heel on stone tile: like stone, a little higher and harder. */
export function footstepTile(s: SynthContext): number {
  const rate = 0.9 + s.rng.float() * 0.2;
  burst(s, s.t, 'white', 'bandpass', 1900 * rate, 0.35, 0.05, 2);
  tone(s, s.t, 140 * rate, 100, 0.3, 0.002, 0.06);
  return 0.25;
}

const CARPET_LEVEL = 2.2;

/** A step on carpet: a muffled thud and the soft brush of the pile. The softest floor, but heard. */
export function footstepCarpet(input: SynthContext): number {
  const s = withLevel(input, CARPET_LEVEL);
  const rate = 0.9 + s.rng.float() * 0.2;
  burst(s, s.t, 'pink', 'lowpass', 420, 0.4, 0.12, 0.7, rate);
  burst(s, s.t + 0.01, 'pink', 'bandpass', 1200, 0.12, 0.08, 0.8, rate);
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
  sweep.frequency.exponentialRampToValueAtTime(800, s.t + 3.2);
  const g = gain(s);
  g.gain.setValueAtTime(0.0001, s.t);
  g.gain.exponentialRampToValueAtTime(0.42, s.t + 0.05);
  g.gain.setValueAtTime(0.42, s.t + 1);
  g.gain.exponentialRampToValueAtTime(0.18, s.t + 2.3);
  g.gain.exponentialRampToValueAtTime(0.0001, s.t + 3.6);
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
    osc.stop(s.t + 3.7);
    vibrato.stop(s.t + 3.7);
  }
  burst(s, s.t, 'white', 'highpass', 3200, 0.18, 1);
  return 3.7;
}

const WHISPER_LEVEL = 1.6;

/**
 * Someone whispering in your ear, never quite understood: one of `WHISPER_VARIANTS` (param 1 to 6, or
 * 0 for any), a slow phrase of made-up syllables as one continuous breath through three vowel formants
 * that drift from syllable to syllable, with soft hushing consonants. The breath swells and eases
 * gently, never chopped, close to one ear.
 */
export function whisper(input: SynthContext): number {
  const index = input.param >= 1 && input.param <= WHISPER_VARIANTS.length ? Math.round(input.param) : input.rng.int(1, WHISPER_VARIANTS.length);
  const variant = WHISPER_VARIANTS[index - 1]!;
  const ear = input.ctx.createStereoPanner();
  ear.pan.value = variant.pan;
  const soft = filter(input, 'lowpass', 5000);
  chain(soft, ear, input.out);
  const s = withLevel({ ...input, out: soft }, WHISPER_LEVEL);
  const score = whisperScore(createRng(variant.seed), variant.seconds);
  const mouth = (vowel: keyof typeof WHISPER_VOWELS) => WHISPER_VOWELS[vowel].map((f) => f * variant.formants);

  const breath = noise(s, 'white');
  const vowel = gain(s, 0);
  const bands = mouth(score[0]?.vowel ?? 'a').map((frequency, i) => {
    const band = filter(s, 'bandpass', frequency, [7, 9, 11][i]);
    chain(breath, band, gain(s, [1, 0.7, 0.4][i]), vowel);
    return band;
  });
  vowel.connect(s.out);
  const hissSource = noise(s, 'white');
  const hissBand = filter(s, 'bandpass', 3000, 1.6);
  const hiss = gain(s, 0);
  chain(hissSource, hissBand, hiss, s.out);

  for (const [i, syllable] of score.entries()) {
    const at = s.t + syllable.start;
    const vowelAt = at + syllable.onsetLength;
    if (syllable.onset) {
      const onset = WHISPER_ONSETS[syllable.onset];
      hissBand.frequency.setValueAtTime(onset.frequency, at);
      hissBand.Q.setValueAtTime(onset.q, at);
      hiss.gain.setTargetAtTime(onset.level * syllable.level, at, syllable.onsetLength * 0.4);
      hiss.gain.setTargetAtTime(0, vowelAt - 0.02, 0.06);
    }
    // The mouth drifts towards each vowel; the breath swells slowly into it and eases off.
    mouth(syllable.vowel).forEach((frequency, k) => bands[k]!.frequency.setTargetAtTime(frequency, vowelAt - 0.1, 0.12));
    vowel.gain.setTargetAtTime(syllable.level, vowelAt - 0.08, 0.12);
    // Between words (a longer gap) the breath sinks low; between syllables it only dips.
    const next = score[i + 1];
    const end = vowelAt + syllable.vowelLength;
    const gap = next ? next.start - end : 1;
    vowel.gain.setTargetAtTime(syllable.level * (gap > 0.1 ? 0.25 : 0.6), end - 0.06, 0.15);
  }
  const last = score.at(-1);
  vowel.gain.setTargetAtTime(0, last ? s.t + last.start + last.onsetLength + last.vowelLength : s.t, 0.15);
  startNoise(breath, s, s.t, variant.seconds + 0.6);
  startNoise(hissSource, s, s.t, variant.seconds + 0.6);
  return variant.seconds + 0.7;
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

/** How one cat cry goes: the meow and the scream are the same voice, shaped differently. */
interface MeowShape {
  length: number;
  /** Pitch in Hz at x, from 0 to 1 along the cry. */
  pitch: (x: number) => number;
  /** The jaw: F1 in Hz at points [x, Hz], and its boost in dB at the start and the end. */
  f1: readonly (readonly [number, number])[];
  f1Boost: readonly [number, number];
  /** F2 and F3 [Hz, dB, Q]: weak and nearly still in a cat's short vocal tract. */
  upper: readonly (readonly [number, number, number])[];
  /** The lips' low-pass in Hz at points [x, Hz]. */
  lips: readonly (readonly [number, number])[];
  /** Level at points [x, fraction of `level`], after starting from silence. */
  envelope: readonly (readonly [number, number])[];
  level: number;
  /** Jitter as a fraction of the pitch; breath as a fraction of the voice; how fast the harmonics fall. */
  jitter: number;
  breath: number;
  brightness: number;
}

/**
 * One cat cry through a short vocal tract (`vocalTract`), after recorded meows: the first formant
 * does the work, rising as the jaw opens and falling as it closes.
 */
function meow(s: SynthContext, shape: MeowShape): number {
  const { length } = shape;
  const at = (x: number) => s.t + x * length;
  const steps = 48;
  const curve = Float32Array.from({ length: steps }, (_, i) => shape.pitch(i / (steps - 1)));
  const voice = s.ctx.createOscillator();
  voice.setPeriodicWave(voiceWave(s.ctx, shape.brightness));
  voice.frequency.setValueCurveAtTime(curve, s.t, length);
  rasp(s, Math.max(...curve) * shape.jitter, 300, at(1) + 0.1).connect(voice.frequency);

  const envelope = gain(s);
  const tract = vocalTract(s, [[shape.f1[0]![1], shape.f1Boost[0], 3], ...shape.upper], envelope);
  const f1 = tract.peaks[0]!;
  for (const [x, hz] of shape.f1) f1.frequency.linearRampToValueAtTime(hz, at(x));
  f1.gain.setValueAtTime(shape.f1Boost[0], at(0.4));
  f1.gain.linearRampToValueAtTime(shape.f1Boost[1], at(1));
  tract.mouth.frequency.setValueAtTime(shape.lips[0]![1], s.t);
  for (const [x, hz] of shape.lips.slice(1)) tract.mouth.frequency.exponentialRampToValueAtTime(hz, at(x));
  voice.connect(tract.input);
  const breath = noise(s, 'white');
  chain(breath, gain(s, shape.breath), tract.input);
  startNoise(breath, s, s.t, length + 0.05);

  envelope.gain.setValueAtTime(0.0001, s.t);
  for (const [x, level] of shape.envelope) envelope.gain.exponentialRampToValueAtTime(Math.max(0.0001, shape.level * level), at(x));
  envelope.connect(s.out);
  voice.start(s.t);
  voice.stop(at(1) + 0.05);
  return length + 0.1;
}

const CAT_LEVEL = 0.14;

/**
 * A cat's meow, "m-ia-ow" (after Schötz and colleagues' recordings), on the shrill side: about 780 Hz
 * rising to 1060 and falling to 700, opening from a closed-mouth "m", fullest as the jaw opens, then tapering away as it
 * closes to "ow", the jaw's resonance softening with it.
 */
export function cat(s: SynthContext): number {
  const length = 0.7 + s.rng.float() * 0.3;
  const pitch = 0.95 + s.rng.float() * 0.1;
  return meow(s, {
    length,
    pitch: (x) => pitch * (x < 0.3 ? 780 + 280 * Math.sin((Math.PI / 2) * (x / 0.3)) : 1060 - 360 * Math.sin((Math.PI / 2) * ((x - 0.3) / 0.7))),
    f1: [[0, 800], [0.07, 800], [0.4, 1800], [1, 900]],
    f1Boost: [14, 6],
    upper: [[3000, 6, 4], [5000, 4, 4]],
    lips: [[0, 500], [0.1, 7000], [0.6, 7000], [1, 2000]],
    envelope: [[0.07, 0.3], [0.4, 1], [0.6, 0.55], [0.8, 0.25], [1, 0]],
    level: CAT_LEVEL,
    jitter: 0.01,
    breath: 0.12,
    brightness: 1.25,
  });
}

const CAT_SCREAM_LEVEL = 0.22;

/**
 * A cat screaming as it bolts (spec 13's scares): a shrill, strained meow, the pain shriek of the Lund
 * recordings ("short intense cries of tense vowels, often [æ], [ɛ] or [i]", with "great strain at
 * mouth and throat"). It bursts out on an open [æ], climbs fast from about 950 to 1550 Hz, holds,
 * and falls away as the mouth closes. A bright, tense voice with a little jitter: no noise bursts,
 * no growl.
 */
export function catScream(s: SynthContext): number {
  const length = 1 + s.rng.float() * 0.3;
  const pitch = 0.95 + s.rng.float() * 0.1;
  return meow(s, {
    length,
    pitch: (x) => pitch * (x < 0.25 ? 950 + 600 * Math.sin((Math.PI / 2) * (x / 0.25)) : x < 0.7 ? 1550 - 100 * ((x - 0.25) / 0.45) : 1450 - 600 * Math.sin((Math.PI / 2) * ((x - 0.7) / 0.3))),
    f1: [[0, 900], [0.2, 1800], [0.7, 1800], [1, 1000]],
    f1Boost: [7, 4],
    upper: [[3600, 12, 2], [5000, 10, 2.5]],
    lips: [[0, 1500], [0.03, 8000], [0.7, 8000], [1, 3000]],
    envelope: [[0.03, 1], [0.65, 0.9], [0.85, 0.4], [1, 0]],
    level: CAT_SCREAM_LEVEL,
    jitter: 0.02,
    breath: 0.08,
    brightness: 1,
  });
}

/** The grandfather clock's escapement: param 0 is the tick, 1 the lower tock. Woody, not electronic. */
export function clockTick(input: SynthContext): number {
  const s = withLevel(input, 5);
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
  catScream,
  heartbeat,
} as const satisfies Record<string, (s: SynthContext) => number>;

export type SoundName = keyof typeof SYNTHS;
export const SOUND_NAMES = Object.keys(SYNTHS) as SoundName[];
