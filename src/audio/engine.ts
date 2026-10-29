import { createRng, type Rng } from '../core/rng';
import type { SizeClass } from '../world/types';
import { generateImpulse } from './impulse';
import { WHISPER_VARIANTS, pickVariant } from './noise';
import { OneShotPool } from './pool';
import { SYNTHS, type SoundName } from './synths';

export type Vec3 = readonly [number, number, number];

export interface PlayOptions {
  /** World position in metres; without it the sound plays in the head (footsteps, clicks). */
  position?: Vec3;
  gain?: number;
  param?: number;
  /** Seconds from now. */
  delay?: number;
}

/** Sounds on the stinger bus (dry and close: no room reverb, and the storm ducks under them); the storm's own sounds; thunder has a channel of its own. */
const STINGERS: ReadonlySet<SoundName> = new Set(['stinger', 'whisper']);
const STORM: ReadonlySet<SoundName> = new Set(['rain', 'wind', 'splat']);

/** The storm's level: full outside; indoors, quieter the further from a window. */
const STORM_INDOORS = { far: 0.3, nearWindow: 0.55 };
/** Thunder is loud outside and still loud, but muffled, inside. The master limiter catches its peaks. */
const THUNDER = { outdoors: 1.4, indoors: 0.9 };

const MAX_ONE_SHOTS = 32;
/** Ambience level while a voice speaks. */
const DUCKED = 0.35;
/** How long the reverb takes to change room. */
const REVERB_FADE = 0.5;

/**
 * The game's sound. Nothing exists until `unlock()` (a user gesture), so nothing plays before it.
 * Buses: ambience (muffled indoors, ducked under voices), effects and voice (through the room
 * reverb) and stingers (dry), into a master bus with a limiter.
 */
export class AudioEngine {
  private ctx: AudioContext | undefined;
  private master!: GainNode;
  private ambience!: GainNode;
  private muffle!: BiquadFilterNode;
  private effects!: GainNode;
  private stingers!: GainNode;
  private voice!: GainNode;
  private voiceMeter!: AnalyserNode;
  private stingerMeter!: AnalyserNode;
  /** Rain and wind, after the muffle: turned down indoors. */
  private storm!: GainNode;
  private thunderIn!: GainNode;
  private thunderMuffle!: BiquadFilterNode;
  private thunderLevel!: GainNode;
  private reverbs!: [{ convolver: ConvolverNode; level: GainNode }, { convolver: ConvolverNode; level: GainNode }];
  private activeReverb = 0;
  private roomSize: SizeClass = 'medium';
  private readonly impulses = new Map<SizeClass, AudioBuffer>();
  private readonly pool = new OneShotPool(MAX_ONE_SHOTS);
  private readonly rng: Rng;
  private tension = 0;
  private nextBeat = 0;
  private rainLevel!: GainNode;
  private rainTarget = 1;
  private rainChangeAt = 0;
  private plays = 0;
  private outdoors = false;
  private windowDistance = 30;
  private nextSplat = 0;
  private clock: Vec3 | undefined;
  private nextTick = 0;
  private tock = false;
  private lastWhisper: number | undefined;

  constructor(private readonly options: { seed: number; muted: boolean }) {
    this.rng = createRng(options.seed).fork('audio');
  }

  /** 'none' until the first gesture creates the context. */
  get state(): AudioContextState | 'none' {
    return this.ctx?.state ?? 'none';
  }

  /** Call from a user gesture. Builds the graph, starts the storm, and resumes the context. */
  async unlock(): Promise<void> {
    if (!this.ctx) this.build(new AudioContext());
    if (this.ctx!.state !== 'running') await this.ctx!.resume();
  }

