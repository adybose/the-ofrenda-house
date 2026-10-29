import type { VoiceSpec } from '../dialogue/voices';
import { createRng } from '../core/rng';
import type { Vec3 } from './engine';
import { whiteNoise } from './noise';

// A spirit's voice made ghostly (spec 09): pitched by playback rate, band-limited like a voice heard
// through a wall, with an echo trailing behind it; the voice bus adds the room's reverb. La Sombra is
// pitched far down and darker, with a breathy whisper riding the shape of its words.

/** The whole chain's level: Piper normalises speech near full scale, and the echo adds to it. */
const LEVEL = 0.6;

function delayLine(ctx: BaseAudioContext, input: AudioNode, out: AudioNode, seconds: number, feedback: number, tone: number, level: number): void {
  const delay = ctx.createDelay(1);
  delay.delayTime.value = seconds;
  const darken = ctx.createBiquadFilter();
  darken.type = 'lowpass';
  darken.frequency.value = tone;
  const loop = ctx.createGain();
  loop.gain.value = feedback;
  const send = ctx.createGain();
  send.gain.value = level;
  input.connect(delay).connect(darken).connect(loop).connect(delay);
  darken.connect(send).connect(out);
}

function filter(ctx: BaseAudioContext, type: BiquadFilterType, frequency: number, q = 0.7): BiquadFilterNode {
  const node = ctx.createBiquadFilter();
  node.type = type;
  node.frequency.value = frequency;
  node.Q.value = q;
  return node;
}

function spirit(ctx: BaseAudioContext, source: AudioNode, out: AudioNode): void {
  const band = filter(ctx, 'lowpass', 3800);
  source.connect(filter(ctx, 'highpass', 220)).connect(band);
  const dry = ctx.createGain();
  dry.gain.value = 0.85;
  band.connect(dry).connect(out);
  delayLine(ctx, band, out, 0.23, 0.35, 2500, 0.4);
}

const noiseCache = new WeakMap<BaseAudioContext, AudioBuffer>();

function shadow(ctx: BaseAudioContext, source: AudioNode, out: AudioNode, at: number, seconds: number): void {
  const dark = filter(ctx, 'lowpass', 2500);
  source.connect(dark);
  const dry = ctx.createGain();
  dry.gain.value = 0.6;
  dark.connect(dry).connect(out);
  // The whisper: breath whose loudness follows the words (rectified and smoothed into its gain).
  let buffer = noiseCache.get(ctx);
  if (!buffer) {
    buffer = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    buffer.copyToChannel(whiteNoise(createRng(31), buffer.length) as Float32Array<ArrayBuffer>, 0);
    noiseCache.set(ctx, buffer);
  }
  const breath = ctx.createBufferSource();
  breath.buffer = buffer;
  breath.loop = true;
  const whisper = ctx.createGain();
  whisper.gain.value = 0;
  breath.connect(filter(ctx, 'bandpass', 3500, 0.7)).connect(whisper).connect(out);
  const rectify = ctx.createWaveShaper();
  rectify.curve = Float32Array.from({ length: 257 }, (_, i) => Math.abs(i / 128 - 1));
  const follow = filter(ctx, 'lowpass', 30);
  const depth = ctx.createGain();
  depth.gain.value = 3;
  source.connect(rectify).connect(follow).connect(depth).connect(whisper.gain);
  breath.start(at);
  breath.stop(at + seconds + 0.1);
  delayLine(ctx, dark, out, 0.38, 0.45, 1500, 0.5);
}

/**
 * Plays a decoded line through the ghost chain into `out` (the voice bus), at `position` if given.
 * Returns how long the words last after the pitch shift, in seconds (the echo rings on a little).
 */
export function ghostVoice(ctx: BaseAudioContext, buffer: AudioBuffer, voice: VoiceSpec, out: AudioNode, at: number, position?: Vec3): number {
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  source.playbackRate.value = voice.pitch;
  const level = ctx.createGain();
  level.gain.value = LEVEL;
  if (position) {
    const panner = ctx.createPanner();
    panner.panningModel = 'HRTF';
    panner.distanceModel = 'inverse';
    panner.refDistance = 1.5;
    panner.positionX.value = position[0];
    panner.positionY.value = position[1];
    panner.positionZ.value = position[2];
    level.connect(panner).connect(out);
  } else {
    level.connect(out);
  }
  const seconds = buffer.duration / voice.pitch;
  if (voice.shadow) shadow(ctx, source, level, at, seconds);
  else spirit(ctx, source, level);
  source.start(at);
  return seconds;
}
