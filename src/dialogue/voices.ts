import type { Character, CharacterId, Gender, Role } from '../case/types';
import { createRng, type Seed } from '../core/rng';

/** A Piper voice model in `voices/`, fetched once by `npm run setup:voices` (spec 09). */
export interface VoiceModel {
  id: string;
  gender: Gender;
  /** Its folder in the rhasspy `piper-voices` collection. */
  path: string;
  /**
   * How much to slow it to an even pace: the voices speak at very different natural speeds. Measured on
   * one 29-word passage: how much longer it gets per unit of length scale (lessac 4.56 s, jenny 5.18,
   * ryan 3.91, alan 7.14; the rest, about 2.7 s, doesn't stretch), relative to lessac.
   */
  tempo: number;
}

export const VOICES: readonly VoiceModel[] = [
  { id: 'en_US-lessac-medium', gender: 'female', path: 'en/en_US/lessac/medium', tempo: 1 },
  { id: 'en_GB-jenny_dioco-medium', gender: 'female', path: 'en/en_GB/jenny_dioco/medium', tempo: 0.88 },
  { id: 'en_US-ryan-medium', gender: 'male', path: 'en/en_US/ryan/medium', tempo: 1.17 },
  { id: 'en_GB-alan-medium', gender: 'male', path: 'en/en_GB/alan/medium', tempo: 0.64 },
];

/**
 * How one spirit sounds: a base voice, a pitch (applied on the client by playback rate, 1 is
 * unchanged), a rate (Piper's length scale after the pitch shift, above 1 is slower) and an
 * expression (Piper's noise scale: how much the intonation varies; its default is 0.667).
 */
export interface VoiceSpec {
  voiceId: string;
  pitch: number;
  rate: number;
  expression: number;
  /** La Sombra's low, whispered chain instead of a spirit's. */
  shadow?: boolean;
}

/** La Sombra: the deepest voice pitched far down, slow and flat, through its dark doubled chain. */
export const SHADOW_VOICE: VoiceSpec = { voiceId: 'en_US-ryan-medium', pitch: 0.75, rate: 1.68, expression: 0.45, shadow: true };

type Age = 'patriarch' | 'old' | 'middle' | 'young';

const AGE: Partial<Record<Role, Age>> = { patriarch: 'patriarch', grandmother: 'old', eldestChild: 'young' };

/**
 * Everyone speaks slowly, flat and serious: an expression (Piper's noise scale) well under its default
 * of 0.667, so pitch barely wanders from word to word. The old are lower, slower and calmest, the young
 * higher and quicker. The patriarch is the deepest and slowest of all, and keeps a fuller inflection.
 * (The paces allow for the steady rhythm Piper is run with, which on its own speaks about 10% faster.)
 */
const BASE: Record<Age, { pitch: number; rate: number; expression: number }> = {
  patriarch: { pitch: 0.84, rate: 1.8, expression: 0.76 },
  old: { pitch: 0.92, rate: 1.57, expression: 0.42 },
  middle: { pitch: 0.98, rate: 1.43, expression: 0.45 },
  young: { pitch: 1.06, rate: 1.32, expression: 0.48 },
};

/** Women up and men down, so no woman sounds like a man (and no man like a woman). */
const GENDER_PITCH: Record<Gender, number> = { female: 0.04, male: -0.04 };

/** Steps either side of the base, so spirits sharing a voice still sound apart. */
const STEPS = [-3, -2, -1, 0, 1, 2, 3];
const PITCH_STEP = 0.02;
const RATE_STEP = 0.03;

const round = (value: number) => Math.round(value * 1000) / 1000;

/**
 * Each spirit's voice, from the seed and its traits. Gender picks the voice, sharing each gender's
 * spirits evenly across its voices and setting the pitch a little up or down; age (by role) sets the
 * range of pitch, pace and expression; and spirits on the same voice spread out across that range, so
 * they never sound alike. The seed breaks ties, so runs
 * differ. No two spirits in a run share the same settings.
 */
export function assignVoices(seed: Seed, characters: readonly Character[]): Partial<Record<CharacterId, VoiceSpec>> {
  const rng = createRng(seed).fork('voices');
  const voices: Partial<Record<CharacterId, VoiceSpec>> = {};
  const assigned: VoiceSpec[] = [];
  for (const character of characters) {
    const age = BASE[AGE[character.role] ?? 'middle'];
    const base = { ...age, pitch: age.pitch + GENDER_PITCH[character.gender] };
    // The least-used voice of the right gender, the seed choosing between equals.
    const models = VOICES.filter((v) => v.gender === character.gender);
    const users = (id: string) => assigned.filter((v) => v.voiceId === id).length;
    const fewest = Math.min(...models.map((m) => users(m.id)));
    const voiceId = rng.pick(models.filter((m) => users(m.id) === fewest)).id;
    // Pitch and pace together: the first on a voice takes a corner of its range, and each after the
    // point furthest (in steps of pitch plus steps of pace) from those already on it.
    const others = assigned.filter((v) => v.voiceId === voiceId);
    const expression = round(base.expression + rng.pick([-0.01, 0, 0.01]));
    // The patriarch keeps to the low half of his pitch range and the slow half of his pace: the
    // deepest, slowest voice in the house.
    const patriarch = character.role === 'patriarch';
    const pitchSteps = patriarch ? STEPS.filter((p) => p <= 0) : STEPS;
    const rateSteps = patriarch ? STEPS.filter((r) => r >= 0) : STEPS;
    const options = pitchSteps.flatMap((p) => rateSteps.map((r) => ({ voiceId, pitch: round(base.pitch + p * PITCH_STEP), rate: round(base.rate + r * RATE_STEP), expression })));
    const distance = (v: VoiceSpec) => Math.min(...others.map((o) => Math.abs(o.pitch - v.pitch) / PITCH_STEP + Math.abs(o.rate - v.rate) / RATE_STEP));
    const lowest = Math.min(...options.map((v) => v.pitch));
    const highest = Math.max(...options.map((v) => v.pitch));
    const slowest = Math.max(...options.map((v) => v.rate));
    const quickest = Math.min(...options.map((v) => v.rate));
    const corners = options.filter((v) => (v.pitch === lowest || v.pitch === highest) && (v.rate === slowest || v.rate === quickest));
    const best = Math.max(...options.map(distance));
    const voice = rng.pick(others.length ? options.filter((v) => distance(v) === best) : corners);
    voices[character.id] = voice;
    assigned.push(voice);
  }
  return voices;
}

/**
 * The length scale to ask Piper for. The client shifts pitch by playback rate, which also speeds the
 * line up by `pitch`, so Piper speaks it `pitch` times slower to land on `rate`; and each voice's
 * `tempo` evens out how fast it naturally talks.
 */
export function lengthScale(voice: VoiceSpec): number {
  const tempo = VOICES.find((v) => v.id === voice.voiceId)?.tempo ?? 1;
  return Math.round(voice.rate * voice.pitch * tempo * 100) / 100;
}
