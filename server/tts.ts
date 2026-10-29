import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readdirSync } from 'node:fs';
import { access, constants, mkdir, readFile, rename, rm } from 'node:fs/promises';
import { homedir } from 'node:os';
import { delimiter, join } from 'node:path';
import { VOICES } from '../src/dialogue/voices';

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

export interface Tts {
  available(): Promise<boolean>;
  knows(voiceId: unknown): voiceId is string;
  /** WAV bytes for the line, from the disk cache or a fresh Piper run; `undefined` if speech is unavailable. */
  synthesize(text: string, voiceId: string, lengthScale: number): Promise<Buffer | undefined>;
  /** The same, behind any live request, without waiting for it. */
  prefetch(text: string, voiceId: string, lengthScale: number): void;
  /** Resolves when nothing is queued or running (for tests). */
  idle(): Promise<void>;
}

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

  async function run(text: string, voiceId: string, lengthScale: number, target: string): Promise<Buffer | undefined> {
    const bin = await findBin();
    if (!bin) return undefined;
    const temp = `${target}.${process.pid}.${++runs}.part`;
    const ok = await new Promise<boolean>((resolve) => {
      const child = spawn(bin, ['-m', model(voiceId), '-f', temp, '--length-scale', String(lengthScale)], { env: options.env, stdio: ['pipe', 'ignore', 'ignore'] });
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
      child.stdin.end(text);
    });
    try {
      if (!ok) return undefined;
      const wav = await readFile(temp);
      if (wav.subarray(0, 4).toString() !== 'RIFF') return undefined;
      await rename(temp, target);
      return wav;
    } catch {
      return undefined;
    } finally {
      await rm(temp, { force: true });
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

  function request(text: string, voiceId: string, lengthScale: number, priority: 'live' | 'prefetch'): Promise<Buffer | undefined> {
    const key = createHash('sha256').update(JSON.stringify([voiceId, lengthScale, text])).digest('hex');
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
        (priority === 'live' ? live : prefetches).push({ run: () => run(text, voiceId, lengthScale, target), resolve });
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
    synthesize: (text, voiceId, lengthScale) => request(text, voiceId, lengthScale, 'live'),
    prefetch(text, voiceId, lengthScale) {
      void request(text, voiceId, lengthScale, 'prefetch');
    },
    async idle() {
      while (inFlight.size > 0) await Promise.allSettled([...inFlight.values()]);
    },
  };
}
