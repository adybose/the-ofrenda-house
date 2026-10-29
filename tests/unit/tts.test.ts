import { chmod, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { generateCase } from '../../src/case/generate';
import { VOICES, assignVoices, lengthScale } from '../../src/dialogue/voices';
import { buildServer } from '../../server/index';
import type { TtsOptions } from '../../server/tts';
import { startMockOllama, stepOf } from '../mocks/ollama';

/** A tiny valid WAV: 16-bit mono 22,050 Hz, a few samples. */
function tinyWav(): Buffer {
  const samples = 64;
  const wav = Buffer.alloc(44 + samples * 2);
  wav.write('RIFF', 0);
  wav.writeUInt32LE(36 + samples * 2, 4);
  wav.write('WAVEfmt ', 8);
  wav.writeUInt32LE(16, 16);
  wav.writeUInt16LE(1, 20);
  wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(22_050, 24);
  wav.writeUInt32LE(44_100, 28);
  wav.writeUInt16LE(2, 32);
  wav.writeUInt16LE(16, 34);
  wav.write('data', 36);
  wav.writeUInt32LE(samples * 2, 40);
  for (let i = 0; i < samples; i++) wav.writeInt16LE(Math.round(8000 * Math.sin(i / 3)), 44 + i * 2);
  return wav;
}

/**
 * A fake `piper` on PATH, like Piper 1.8 with -d: logs its arguments, optionally sleeps, then writes
 * the tiny WAV into the -d folder once per stdin line, logging each line. Files are numbered from 9,
 * so 10.wav sorts before 9.wav as text: the server must order them by number.
 */
const FAKE_PIPER = `#!/bin/sh
echo "$@" >> "$FAKE_PIPER_LOG"
dir=""
while [ $# -gt 0 ]; do
  if [ "$1" = "-d" ]; then dir="$2"; shift; fi
  shift
done
if [ -n "$FAKE_PIPER_SLEEP" ]; then sleep "$FAKE_PIPER_SLEEP"; fi
mkdir -p "$dir"
n=9
while IFS= read -r line || [ -n "$line" ]; do
  echo "$line" >> "$FAKE_PIPER_LOG.text"
  cp "$FAKE_PIPER_WAV" "$dir/$n.wav"
  n=$((n+1))
done
`;

let dir: string;
let servers: ReturnType<typeof buildServer>[] = [];
let closers: (() => Promise<void>)[] = [];

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'ofrenda-tts-'));
  await writeFile(join(dir, 'piper'), FAKE_PIPER);
  await chmod(join(dir, 'piper'), 0o755);
  await writeFile(join(dir, 'tiny.wav'), tinyWav());
  await writeFile(join(dir, 'log'), '');
  for (const voice of VOICES) {
    await writeFile(join(dir, `${voice.id}.onnx`), '');
    await writeFile(join(dir, `${voice.id}.onnx.json`), '{}');
  }
});

afterEach(async () => {
  for (const s of servers) await s.close();
  for (const close of closers) await close();
  servers = [];
  closers = [];
  await rm(dir, { recursive: true, force: true });
});

/** The server with the fake Piper on PATH (or no Piper at all), its voices and cache in the temp dir. */
function server(options: { piper?: boolean; sleep?: number; timeoutMs?: number; ollama?: string } = {}) {
  const tts: Partial<TtsOptions> = {
    voicesDir: dir,
    cacheDir: join(dir, 'cache'),
    timeoutMs: options.timeoutMs ?? 5000,
    userBinDirs: [],
    env: {
      PATH: options.piper === false ? '/nonexistent' : `${dir}:/usr/bin:/bin`,
      FAKE_PIPER_LOG: join(dir, 'log'),
      FAKE_PIPER_WAV: join(dir, 'tiny.wav'),
      ...(options.sleep ? { FAKE_PIPER_SLEEP: String(options.sleep) } : {}),
    },
  };
  const s = buildServer({ tts, ollama: { host: options.ollama ?? 'http://127.0.0.1:9', liveTimeoutMs: 2000, prefetchTimeoutMs: 5000 } });
  servers.push(s);
  return s;
}

const tts = (s: ReturnType<typeof buildServer>, payload: Record<string, unknown>) => s.inject({ method: 'POST', url: '/api/tts', payload });
const log = async () => (await readFile(join(dir, 'log'), 'utf8')).trim().split('\n').filter(Boolean);