  private build(ctx: AudioContext): void {
    this.ctx = ctx;
    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -6;
    limiter.knee.value = 3;
    limiter.ratio.value = 12;
    limiter.attack.value = 0.003;
    limiter.release.value = 0.25;
    this.master = ctx.createGain();
    this.master.gain.value = this.options.muted ? 0 : 0.9;
    this.master.connect(limiter).connect(ctx.destination);

    // The room: two convolvers so a change of room crossfades.
    const reverbReturn = ctx.createGain();
    reverbReturn.gain.value = 0.4;
    reverbReturn.connect(this.master);
    const makeReverb = (level: number) => {
      const convolver = ctx.createConvolver();
      const gainNode = ctx.createGain();
      gainNode.gain.value = level;
      convolver.connect(gainNode).connect(reverbReturn);
      return { convolver, level: gainNode };
    };
    this.reverbs = [makeReverb(1), makeReverb(0)];
    this.reverbs[0].convolver.buffer = this.impulse(this.roomSize);
    const send = (bus: GainNode) => {
      bus.connect(this.master);
      for (const reverb of this.reverbs) bus.connect(reverb.convolver);
    };

    this.effects = ctx.createGain();
    send(this.effects);
    this.voice = ctx.createGain();
    send(this.voice);
    this.voiceMeter = ctx.createAnalyser();
    this.voiceMeter.fftSize = 512;
    this.voice.connect(this.voiceMeter);
    this.stingers = ctx.createGain();
    this.stingers.connect(this.master);
    this.stingerMeter = ctx.createAnalyser();
    this.stingerMeter.fftSize = 512;
    this.stingers.connect(this.stingerMeter);

    // Outside: rain and wind behind a low-pass that closes as the player moves away from windows.
    this.muffle = ctx.createBiquadFilter();
    this.muffle.type = 'lowpass';
    this.muffle.frequency.value = 2000;
    // The outdoors flag may have been set before the first gesture built the graph.
    queueMicrotask(() => this.applyMuffle());
    this.ambience = ctx.createGain();
    this.storm = ctx.createGain();
    this.muffle.connect(this.storm).connect(this.ambience).connect(this.master);

    // Thunder: its own channel, so it can be loud over the rain, and only a little muffled indoors.
    this.thunderIn = ctx.createGain();
    this.thunderMuffle = ctx.createBiquadFilter();
    this.thunderMuffle.type = 'lowpass';
    this.thunderMuffle.frequency.value = 14_000;
    this.thunderLevel = ctx.createGain();
    this.thunderIn.connect(this.thunderMuffle).connect(this.thunderLevel).connect(this.master);

    this.rainLevel = ctx.createGain();
    this.rainLevel.gain.value = 0.8;
    this.rainLevel.connect(this.muffle);
    const forever = 60 * 60 * 6;
    SYNTHS.rain({ ctx, out: this.rainLevel, t: ctx.currentTime, param: 0, seconds: forever, rng: this.rng.fork('rain') });
    const windLevel = ctx.createGain();
    windLevel.gain.value = 0.7;
    windLevel.connect(this.muffle);
    SYNTHS.wind({ ctx, out: windLevel, t: ctx.currentTime, param: 0, seconds: forever, rng: this.rng.fork('wind') });
  }

  private impulse(size: SizeClass): AudioBuffer {
    let buffer = this.impulses.get(size);
    if (!buffer && this.ctx) {
      const { left, right } = generateImpulse(size, this.ctx.sampleRate, this.rng.fork(`impulse:${size}`));
      buffer = this.ctx.createBuffer(2, left.length, this.ctx.sampleRate);
      buffer.copyToChannel(left as Float32Array<ArrayBuffer>, 0);
      buffer.copyToChannel(right as Float32Array<ArrayBuffer>, 1);
      this.impulses.set(size, buffer);
    }
    return buffer!;
  }

  /** The bus spec 09 plays spirit voices into. Ambience ducks while it's active. */
  get voiceBus(): AudioNode | undefined {
    return this.voice;
  }

