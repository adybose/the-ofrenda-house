import { describe, expect, it } from 'vitest';
import { PAUSES, TRIM_KEEP, joinWavs, phrases } from '../../server/speech';

/** A 16-bit mono WAV of the given samples. */
function wav(samples: number[], rate = 22_050): Buffer {
  const out = Buffer.alloc(44 + samples.length * 2);
  out.write('RIFF', 0);
  out.writeUInt32LE(36 + samples.length * 2, 4);
  out.write('WAVEfmt ', 8);
  out.writeUInt32LE(16, 16);
  out.writeUInt16LE(1, 20);
  out.writeUInt16LE(1, 22);
  out.writeUInt32LE(rate, 24);
  out.writeUInt32LE(rate * 2, 28);
  out.writeUInt16LE(2, 32);
  out.writeUInt16LE(16, 34);
  out.write('data', 36);
  out.writeUInt32LE(samples.length * 2, 40);
  samples.forEach((v, i) => out.writeInt16LE(v, 44 + i * 2));
  return out;
}

describe('phrases', () => {
  it('splits after punctuation, keeping it, with a long pause after a sentence and a short one after a comma', () => {
    expect(phrases('Who walks in my house on the night of the dead? Closer, stranger, and tell me why you are here.')).toEqual([
      { text: 'Who walks in my house on the night of the dead?', pause: PAUSES.sentence },
      // "Come closer, stranger": an address, with only the brief pause Severo's voice gave it.
      { text: 'Closer,', pause: PAUSES.address },
      { text: 'stranger,', pause: PAUSES.comma },
      { text: 'and tell me why you are here.', pause: 0 },
    ]);
    expect(PAUSES.sentence).toBeGreaterThan(PAUSES.comma * 1.8);
    expect(PAUSES.comma).toBeGreaterThan(PAUSES.address * 2);
  });

  it('gives a short address at the end of a sentence only a brief pause: "…, little thief."', () => {
    expect(phrases('You should not have come here, little thief. The house remembers every one of you.')).toEqual([
      { text: 'You should not have come here,', pause: PAUSES.address },
      { text: 'little thief.', pause: PAUSES.sentence },
      { text: 'The house remembers every one of you.', pause: 0 },
    ]);
    expect(phrases('Run, child.')).toEqual([
      { text: 'Run,', pause: PAUSES.address },
      { text: 'child.', pause: 0 },
    ]);
  });

  it('still pauses at a comma between longer clauses', () => {
    expect(phrases('The candles are burning low, and the clock has stopped at midnight.')).toEqual([
      { text: 'The candles are burning low,', pause: PAUSES.comma },
      { text: 'and the clock has stopped at midnight.', pause: 0 },
    ]);
    expect(phrases('I waited for you, my dear, all night long.')).toEqual([
      { text: 'I waited for you,', pause: PAUSES.comma },
      { text: 'my dear,', pause: PAUSES.comma },
      { text: 'all night long.', pause: 0 },
    ]);
  });

  it('pauses longest at an ellipsis, treats ! ; : and dashes too, and leaves numbers whole', () => {
    expect(phrases('Wait... listen! The clock struck 3.5 times; no — twice: once for each.')).toEqual([
      { text: 'Wait...', pause: PAUSES.ellipsis },
      { text: 'listen!', pause: PAUSES.sentence },
      { text: 'The clock struck 3.5 times;', pause: PAUSES.comma },
      { text: 'no —', pause: PAUSES.comma },
      { text: 'twice:', pause: PAUSES.comma },
      { text: 'once for each.', pause: 0 },
    ]);
    expect(phrases('Nothing but rain')).toEqual([{ text: 'Nothing but rain', pause: 0 }]);
    expect(phrases('  …  ')).toEqual([]);
  });
});

describe('joinWavs', () => {
  it("trims each phrase's own silence, so the gap between phrases is just the pause, scaled for the pitch", () => {
    const rate = 22_050;
    const quiet = (n: number) => Array.from({ length: n }, () => 0);
    const loud = (n: number) => Array.from({ length: n }, (_, i) => (i % 2 ? 9000 : -9000));
    // Each phrase arrives with 0.2 s of silence before and 0.3 s after it, as Piper's do.
    const phrase = wav([...quiet(4410), ...loud(2205), ...quiet(6615)], rate);
    const joined = joinWavs([phrase, phrase], [0.5, 0], { trim: true, pauseScale: 0.8 });
    const samples = joined.readUInt32LE(40) / 2;
    const at = (i: number) => joined.readInt16LE(44 + i * 2);
    const keep = Math.round(TRIM_KEEP * rate);
    expect(samples).toBe(2 * (2205 + 2 * keep) + Math.round(0.5 * 0.8 * rate));
    // Loud from just after the kept lead-in, and the gap is the pause plus the kept edges.
    expect(Math.abs(at(keep))).toBe(9000);
    let silent = 0;
    for (let i = keep + 2205; i < samples && Math.abs(at(i)) < 100; i++) silent++;
    expect(silent).toBe(2 * keep + Math.round(0.5 * 0.8 * rate));
  });

  it('joins the phrases with silence between them under one valid header', () => {
    const rate = 22_050;
    const joined = joinWavs([wav([100, 200], rate), wav([300], rate), wav([400, 500, 600], rate)], [0.5, 0.25, 0]);
    expect(joined.subarray(0, 4).toString()).toBe('RIFF');
    expect(joined.subarray(8, 16).toString()).toBe('WAVEfmt ');
    expect(joined.readUInt32LE(24)).toBe(rate);
    const silence = Math.round(0.5 * rate) + Math.round(0.25 * rate);
    const samples = 2 + 1 + 3 + silence;
    expect(joined.readUInt32LE(40)).toBe(samples * 2);
    expect(joined.readUInt32LE(4)).toBe(36 + samples * 2);
    expect(joined.length).toBe(44 + samples * 2);
    const at = (i: number) => joined.readInt16LE(44 + i * 2);
    expect([at(0), at(1)]).toEqual([100, 200]);
    expect(at(2)).toBe(0);
    expect(at(2 + Math.round(0.5 * rate))).toBe(300);
    expect(at(samples - 1)).toBe(600);
  });

  it('finds the data chunk even after extra chunks in the header', () => {
    const plain = wav([7, 8]);
    const withList = Buffer.concat([plain.subarray(0, 36), Buffer.from('LIST'), Buffer.from([4, 0, 0, 0]), Buffer.from('INFO'), plain.subarray(36)]);
    const joined = joinWavs([withList], [0]);
    expect(joined.readUInt32LE(40)).toBe(4);
    expect([joined.readInt16LE(44), joined.readInt16LE(46)]).toEqual([7, 8]);
  });
});
