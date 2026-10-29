import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readdirSync } from 'node:fs';
import { access, constants, mkdir, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { delimiter, join } from 'node:path';
import { VOICES } from '../src/dialogue/voices';
import { joinWavs, phrases } from './speech';

/**
 * Piper text-to-speech, run locally (spec 09). Every failure (no Piper, no model, an error, too slow)
 * comes back as `undefined`, and the game shows the line as text only.
 */
export interface TtsOptions {
  /** The Piper command: a name looked up on PATH (then `userBinDirs`), or a path. */
  bin: string;
  env: NodeJS.ProcessEnv;
  voicesDir: string;
  cacheDir: string;
  timeoutMs: number;
  /** Where `pip install --user` puts scripts, which is often not on PATH. */
  userBinDirs: string[];
  /** How many Piper processes may run at once. */
  concurrency: number;
}

/** One line to speak, and how. */
export interface SpeechRequest {
  text: string;
  voiceId: string;
  /** Piper's length scale: the pace. */
  lengthScale: number;
  /** Piper's noise scale: how much the intonation varies. */
  expression: number;
  /** The client's playback pitch, which stretches silence by 1/pitch: the pauses are written × pitch. */
  pitch: number;
}

export interface Tts {
  available(): Promise<boolean>;
  knows(voiceId: unknown): voiceId is string;
  /** WAV bytes for the line, from the disk cache or a fresh Piper run; `undefined` if speech is unavailable. */
  synthesize(request: SpeechRequest): Promise<Buffer | undefined>;
  /** The same, behind any live request, without waiting for it. */
  prefetch(request: SpeechRequest): void;
  /** Resolves when nothing is queued or running (for tests). */
  idle(): Promise<void>;
}

/** Bumped whenever the audio for the same request changes, so old cached WAVs aren't served. */
const FORMAT = 6;

/** Piper's variation in phoneme timing, below its default of 0.8: an even, measured rhythm. */
const RHYTHM = 0.6;

/** pip's per-user script folders on a Mac (and Linux), where `piper` lands. */
function pythonUserBins(): string[] {
  const root = join(homedir(), 'Library', 'Python');
  let versions: string[] = [];
  try {
    versions = readdirSync(root);
  } catch {
    // No per-user Python on this machine.
  }
  return [...versions.map((v) => join(root, v, 'bin')), join(homedir(), '.local', 'bin')];
}

export function ttsFromEnv(overrides: Partial<TtsOptions> = {}): TtsOptions {
  return {
    bin: process.env.PIPER_BIN ?? 'piper',
    env: process.env,
    voicesDir: 'voices',
    cacheDir: join('.cache', 'tts'),
    timeoutMs: 5000,
    userBinDirs: pythonUserBins(),
    concurrency: 2,
    ...overrides,
  };
}

const executable = async (path: string) =>
  access(path, constants.X_OK).then(
    () => true,
    () => false,
  );

interface Job {
  run: () => Promise<Buffer | undefined>;
  resolve: (wav: Buffer | undefined) => void;
}

export function createTts(options: TtsOptions): Tts {
  const live: Job[] = [];
  const prefetches: Job[] = [];
  const inFlight = new Map<string, Promise<Buffer | undefined>>();
  let running = 0;
  let runs = 0;

  async function findBin(): Promise<string | undefined> {
    if (options.bin.includes('/')) return (await executable(options.bin)) ? options.bin : undefined;
    const dirs = [...(options.env.PATH ?? '').split(delimiter).filter(Boolean), ...options.userBinDirs];
    for (const dir of dirs) if (await executable(join(dir, options.bin))) return join(dir, options.bin);
    return undefined;
  }

  const model = (voiceId: string) => join(options.voicesDir, `${voiceId}.onnx`);

  /**
   * One Piper run for the whole line: one phrase per stdin line, which Piper 1.8 writes as one WAV each
   * into a folder (`-d`), named by a clock so they sort in order. They're joined with the pauses.
   */
  async function run({ text, voiceId, lengthScale, expression, pitch }: SpeechRequest, target: string): Promise<Buffer | undefined> {
    const bin = await findBin();
    const parts = phrases(text);
    if (!bin || !parts.length) return undefined;
    const folder = `${target}.${process.pid}.${++runs}.parts`;
    const ok = await new Promise<boolean>((resolve) => {
      const args = ['-m', model(voiceId), '-d', folder, '--length-scale', String(lengthScale), '--noise-scale', String(expression), '--noise-w-scale', String(RHYTHM)];
      const child = spawn(bin, args, { env: options.env, stdio: ['pipe', 'ignore', 'ignore'] });
      const timer = setTimeout(() => {
        child.kill('SIGKILL');
        resolve(false);
      }, options.timeoutMs);
      child.on('error', () => {
        clearTimeout(timer);
        resolve(false);
      });
      child.on('close', (code) => {
        clearTimeout(timer);
        resolve(code === 0);
      });
      child.stdin.on('error', () => undefined);
      child.stdin.end(parts.map((p) => p.text).join('\n') + '\n');
    });
    try {
      if (!ok) return undefined;
      const files = (await readdir(folder)).filter((f) => f.endsWith('.wav')).sort((a, b) => Number(a.slice(0, -4)) - Number(b.slice(0, -4)));
      if (files.length !== parts.length) return undefined;
      // Each phrase's own silence is trimmed, so only our pauses remain, the same on every voice.
      const wav = joinWavs(await Promise.all(files.map((f) => readFile(join(folder, f)))), parts.map((p) => p.pause), { trim: true, pauseScale: pitch });
      // Written beside the target and renamed, so a killed run never leaves half a file in the cache.
      await writeFile(`${folder}.wav`, wav);
      await rename(`${folder}.wav`, target);
      return wav;
    } catch {
      return undefined;
    } finally {
      await rm(folder, { recursive: true, force: true });
    }
  }

  function pump(): void {
    while (running < options.concurrency) {
      const job = live.shift() ?? prefetches.shift();
      if (!job) break;
      running++;
      void job.run().then((wav) => {
        running--;
        job.resolve(wav);
        pump();
      });
    }
  }

  function request(speech: SpeechRequest, priority: 'live' | 'prefetch'): Promise<Buffer | undefined> {
    const { text, voiceId, lengthScale, expression, pitch } = speech;
    const key = createHash('sha256').update(JSON.stringify([FORMAT, voiceId, lengthScale, expression, pitch, text])).digest('hex');
    const pending = inFlight.get(key);
    if (pending) return pending;
    const target = join(options.cacheDir, `${key}.wav`);
    const promise = (async () => {
      try {
        return await readFile(target);
      } catch {
        // Not cached yet: synthesise it.
      }
      await mkdir(options.cacheDir, { recursive: true });
      return new Promise<Buffer | undefined>((resolve) => {
        (priority === 'live' ? live : prefetches).push({ run: () => run(speech, target), resolve });
        pump();
      });
    })().finally(() => inFlight.delete(key));
    inFlight.set(key, promise);
    return promise;
  }

  return {
    async available() {
      if (!(await findBin())) return false;
      for (const voice of VOICES) {
        for (const file of [model(voice.id), `${model(voice.id)}.json`]) {
          try {
            await access(file, constants.R_OK);
          } catch {
            return false;
          }
        }
      }
      return true;
    },
    knows: (voiceId): voiceId is string => VOICES.some((v) => v.id === voiceId),
    synthesize: (speech) => request(speech, 'live'),
    prefetch(speech) {
      void request(speech, 'prefetch');
    },
    async idle() {
      while (inFlight.size > 0) await Promise.allSettled([...inFlight.values()]);
    },
  };
}
