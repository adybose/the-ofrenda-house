// Pacing for spoken lines (spec 09): a line is spoken phrase by phrase, each keeping its punctuation
// so it keeps its intonation, and the phrases are joined with silence, longer after a sentence than
// after a comma. Each phrase's own silence is trimmed first, so the pauses are the same on every voice.

/**
 * Seconds of silence heard after each kind of punctuation: Severo's delivery, the listening check's
 * favourite (measured 0.86 s after a sentence, 0.40 s at a comma, 0.17 s at "Closer, stranger"), less
 * the edges `joinWavs` keeps. `address`: a comma that only sets off a short address.
 */
export const PAUSES = { sentence: 0.82, ellipsis: 1.05, comma: 0.36, address: 0.16 } as const;

/** Seconds kept at each end of a phrase when its silence is trimmed, so no consonant is clipped. */
export const TRIM_KEEP = 0.02;

/** Below this a sample counts as silence: about -40 dBFS. */
const SILENCE = 328;

export interface Phrase {
  text: string;
  /** Seconds of silence after it; 0 for the last. */
  pause: number;
}

/** Punctuation that ends a phrase, when followed by a space or the end (so "3.5" stays whole). */
const BREAK = /(\.\.\.|…|[.?!]+|[,;:]|—|–)(?=\s|$)/g;

function pauseFor(mark: string): number {
  if (mark === '...' || mark === '…') return PAUSES.ellipsis;
  if (/^[.?!]+$/.test(mark)) return PAUSES.sentence;
  return PAUSES.comma;
}

const words = (text: string) => text.split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w)).length;

/**
 * A line split into phrases after its punctuation, each with the pause that follows it. A comma that
 * only sets off a short address ("Closer, stranger", "…, little thief.") is said almost in one breath,
 * so it gets the brief `address` pause: one word before it, or just one or two words after it that end
 * the sentence.
 */
export function phrases(text: string): Phrase[] {
  const out: Phrase[] = [];
  const marks = [...text.matchAll(BREAK)];
  let start = 0;
  // The word just after an address ("stranger" in "Closer, stranger, and…") is the address itself:
  // the comma after it is an ordinary one.
  let afterAddress = false;
  const add = (end: number, pause: number) => {
    const phrase = text.slice(start, end).trim();
    if (/[\p{L}\p{N}]/u.test(phrase)) out.push({ text: phrase, pause });
    start = end;
  };
  marks.forEach((match, i) => {
    const end = match.index + match[0].length;
    if (match[0] === ',') {
      const next = marks[i + 1];
      const after = text.slice(end, next ? next.index + next[0].length : text.length);
      const endsSentence = !next || pauseFor(next[0]) !== PAUSES.comma;
      if ((words(text.slice(start, end)) <= 1 && !afterAddress) || (endsSentence && words(after) <= 2)) {
        add(end, PAUSES.address);
        afterAddress = true;
        return;
      }
    }
    add(end, pauseFor(match[0]));
    afterAddress = false;
  });
  add(text.length, 0);
  if (out.length) out[out.length - 1]!.pause = 0;
  return out;
}

interface Pcm {
  rate: number;
  channels: number;
  bits: number;
  data: Buffer;
}

/** The format and sample data of a PCM WAV, walking its chunks (Piper's may carry extra ones). */
function readWav(wav: Buffer): Pcm {
  if (wav.toString('ascii', 0, 4) !== 'RIFF' || wav.toString('ascii', 8, 12) !== 'WAVE') throw new Error('not a WAV');
  let format: Omit<Pcm, 'data'> | undefined;
  for (let at = 12; at + 8 <= wav.length; ) {
    const id = wav.toString('ascii', at, at + 4);
    const size = wav.readUInt32LE(at + 4);
    if (id === 'fmt ') format = { channels: wav.readUInt16LE(at + 10), rate: wav.readUInt32LE(at + 12), bits: wav.readUInt16LE(at + 22) };
    if (id === 'data') {
      if (!format) throw new Error('WAV data before its format');
      return { ...format, data: wav.subarray(at + 8, Math.min(wav.length, at + 8 + size)) };
    }
    at += 8 + size + (size % 2);
  }
  throw new Error('WAV without data');
}

/** A 16-bit phrase without its leading and trailing silence, keeping `TRIM_KEEP` seconds at each end. */
function trim(part: Pcm): Buffer {
  if (part.bits !== 16) return part.data;
  const frames = part.data.length / (2 * part.channels);
  const loud = (frame: number) => {
    for (let c = 0; c < part.channels; c++) if (Math.abs(part.data.readInt16LE((frame * part.channels + c) * 2)) > SILENCE) return true;
    return false;
  };
  let first = 0;
  while (first < frames && !loud(first)) first++;
  if (first === frames) return part.data.subarray(0, 0);
  let last = frames - 1;
  while (last > first && !loud(last)) last--;
  const keep = Math.round(TRIM_KEEP * part.rate);
  const from = Math.max(0, first - keep);
  const to = Math.min(frames, last + 1 + keep);
  return part.data.subarray(from * 2 * part.channels, to * 2 * part.channels);
}

export interface JoinOptions {
  /** Cut each phrase's own leading and trailing silence first. */
  trim?: boolean;
  /** Multiplies every pause: the client's pitch, since playing at that rate stretches silence by 1/pitch. */
  pauseScale?: number;
}

/** One WAV of the phrases in order, with `pauses[i]` seconds of silence after phrase i. */
export function joinWavs(wavs: readonly Buffer[], pauses: readonly number[], options: JoinOptions = {}): Buffer {
  const parts = wavs.map(readWav);
  const { rate, channels, bits } = parts[0]!;
  const block = (channels * bits) / 8;
  const scale = options.pauseScale ?? 1;
  const pieces: Buffer[] = [];
  parts.forEach((part, i) => {
    pieces.push(options.trim ? trim(part) : part.data);
    const pause = i < parts.length - 1 ? (pauses[i] ?? 0) * scale : 0;
    if (pause > 0) pieces.push(Buffer.alloc(Math.round(pause * rate) * block));
  });
  const data = Buffer.concat(pieces);
  const header = Buffer.alloc(44);
  header.write('RIFF', 0, 'ascii');
  header.writeUInt32LE(36 + data.length, 4);
  header.write('WAVEfmt ', 8, 'ascii');
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(rate, 24);
  header.writeUInt32LE(rate * block, 28);
  header.writeUInt16LE(block, 32);
  header.writeUInt16LE(bits, 34);
  header.write('data', 36, 'ascii');
  header.writeUInt32LE(data.length, 40);
  return Buffer.concat([header, data]);
}