  play(name: SoundName, options: PlayOptions = {}): void {
    const ctx = this.ctx;
    if (!ctx || ctx.state !== 'running') return;
    const at = ctx.currentTime + (options.delay ?? 0);
    const level = ctx.createGain();
    level.gain.value = options.gain ?? 1;
    const bus = STINGERS.has(name) ? this.stingers : STORM.has(name) ? this.muffle : name === 'thunder' ? this.thunderIn : this.effects;
    if (options.position) {
      const panner = ctx.createPanner();
      panner.panningModel = 'HRTF';
      panner.distanceModel = 'inverse';
      panner.refDistance = 1.5;
      panner.maxDistance = 40;
      panner.rolloffFactor = 1.4;
      panner.positionX.value = options.position[0];
      panner.positionY.value = options.position[1];
      panner.positionZ.value = options.position[2];
      level.connect(panner).connect(bus);
    } else {
      level.connect(bus);
    }
    const param = options.param ?? (name === 'whisper' ? this.nextWhisper() : 0);
    const duration = SYNTHS[name]({ ctx, out: level, t: at, param, seconds: 3, rng: this.rng.fork(`play:${this.plays++}`) });
    // Stopping a one-shot early: fade it out fast and cut it loose.
    const handle = {
      stop: () => {
        level.gain.setTargetAtTime(0, ctx.currentTime, 0.02);
        setTimeout(() => level.disconnect(), 200);
      },
    };
    this.pool.add(handle, at + duration, ctx.currentTime);
  }

  /** 0 calm (no heartbeat) to 1 terrified (fast and loud). Driven by spec 12. */
  setTension(level: number): void {
    this.tension = Math.min(1, Math.max(0, level));
  }

  /** Crossfades the reverb to a room of this size. */
  setRoomSize(size: SizeClass): void {
    if (!this.ctx || size === this.roomSize) return;
    this.roomSize = size;
    const now = this.ctx.currentTime;
    const from = this.reverbs[this.activeReverb]!;
    this.activeReverb = 1 - this.activeReverb;
    const to = this.reverbs[this.activeReverb]!;
    to.convolver.buffer = this.impulse(size);
    from.level.gain.setTargetAtTime(0, now, REVERB_FADE / 3);
    to.level.gain.setTargetAtTime(1, now, REVERB_FADE / 3);
  }

  /** Metres to the nearest window: close, the storm is clear; deep inside, it's a low murmur. */
  setWindowDistance(metres: number): void {
    this.windowDistance = metres;
    this.applyMuffle();
  }

  /** Outside, the storm is open and heavy: no muffling, and the rain louder. */
  setOutdoors(on: boolean): void {
    this.outdoors = on;
    this.rainChangeAt = 0;
    this.applyMuffle();
  }

  private applyMuffle(): void {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const near = Math.exp(-this.windowDistance / 4);
    const cutoff = this.outdoors ? 14_000 : 600 + 9000 * near;
    this.muffle.frequency.setTargetAtTime(cutoff, now, 0.4);
    const storm = this.outdoors ? 1 : STORM_INDOORS.far + (STORM_INDOORS.nearWindow - STORM_INDOORS.far) * near;
    this.storm.gain.setTargetAtTime(storm, now, 0.4);
    this.thunderMuffle.frequency.setTargetAtTime(this.outdoors ? 14_000 : 1200 + 3000 * near, now, 0.4);
    this.thunderLevel.gain.setTargetAtTime(this.outdoors ? THUNDER.outdoors : THUNDER.indoors, now, 0.4);
  }

  /** Which whisper to play next: any version but the last one. */
  private nextWhisper(): number {
    this.lastWhisper = pickVariant(this.rng, WHISPER_VARIANTS.length, this.lastWhisper);
    return this.lastWhisper;
  }

  /** A clock to tick at this position while the player is in its room; undefined stops it. */
  setTicking(position: Vec3 | undefined): void {
    this.clock = position;
  }

  get ticking(): boolean {
    return this.clock !== undefined;
  }

  /** The listener follows the camera. */
  setListener(position: Vec3, forward: Vec3): void {
    const listener = this.ctx?.listener;
    if (!listener) return;
    listener.positionX.value = position[0];
    listener.positionY.value = position[1];
    listener.positionZ.value = position[2];
    listener.forwardX.value = forward[0];
    listener.forwardY.value = forward[1];
    listener.forwardZ.value = forward[2];
    listener.upX.value = 0;
    listener.upY.value = 1;
    listener.upZ.value = 0;
  }