describe('POST /api/tts', () => {
  it('runs Piper with the right model, rate and expression, and returns audio/wav', async () => {
    const s = server();
    const response = await tts(s, { text: 'Who walks in my house?', voiceId: 'en_US-ryan-medium', rate: 1.15, expression: 0.82 });
    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toBe('audio/wav');
    expect(response.rawPayload.subarray(0, 4).toString()).toBe('RIFF');
    const [args] = await log();
    expect(args).toContain(`-m ${join(dir, 'en_US-ryan-medium.onnx')}`);
    expect(args).toContain('--length-scale 1.15');
    expect(args).toContain('--noise-scale 0.82');
    expect(args).toContain('--noise-w-scale 0.6');
    expect(args).toMatch(/-d \S+/);
    expect(await readFile(join(dir, 'log.text'), 'utf8')).toContain('Who walks in my house?');
  });

  it('speaks a line phrase by phrase, one Piper run, with pauses: long after a question, short after a comma', async () => {
    const s = server();
    const response = await tts(s, { text: 'Who walks here? Closer, stranger.', voiceId: 'en_US-ryan-medium' });
    expect(response.statusCode).toBe(200);
    expect(await log()).toHaveLength(1);
    expect((await readFile(join(dir, 'log.text'), 'utf8')).trim().split('\n')).toEqual(['Who walks here?', 'Closer,', 'stranger.']);
    const wav = response.rawPayload;
    const tiny = 64 * 2;
    expect(wav.readUInt32LE(40)).toBe(3 * tiny + (Math.round(0.85 * 22_050) + Math.round(0.4 * 22_050)) * 2);
  });

  it('serves a repeated line from the disk cache without running Piper again', async () => {
    const s = server();
    await tts(s, { text: 'Again, stranger.', voiceId: 'en_GB-alan-medium' });
    const second = await tts(s, { text: 'Again, stranger.', voiceId: 'en_GB-alan-medium' });
    expect(second.statusCode).toBe(200);
    expect(await log()).toHaveLength(1);
    expect((await readdir(join(dir, 'cache'))).filter((f) => f.endsWith('.wav'))).toHaveLength(1);
  });

  it('answers 503 within 500 ms when Piper is missing, and health says piper: false', async () => {
    const s = server({ piper: false });
    const started = Date.now();
    const response = await tts(s, { text: 'Hello?', voiceId: 'en_US-lessac-medium' });
    expect(response.statusCode).toBe(503);
    expect(Date.now() - started).toBeLessThan(500);
    expect((await s.inject({ url: '/api/health' })).json()).toMatchObject({ piper: false });
    expect((await server().inject({ url: '/api/health' })).json()).toMatchObject({ piper: true });
  });

  it('reports piper: false when a voice model is missing', async () => {
    await rm(join(dir, 'en_GB-alan-medium.onnx'));
    expect((await server().inject({ url: '/api/health' })).json()).toMatchObject({ piper: false });
  });

  it('gives up with 503 when Piper takes too long', async () => {
    const s = server({ sleep: 3, timeoutMs: 300 });
    const started = Date.now();
    const response = await tts(s, { text: 'Slowly...', voiceId: 'en_US-ryan-medium' });
    expect(response.statusCode).toBe(503);
    expect(Date.now() - started).toBeLessThan(1000);
  });

  it('rejects an unknown voice or empty text with 400', async () => {
    const s = server();
    expect((await tts(s, { text: 'Hi', voiceId: 'en_US-nobody-medium' })).statusCode).toBe(400);
    expect((await tts(s, { text: '', voiceId: 'en_US-ryan-medium' })).statusCode).toBe(400);
    expect(await log()).toHaveLength(0);
  });
});

describe('prefetching speech', () => {
  it('speaks each prefetched line ahead of time, in that spirit voice', async () => {
    const mock = await startMockOllama({
      reply: (body) =>
        stepOf(body) === 'riddle'
          ? { content: JSON.stringify({ question: 'I keep the hours of a house that sleeps. What am I?', wrongAnswers: ['A bell', 'A key', 'A lamp'] }) }
          : { content: JSON.stringify({ line: 'Who walks in my house on the night of the dead?' }) },
    });
    closers.push(() => mock.close());
    const s = server({ ollama: mock.url });
    const spirit = generateCase(42).characters.find((c) => c.role !== 'patriarch')!;
    const voice = assignVoices(42, generateCase(42).characters)[spirit.id]!;
    await s.inject({ method: 'POST', url: '/api/spirit/prefetch', payload: { seed: 42, characterIds: [spirit.id], trust: 50 } });
    await s.llm.idle();
    await vi.waitFor(async () => expect(await log()).toHaveLength(2), { timeout: 3000 });
    await s.tts.idle();
    for (const args of await log()) {
      expect(args).toContain(`${voice.voiceId}.onnx`);
      expect(args).toContain(`--length-scale ${lengthScale(voice)}`);
      expect(args).toContain(`--noise-scale ${voice.expression}`);
    }
    const spoken = await readFile(join(dir, 'log.text'), 'utf8');
    expect(spoken).toContain('Who walks in my house');
    expect(spoken).toContain('I keep the hours');
    // The client's later request for the same line is a cache hit.
    const response = await tts(s, { text: 'Who walks in my house on the night of the dead?', voiceId: voice.voiceId, rate: lengthScale(voice), expression: voice.expression });
    expect(response.statusCode).toBe(200);
    expect(await log()).toHaveLength(2);
  });
});
