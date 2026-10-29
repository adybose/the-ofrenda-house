import type { VoiceSpec } from '../dialogue/voices';
import type { Vec3 } from './engine';

// A spirit's voice made ghostly (spec 09): pitched by playback rate, band-limited like a voice heard
// through a wall, with an echo trailing behind it; the voice bus adds the room's reverb. La Sombra is
// pitched far down and darker, its voice doubled by a second, slightly lower one just behind it, with
// one short slap of echo, so every word is understood. No noise: an earlier breath layer sounded like
// radio static, and a long echo smeared its words together.

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

/** La Sombra's double: the same words a shade lower and a beat behind, like two throats at once. */
const DOUBLE = { pitch: 0.985, delay: 0.018, level: 0.4 };

function shadow(ctx: BaseAudioContext, source: AudioNode, double: AudioNode, out: AudioNode): void {
  const dark = ctx.createGain();
  source.connect(dark);
  const late = ctx.createDelay(0.1);
  late.delayTime.value = DOUBLE.delay;
  const doubleLevel = ctx.createGain();
  doubleLevel.gain.value = DOUBLE.level;
  double.connect(late).connect(doubleLevel).connect(dark);
  // Open to 3.4 kHz, so the consonants that carry the words come through.
  const band = filter(ctx, 'lowpass', 3400);
  dark.connect(filter(ctx, 'highpass', 80)).connect(band);
  const dry = ctx.createGain();
  dry.gain.value = 0.65;
  band.connect(dry).connect(out);
  delayLine(ctx, band, out, 0.14, 0.15, 2000, 0.2);
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
  if (voice.shadow) {
    const double = ctx.createBufferSource();
    double.buffer = buffer;
    double.playbackRate.value = voice.pitch * DOUBLE.pitch;
    shadow(ctx, source, double, level);
    double.start(at);
  } else {
    spirit(ctx, source, level);
  }
  source.start(at);
  return seconds;
}