  /** Once a frame: the rain's slow swell and scattered drops, the heartbeat, the clock, and ducking. */
  update(): void {
    const ctx = this.ctx;
    if (!ctx || ctx.state !== 'running') return;
    const now = ctx.currentTime;

    if (now >= this.rainChangeAt) {
      this.rainTarget = (0.75 + this.rng.float() * 0.25) * (this.outdoors ? 1.6 : 1);
      this.rainChangeAt = now + 3 + this.rng.float() * 6;
      this.rainLevel.gain.setTargetAtTime(this.rainTarget, now, 2);
    }

    if (this.tension > 0.02 && now >= this.nextBeat) {
      const bpm = 55 + 95 * this.tension;
      const at = Math.max(now, this.nextBeat);
      this.play('heartbeat', { param: 0.3 + 0.7 * this.tension, gain: 0.4 + 0.6 * this.tension, delay: at - now });
      this.nextBeat = at + 60 / bpm;
    } else if (this.tension <= 0.02) {
      this.nextBeat = now;
    }

    // Heavy drops at random over the rain, so it never falls into a pattern.
    if (now >= this.nextSplat) {
      this.play('splat', { gain: 0.3 + this.rng.float() * 0.6 });
      this.nextSplat = now + 0.12 + this.rng.float() * 0.8;
    }

    // The grandfather clock: tick, tock, once a second.
    if (this.clock && now >= this.nextTick) {
      this.play('clockTick', { position: this.clock, param: this.tock ? 1 : 0, gain: 1 });
      this.tock = !this.tock;
      this.nextTick = Math.max(now, this.nextTick) + 1;
    } else if (!this.clock) {
      this.nextTick = now;
    }

    // The storm steps back while a voice speaks or a stinger strikes.
    const level = (meter: AnalyserNode) => {
      const samples = new Float32Array(meter.fftSize);
      meter.getFloatTimeDomainData(samples);
      return Math.sqrt(samples.reduce((sum, v) => sum + v * v, 0) / samples.length);
    };
    const busy = level(this.voiceMeter) > 0.01 || level(this.stingerMeter) > 0.01;
    this.ambience.gain.setTargetAtTime(busy ? DUCKED : 1, now, busy ? 0.08 : 0.4);
  }

  /** Renders one sound offline and returns its samples (left and right interleaved), for tests. */
  async renderOffline(name: SoundName, seconds: number, param = 0): Promise<Float32Array> {
    const rate = 44_100;
    const offline = new OfflineAudioContext(2, Math.ceil(rate * seconds), rate);
    SYNTHS[name]({ ctx: offline, out: offline.destination, t: 0.01, param, seconds: seconds - 0.05, rng: this.rng.fork(`offline:${name}`) });
    const rendered = await offline.startRendering();
    const left = rendered.getChannelData(0);
    const right = rendered.getChannelData(1);
    const out = new Float32Array(left.length * 2);
    for (let i = 0; i < left.length; i++) {
      out[2 * i] = left[i]!;
      out[2 * i + 1] = right[i]!;
    }
    return out;
  }

  /** For tests: the ambience level after ducking, and the master level. */
  levels(): { ambience: number; storm: number; thunder: number; master: number } {
    return {
      ambience: this.ambience?.gain.value ?? 1,
      storm: this.storm?.gain.value ?? 1,
      thunder: this.thunderLevel?.gain.value ?? 1,
      master: this.master?.gain.value ?? 0,
    };
  }

  /** For tests: a plain tone into the voice bus for some seconds. */
  testVoice(seconds: number): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const osc = ctx.createOscillator();
    osc.frequency.value = 220;
    const level = ctx.createGain();
    level.gain.value = 0.3;
    osc.connect(level).connect(this.voice);
    osc.start();
    osc.stop(ctx.currentTime + seconds);
  }
}
