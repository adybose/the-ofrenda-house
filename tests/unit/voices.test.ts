import { describe, expect, it } from 'vitest';
import { generateCase } from '../../src/case/generate';
import { SHADOW_VOICE, VOICES, assignVoices, lengthScale } from '../../src/dialogue/voices';

const genderOf = (voiceId: string) => VOICES.find((v) => v.id === voiceId)!.gender;

describe('spirit voices', () => {
  it('are assigned the same way for the same seed', () => {
    const { characters } = generateCase(42);
    expect(assignVoices(42, characters)).toEqual(assignVoices(42, characters));
  });

  it('never give two spirits in a run the same voice, over 1,000 seeds', () => {
    for (let seed = 0; seed < 1000; seed++) {
      const { characters } = generateCase(seed);
      const voices = assignVoices(seed, characters);
      const keys = characters.map((c) => JSON.stringify(voices[c.id]));
      expect(new Set(keys).size, `seed ${seed}`).toBe(characters.length);
    }
  });

  it('match each spirit to a voice of the same gender, slow, with women high enough and men low enough to be clear', () => {
    for (let seed = 0; seed < 200; seed++) {
      const { characters } = generateCase(seed);
      const voices = assignVoices(seed, characters);
      for (const c of characters) {
        const voice = voices[c.id]!;
        expect(genderOf(voice.voiceId), `${seed} ${c.id}`).toBe(c.gender);
        if (c.gender === 'female') expect(voice.pitch, `${seed} ${c.id}`).toBeGreaterThanOrEqual(0.9);
        else expect(voice.pitch, `${seed} ${c.id}`).toBeLessThanOrEqual(1.08);
        expect(voice.pitch).toBeGreaterThanOrEqual(0.72);
        expect(voice.pitch).toBeLessThanOrEqual(1.16);
        // Slow: every length scale at least 1.23 (the first version went down to 0.91).
        expect(voice.rate).toBeGreaterThanOrEqual(1.23);
        expect(voice.rate).toBeLessThanOrEqual(1.9);
        // Flat and serious: little random wandering of pitch (Piper's default noise scale is 0.667).
        // The patriarch keeps the fuller inflection the listening check liked.
        if (c.role === 'patriarch') expect(voice.expression).toBeGreaterThanOrEqual(0.7);
        else {
          expect(voice.expression, `${seed} ${c.id}`).toBeGreaterThanOrEqual(0.4);
          expect(voice.expression, `${seed} ${c.id}`).toBeLessThanOrEqual(0.5);
        }
      }
    }
  });

  it('share each gender evenly across its voices, and set spirits on the same voice clearly apart in pitch or pace', () => {
    for (let seed = 0; seed < 1000; seed++) {
      const { characters } = generateCase(seed);
      const voices = assignVoices(seed, characters);
      for (const gender of ['female', 'male'] as const) {
        const spirits = characters.filter((c) => c.gender === gender);
        const byVoice = new Map<string, { pitch: number; rate: number }[]>();
        for (const c of spirits) byVoice.set(voices[c.id]!.voiceId, [...(byVoice.get(voices[c.id]!.voiceId) ?? []), voices[c.id]!]);
        const counts = VOICES.filter((v) => v.gender === gender).map((v) => byVoice.get(v.id)?.length ?? 0);
        expect(Math.max(...counts) - Math.min(...counts), `seed ${seed} ${gender}`).toBeLessThanOrEqual(1);
        for (const sharing of byVoice.values()) {
          for (const [i, a] of sharing.entries()) {
            for (const b of sharing.slice(i + 1)) {
              const apart = Math.abs(a.pitch - b.pitch) >= 0.049 || Math.abs(a.rate - b.rate) >= 0.089;
              expect(apart, `seed ${seed}: ${JSON.stringify(a)} and ${JSON.stringify(b)}`).toBe(true);
            }
          }
        }
      }
    }
  });

  it('make the old slower than the young, lower than the young of their gender, and calmer', () => {
    let checked = 0;
    for (let seed = 0; seed < 500; seed++) {
      const { characters } = generateCase(seed);
      const voices = assignVoices(seed, characters);
      const grandmother = voices.grandmother;
      const child = characters.find((c) => c.role === 'eldestChild');
      if (!grandmother || !child) continue;
      checked++;
      const young = voices.eldestChild!;
      expect(grandmother.rate, `seed ${seed}`).toBeGreaterThan(young.rate);
      expect(grandmother.expression, `seed ${seed}`).toBeLessThan(young.expression);
      if (child.gender === 'female') expect(grandmother.pitch, `seed ${seed}`).toBeLessThan(young.pitch);
    }
    expect(checked).toBeGreaterThan(20);
  });

  it('give the patriarch the deepest voice of the men in his run, and the slowest of anyone', () => {
    for (let seed = 0; seed < 1000; seed++) {
      const { characters } = generateCase(seed);
      const voices = assignVoices(seed, characters);
      const patriarch = voices.patriarch!;
      expect(patriarch.pitch, `seed ${seed}`).toBeLessThanOrEqual(0.8);
      expect(patriarch.rate, `seed ${seed}`).toBeGreaterThanOrEqual(1.8);
      for (const c of characters) if (c.role !== 'patriarch') expect(voices[c.id]!.rate, `seed ${seed} ${c.id}`).toBeLessThan(patriarch.rate);
      for (const c of characters) if (c.gender === 'male' && c.role !== 'patriarch') expect(voices[c.id]!.pitch, `seed ${seed} ${c.id}`).toBeGreaterThan(patriarch.pitch);
    }
  });

  it('give La Sombra a deep, slow, flat voice of its own', () => {
    expect(SHADOW_VOICE.shadow).toBe(true);
    expect(SHADOW_VOICE.pitch).toBeLessThan(0.8);
    expect(SHADOW_VOICE.expression).toBeLessThanOrEqual(0.5);
    expect(VOICES.map((v) => v.id)).toContain(SHADOW_VOICE.voiceId);
  });

  it('even out the voices natural speeds, so a pace means the same on every voice', () => {
    // Measured: per unit of length scale, a passage grows 3.91 s in ryan's voice and 7.14 s in alan's.
    const tempo = Object.fromEntries(VOICES.map((v) => [v.id, v.tempo]));
    expect(tempo['en_US-ryan-medium']).toBeGreaterThan(1);
    expect(tempo['en_GB-alan-medium']).toBeLessThan(1);
    const pace = { pitch: 1, rate: 1.4, expression: 0.45 };
    const ryan = lengthScale({ ...pace, voiceId: 'en_US-ryan-medium' });
    const alan = lengthScale({ ...pace, voiceId: 'en_GB-alan-medium' });
    expect(ryan / alan).toBeCloseTo(7.14 / 3.91, 1);
  });
});
