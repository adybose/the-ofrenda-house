import { createRng, type Rng } from '../core/rng';
import { RAIN_LOOP_SECONDS, WHISPER_ONSETS, WHISPER_VOWELS, brownNoise, pinkNoise, rainGrains, stickSlip, whiteNoise, whisperScore, type SlipOptions } from './noise';

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

function woodBody(s: SynthContext): AudioNode {
  const input = gain(s, 1);
  const resonance = gain(s, 1);
  for (const [frequency, q] of WOOD_MODES) chain(input, filter(s, 'bandpass', frequency, q), resonance);
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

/** A latch's metal: inharmonic modes [ratio, ring seconds, level], as in a small brass or steel part. */
const METAL_MODES = [[1, 0.06, 1], [1.71, 0.045, 0.7], [2.63, 0.03, 0.5], [3.87, 0.02, 0.35]] as const;

/**
 * Metal striking metal (modal synthesis): a contact click rings a bank of narrow resonators, and the
 * part bounces `bounces` times a few milliseconds apart, each softer, as a latch does on its plate.
 */
function metalHit(s: SynthContext, at: number, base: number, peak: number, bounces = 2): void {
  const bands = METAL_MODES.map(([ratio, decay, weight]) => {
    const frequency = base * ratio * (0.98 + s.rng.float() * 0.04);
    const band = filter(s, 'bandpass', frequency, Math.PI * frequency * decay);
    // A narrow band rings longer but quieter: scale by its ring time to even them out.
    chain(band, gain(s, peak * weight * decay * 2500), s.out);
    return band;
  });
  // The contact itself: a short bright tick on top of the ring.
  const contact = filter(s, 'highpass', 2500);
  chain(contact, gain(s, peak * 0.3), s.out);
  let when = at;
  for (let b = 0; b < bounces; b++) {
    for (const band of bands) click(s, when, band, 0.45 ** b);
    click(s, when, contact, 0.45 ** b);
    when += 0.004 + s.rng.float() * 0.008;
  }
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

/** Thunder: param is closeness, 0 (far, a low grumble) to 1 (overhead: a ripping crack, then the boom). */
export function thunder(input: SynthContext): number {
  const close = Math.min(1, Math.max(0, input.param || 0.6));
  const length = 4.5 + (1 - close) * 4;
  const s = withLevel(saturate(input, THUNDER_DRIVE), THUNDER_LEVEL);
  if (close > 0.6) {
    // Overhead: a dense, uneven run of shocks that tears across the sky and thins out, opening with a slap.
    const strength = (close - 0.6) / 0.4;
    const span = 0.35 + 0.25 * strength;
    const crackle = slips(s, span, (t) => 2500 * (80 / 2500) ** (t / span), (t) => (1 - t / span) ** 0.7, { decay: 0.0015, rough: 1 });
    chain(crackle, filter(s, 'highpass', 300), gain(s, 0.5 + 0.6 * strength), s.out);
    crackle.start(s.t);
    burst(s, s.t, 'white', 'lowpass', 5000, 0.2 + 0.4 * strength, 0.06);
  } else if (close > 0.35) {
    burst(s, s.t, 'white', 'highpass', 1200, 0.25 * close, 0.25 + close * 0.2);
  }
  // The boom you feel more than hear.
  tone(s, s.t + 0.05 + (1 - close) * 0.3, 42, 24, 0.3 + 0.3 * close, 0.06, 2.8);
  const rumble = noise(s, 'brown', true);
  const low = filter(s, 'lowpass', 140 + close * 360, 0.9);
  const g = gain(s, 0.0001);
  chain(rumble, low, g, s.out);
  startNoise(rumble, s, s.t, length);
  const loud = 1 + 0.5 * close;
  g.gain.setValueAtTime(0.0001, s.t);
  g.gain.exponentialRampToValueAtTime(0.42 * loud, s.t + 0.08 + (1 - close) * 0.5);
  // Rolling: a few lurches as the sound arrives from different parts of the strike.
  let at = s.t + 0.4;
  while (at < s.t + length - 0.8) {
    g.gain.linearRampToValueAtTime((0.15 + s.rng.float() * 0.27) * loud, at);
    at += 0.25 + s.rng.float() * 0.6;
  }
  g.gain.exponentialRampToValueAtTime(0.0001, s.t + length);
  return length;
}

// ---- Doors and keys ----

/** Overall levels for the door sounds, set from measured peaks. */
const CREAK_LEVEL = 2;
const SLAM_LEVEL = 1;
const LOCK_LEVEL = 1.4;
const UNLOCK_LEVEL = 1.2;

/**
 * A door creaking open (stick-slip friction, after Farnell): the dry hinge sticks and lets go hundreds
 * of times a second at first, a shrill squeal, then slower and slower until the slips are separate
 * cracks. Every slip rings the wooden door and the iron hinge. It fades as the door swings free.
 */
export function creak(input: SynthContext): number {
  const s = withLevel(input, CREAK_LEVEL);
  const length = 1.2 + s.rng.float() * 0.4;
  const start = 550 + s.rng.float() * 200;
  const end = 22 + s.rng.float() * 12;
  const friction = slips(s, length, (t) => start * (end / start) ** ((t / length) ** 1.4), (t) => 1 - 0.8 * (t / length));
  friction.connect(woodBody(s));
  for (const [frequency, q, level] of [[1150, 7, 0.5], [2300, 9, 0.25]] as const) {
    chain(friction, filter(s, 'bandpass', frequency * (0.9 + s.rng.float() * 0.2), q), gain(s, level), s.out);
  }
  friction.start(s.t);
  return length + 0.1;
}

/** A heavy door slammed: a boom, the wood ringing, the latch snapping into its plate, the frame rattling. */
export function slam(input: SynthContext): number {
  const s = withLevel(saturate(input, 2), SLAM_LEVEL);
  tone(s, s.t, 85, 38, 0.6, 0.003, 0.7);
  burst(s, s.t, 'brown', 'lowpass', 900, 0.45, 0.35);
  click(s, s.t, woodBody(s), 3);
  burst(s, s.t, 'pink', 'bandpass', 180, 0.35, 0.25, 3);
  metalHit(s, s.t + 0.008, 1500, 0.25, 2);
  for (let i = 0; i < 5; i++) burst(s, s.t + 0.04 + i * 0.03 + s.rng.float() * 0.02, 'white', 'bandpass', 2200, 0.08, 0.03, 3);
  return 0.9;
}

/**
 * Trying a locked door: the knob turns against its spring, the latch stops hard on the bolt and the
 * door knocks in its frame; a second, weaker jiggle; then the spring snaps the knob back.
 */
export function lock(input: SynthContext): number {
  const s = withLevel(input, LOCK_LEVEL);
  const jiggle = (at: number, strength: number) => {
    const turn = slips(s, 0.12, () => 90, () => strength, { decay: 0.001, rough: 0.7 });
    chain(turn, filter(s, 'bandpass', 2400, 3), gain(s, 0.5), s.out);
    turn.start(at);
    metalHit(s, at + 0.12, 1700 + s.rng.float() * 200, 0.5 * strength, 2);
    click(s, at + 0.125, woodBody(s), 2 * strength);
    knock(s, at + 0.13, 210, 0.3 * strength);
  };
  jiggle(s.t, 1);
  jiggle(s.t + 0.26, 0.7);
  metalHit(s, s.t + 0.56, 2600, 0.25, 1);
  return 0.75;
}

/**
 * A key unlocking the door: it slides in over the pins (a scrape and small ticks), turns against the
 * spring, and throws the bolt back with a heavy clack through the wood; then the knob settles.
 */
export function unlock(input: SynthContext): number {
  const s = withLevel(input, UNLOCK_LEVEL);
  const slide = slips(s, 0.22, () => 160, () => 0.5, { decay: 0.0008, rough: 1 });
  chain(slide, filter(s, 'bandpass', 4200, 2), gain(s, 0.4), s.out);
  slide.start(s.t);
  for (let i = 0; i < 5; i++) metalHit(s, s.t + 0.03 + i * 0.04 + s.rng.float() * 0.01, 3600 + s.rng.float() * 600, 0.12, 1);
  const turn = slips(s, 0.18, (t) => 40 + 200 * t, () => 0.8, { decay: 0.0012, rough: 0.6 });
  chain(turn, filter(s, 'bandpass', 1900, 3), gain(s, 0.5), s.out);
  turn.start(s.t + 0.3);
  metalHit(s, s.t + 0.5, 1100, 0.6, 3);
  click(s, s.t + 0.5, woodBody(s), 3);
  knock(s, s.t + 0.505, 150, 0.3);
  metalHit(s, s.t + 0.68, 2400, 0.15, 1);
  return 0.9;
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
  sweep.frequency.exponentialRampToValueAtTime(700, s.t + 4.2);
  const g = gain(s);
  g.gain.setValueAtTime(0.0001, s.t);
  g.gain.exponentialRampToValueAtTime(0.42, s.t + 0.05);
  g.gain.setValueAtTime(0.42, s.t + 1.5);
  g.gain.exponentialRampToValueAtTime(0.18, s.t + 3.3);
  g.gain.exponentialRampToValueAtTime(0.0001, s.t + 5);
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
    osc.stop(s.t + 5.1);
    vibrato.stop(s.t + 5.1);
  }
  burst(s, s.t, 'white', 'highpass', 3200, 0.18, 1.4);
  return 5.1;
}

const WHISPER_LEVEL = 3;

/**
 * Someone whispering in your ear: a phrase of made-up words (`whisperScore`), breath through three
 * vowel formants that glide from syllable to syllable, and hissing consonants, close to one side.
 */
export function whisper(input: SynthContext): number {
  const ear = input.ctx.createStereoPanner();
  ear.pan.value = (input.rng.chance(0.5) ? -1 : 1) * (0.6 + input.rng.float() * 0.3);
  ear.connect(input.out);
  const s = withLevel({ ...input, out: ear }, WHISPER_LEVEL);
  const length = 1.8 + s.rng.float() * 0.8;
  const score = whisperScore(s.rng, length);

  const breath = noise(s, 'white');
  const vowel = gain(s, 0.0001);
  const first = WHISPER_VOWELS[score[0]?.vowel ?? 'a'];
  const bands = first.map((frequency, i) => {
    const band = filter(s, 'bandpass', frequency, [8, 10, 12][i]);
    chain(breath, band, gain(s, [1, 0.7, 0.4][i]), vowel);
    return band;
  });
  vowel.connect(s.out);
  const hissSource = noise(s, 'white');
  const hissBand = filter(s, 'bandpass', 6500, 2.5);
  const hiss = gain(s, 0.0001);
  chain(hissSource, hissBand, hiss, s.out);

  for (const syllable of score) {
    const at = s.t + syllable.start;
    const vowelAt = at + syllable.onsetLength;
    if (syllable.onset) {
      const onset = WHISPER_ONSETS[syllable.onset];
      hissBand.frequency.setValueAtTime(onset.frequency, at);
      hissBand.Q.setValueAtTime(onset.q, at);
      hiss.gain.setValueAtTime(0.0001, at);
      hiss.gain.exponentialRampToValueAtTime(onset.level * syllable.level, at + (onset.stop ? 0.004 : syllable.onsetLength * 0.4));
      hiss.gain.exponentialRampToValueAtTime(0.0001, vowelAt + 0.02);
    }
    // The mouth moves towards the vowel a moment early: the formants glide.
    WHISPER_VOWELS[syllable.vowel].forEach((frequency, i) => bands[i]!.frequency.setTargetAtTime(frequency, vowelAt - 0.03, 0.025));
    vowel.gain.setValueAtTime(0.0001, vowelAt - 0.01);
    vowel.gain.exponentialRampToValueAtTime(syllable.level, vowelAt + syllable.vowelLength * 0.3);
    vowel.gain.exponentialRampToValueAtTime(0.0001, vowelAt + syllable.vowelLength);
  }
  startNoise(breath, s, s.t, length);
  startNoise(hissSource, s, s.t, length);
  return length + 0.1;
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

const CAT_LEVEL = 0.5;

/**
 * A cat's meow: one steady voice (no vibrato) whose pitch rises and falls in a smooth arch, with the
 * mouth opening and closing, "mi-a-ow": the formants glide from i to a to u.
 */
export function cat(s: SynthContext): number {
  const length = 0.8 + s.rng.float() * 0.25;
  const pitch = 0.92 + s.rng.float() * 0.16;
  const voice = s.ctx.createOscillator();
  voice.type = 'sawtooth';
  const steps = 32;
  const curve = new Float32Array(steps);
  for (let i = 0; i < steps; i++) {
    const x = i / (steps - 1);
    const hz = x < 0.35 ? 520 + 200 * Math.sin((Math.PI / 2) * (x / 0.35)) : 720 - 260 * Math.sin((Math.PI / 2) * ((x - 0.35) / 0.65));
    curve[i] = hz * pitch;
  }
  voice.frequency.setValueCurveAtTime(curve, s.t, length);
  const soft = filter(s, 'lowpass', 3500);
  chain(voice, soft);
  const mouth = gain(s, 1);
  const shapes: [number, number, number, number][] = [
    // [start, open, end, q]
    [500, 1000, 450, 6],
    [2200, 1600, 900, 7],
    [3000, 2900, 2600, 8],
  ];
  for (const [i, [from, open, to, q]] of shapes.entries()) {
    const band = filter(s, 'bandpass', from, q);
    band.frequency.setValueAtTime(from, s.t);
    band.frequency.linearRampToValueAtTime(open, s.t + length * 0.35);
    band.frequency.linearRampToValueAtTime(to, s.t + length);
    chain(soft, band, gain(s, [1, 0.6, 0.3][i]), mouth);
  }
  chain(soft, filter(s, 'lowpass', 1200), gain(s, 0.15), mouth);
  const g = gain(s);
  g.gain.setValueAtTime(0.0001, s.t);
  g.gain.exponentialRampToValueAtTime(CAT_LEVEL, s.t + 0.06);
  g.gain.setValueAtTime(CAT_LEVEL, s.t + length * 0.6);
  g.gain.exponentialRampToValueAtTime(0.0001, s.t + length);
  chain(mouth, g, s.out);
  voice.start(s.t);
  voice.stop(s.t + length + 0.05);
  // A breath as the mouth opens.
  burst(s, s.t, 'white', 'bandpass', 3000, 0.05, 0.08, 1);
  return length + 0.1;
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
  heartbeat,
} as const satisfies Record<string, (s: SynthContext) => number>;

export type SoundName = keyof typeof SYNTHS;
export const SOUND_NAMES = Object.keys(SYNTHS) as SoundName[];
