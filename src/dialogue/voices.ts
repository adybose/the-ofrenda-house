import type { Character, CharacterId, Gender, Role } from '../case/types';
import { createRng, type Seed } from '../core/rng';

/** A Piper voice model in `voices/`, fetched once by `npm run setup:voices` (spec 09). */
export interface VoiceModel {
  id: string;
  gender: Gender;
  /** Its folder in the rhasspy `piper-voices` collection. */
  path: string;
}

export const VOICES: readonly VoiceModel[] = [
  { id: 'en_US-lessac-medium', gender: 'female', path: 'en/en_US/lessac/medium' },
  { id: 'en_GB-jenny_dioco-medium', gender: 'female', path: 'en/en_GB/jenny_dioco/medium' },
  { id: 'en_US-ryan-medium', gender: 'male', path: 'en/en_US/ryan/medium' },
  { id: 'en_GB-alan-medium', gender: 'male', path: 'en/en_GB/alan/medium' },
];

/**
 * How one spirit sounds: a base voice, a pitch (applied on the client by playback rate, 1 is
 * unchanged) and a rate (Piper's length scale after the pitch shift, above 1 is slower).
 */
export interface VoiceSpec {
  voiceId: string;
  pitch: number;
  rate: number;
  /** La Sombra's low, whispered chain instead of a spirit's. */
  shadow?: boolean;
}

/** La Sombra: the deepest voice pitched far down and slowed, through the whispered chain. */
export const SHADOW_VOICE: VoiceSpec = { voiceId: 'en_US-ryan-medium', pitch: 0.7, rate: 1.3, shadow: true };

type Age = 'old' | 'middle' | 'young';

const AGE: Partial<Record<Role, Age>> = { grandmother: 'old', patriarch: 'old', eldestChild: 'young' };

/** The old speak lower and slower, the young higher and quicker; the ranges never overlap. */
const BASE: Record<Age, { pitch: number; rate: number }> = {
  old: { pitch: 0.88, rate: 1.2 },
  middle: { pitch: 0.97, rate: 1.08 },
  young: { pitch: 1.06, rate: 1 },
};

/** Steps either side of the base, so spirits sharing a voice still sound apart. */
const STEPS = [-3, -2, -1, 0, 1, 2, 3];
const PITCH_STEP = 0.025;
const RATE_STEP = 0.03;

const round = (value: number) => Math.round(value * 1000) / 1000;

/**
 * Each spirit's voice, from the seed and its traits. Gender picks the voice, sharing each gender's
 * spirits evenly across its voices; age (by role) sets the range of pitch and pace; and spirits on the
 * same voice spread out across that range, so they never sound alike. The seed breaks ties, so runs
 * differ. No two spirits in a run share the same settings.
 */
export function assignVoices(seed: Seed, characters: readonly Character[]): Partial<Record<CharacterId, VoiceSpec>> {
  const rng = createRng(seed).fork('voices');
  const voices: Partial<Record<CharacterId, VoiceSpec>> = {};
  const assigned: VoiceSpec[] = [];
  for (const character of characters) {
    const base = BASE[AGE[character.role] ?? 'middle'];
    // The least-used voice of the right gender, the seed choosing between equals.
    const models = VOICES.filter((v) => v.gender === character.gender);
    const users = (id: string) => assigned.filter((v) => v.voiceId === id).length;
    const fewest = Math.min(...models.map((m) => users(m.id)));
    const voiceId = rng.pick(models.filter((m) => users(m.id) === fewest)).id;
    // Pitch and pace together: the first on a voice takes a corner of its range, and each after the
    // point furthest (in steps of pitch plus steps of pace) from those already on it.
    const others = assigned.filter((v) => v.voiceId === voiceId);
    const options = STEPS.flatMap((p) => STEPS.map((r) => ({ voiceId, pitch: round(base.pitch + p * PITCH_STEP), rate: round(base.rate + r * RATE_STEP) })));
    const distance = (v: VoiceSpec) => Math.min(...others.map((o) => Math.abs(o.pitch - v.pitch) / PITCH_STEP + Math.abs(o.rate - v.rate) / RATE_STEP));
    const corners = options.filter((v) => [base.pitch - 3 * PITCH_STEP, base.pitch + 3 * PITCH_STEP].map(round).includes(v.pitch) && [base.rate - 3 * RATE_STEP, base.rate + 3 * RATE_STEP].map(round).includes(v.rate));
    const best = Math.max(...options.map(distance));
    const voice = rng.pick(others.length ? options.filter((v) => distance(v) === best) : corners);
    voices[character.id] = voice;
    assigned.push(voice);
  }
  return voices;
}

/**
 * The length scale to ask Piper for. The client shifts pitch by playback rate, which also speeds the
 * line up by `pitch`, so Piper speaks it `pitch` times slower to land on `rate`.
 */
export function lengthScale(voice: VoiceSpec): number {
  return Math.round(voice.rate * voice.pitch * 100) / 100;
}
