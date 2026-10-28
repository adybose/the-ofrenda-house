import { afterEach, describe, expect, it } from 'vitest';
import { generateCase } from '../../src/case/generate';
import { RIDDLE_BUNDLES, ROLE_ORDER } from '../../src/case/pools';
import type { Role } from '../../src/case/types';
import { TRUST_BUCKETS } from '../../src/dialogue/trust';
import { FALLBACKS, SHADOW_TAUNTS } from '../../server/fallbacks';
import { buildServer } from '../../server/index';
import { LIE_INSTRUCTION, buildPrompt } from '../../server/llm/prompts';
import { STEPS, type Step } from '../../server/llm/types';
import { validateStep } from '../../server/llm/validate';
import { startMockOllama, stepOf, type MockReply } from '../mocks/ollama';

type Mock = Awaited<ReturnType<typeof startMockOllama>>;
let mock: Mock | undefined;
let server: ReturnType<typeof buildServer> | undefined;

afterEach(async () => {
  await server?.close();
  await mock?.close();
  server = undefined;
  mock = undefined;
});

/** A well-behaved model: a short line, or a riddle with three fresh wrong answers. */
function goodReply(step: string): MockReply {
  if (step === 'riddle') {
    return { content: JSON.stringify({ question: 'I keep the hours of a house that sleeps. What swings in my belly?', wrongAnswers: ['A bell rope', 'A key', 'A lantern'] }) };
  }
  if (step === 'taunt') return { content: JSON.stringify({ line: 'Run, little thief. The house is mine.' }) };
  return { content: JSON.stringify({ line: 'Who walks in my house on the night of the dead?' }) };
}

async function setup(reply: (body: Parameters<Parameters<typeof startMockOllama>[0]['reply']>[0], index: number) => MockReply, options: { liveTimeoutMs?: number } = {}) {
  mock = await startMockOllama({ reply });
  server = buildServer({ ollama: { host: mock.url, liveTimeoutMs: options.liveTimeoutMs ?? 2000, prefetchTimeoutMs: 5000 } });
  return { mock, server };
}

const CASE = generateCase(42);
const nonPatriarch = CASE.characters.find((c) => c.role !== 'patriarch')!;

async function line(s: NonNullable<typeof server>, body: Record<string, unknown>) {
  const response = await s.inject({ method: 'POST', url: '/api/spirit/line', payload: { seed: 42, trust: 50, ...body } });
  return { status: response.statusCode, body: response.json() as { source: string; line: string; riddle?: { question: string; options: string[]; correctIndex: number } } };
}

describe('POST /api/spirit/line with a working model', () => {
  it('returns the model line, marked llm, once it passes the schema', async () => {
    const { server: s, mock: m } = await setup((body) => goodReply(stepOf(body)));
    const { status, body } = await line(s, { characterId: nonPatriarch.id, step: 'greeting' });
    expect(status).toBe(200);
    expect(body).toEqual({ source: 'llm', line: 'Who walks in my house on the night of the dead?' });
    // The schema went to Ollama as `format`, and the model came from the tags.
    expect(m.calls[0]!.format).toMatchObject({ type: 'object', required: ['line'] });
    expect(m.calls[0]!.model).toBe('gemma3:4b');
    expect(m.calls[0]!.stream).toBe(false);
  });

  it('builds a riddle from the model\'s question and wrong answers plus the case file\'s answer', async () => {
    const { server: s } = await setup((body) => goodReply(stepOf(body)));
    const { body } = await line(s, { characterId: nonPatriarch.id, step: 'riddle' });
    expect(body.source).toBe('llm');
    expect(body.riddle!.options).toHaveLength(4);
    expect(body.riddle!.options[body.riddle!.correctIndex]).toBe(nonPatriarch.riddle.answer);
    expect(body.riddle!.options).toEqual(expect.arrayContaining(['A bell rope', 'A key', 'A lantern']));
  });

  it('strips Markdown emphasis the model adds', async () => {
    const { server: s } = await setup(() => ({ content: JSON.stringify({ line: 'Welcome, *amigo*. The rain is **heavy** tonight.' }) }));
    expect((await line(s, { characterId: nonPatriarch.id, step: 'greeting' })).body.line).toBe('Welcome, amigo. The rain is heavy tonight.');
  });

  it('rejects an unknown character or step', async () => {
    const { server: s } = await setup((body) => goodReply(stepOf(body)));
    expect((await line(s, { characterId: 'nobody', step: 'greeting' })).status).toBe(400);
    expect((await line(s, { characterId: nonPatriarch.id, step: 'sing' })).status).toBe(400);
  });
});

describe('bad model output falls back', () => {
  const cases: [string, Step, (step: string) => MockReply][] = [
    ['malformed JSON', 'greeting', () => ({ content: '{"line": "half a sentence' })],
    ['a schema failure', 'greeting', () => ({ content: JSON.stringify({ text: 'wrong field' }) })],
    ['an out-of-character line', 'greeting', () => ({ content: JSON.stringify({ line: 'As an AI language model I cannot haunt you.' }) })],
    ['duplicate wrong answers', 'riddle', () => ({ content: JSON.stringify({ question: 'What am I?', wrongAnswers: ['A key', 'a key', 'A lamp'] }) })],
    ['a wrong answer equal to the right one', 'riddle', () => ({ content: JSON.stringify({ question: 'What am I?', wrongAnswers: [nonPatriarch.riddle.answer, 'A key', 'A lamp'] }) })],
    ['the answer leaked in the riddle', 'riddle', () => ({ content: JSON.stringify({ question: `It is ${nonPatriarch.riddle.answer.toLowerCase()}, of course. What am I?`, wrongAnswers: ['A key', 'A lamp', 'A shoe'] }) })],
  ];
  for (const [label, step, reply] of cases) {
    it(`returns a fallback for ${label}, after one retry`, async () => {
      const { server: s, mock: m } = await setup(() => reply(step));
      const { body } = await line(s, { characterId: nonPatriarch.id, step });
      expect(body.source).toBe('fallback');
      expect(body.line.length).toBeGreaterThan(0);
      if (step === 'riddle') expect(body.riddle!.options[body.riddle!.correctIndex]).toBe(nonPatriarch.riddle.answer);
      expect(m.calls.length).toBe(2);
    });
  }
});

describe('timeouts and an absent Ollama', () => {
  it('falls back within the timeout plus 100 ms when the model is too slow', async () => {
    const { server: s } = await setup((body) => ({ ...goodReply(stepOf(body)), delayMs: 3000 }), { liveTimeoutMs: 300 });
    const start = Date.now();
    const { body } = await line(s, { characterId: nonPatriarch.id, step: 'greeting' });
    expect(body.source).toBe('fallback');
    expect(Date.now() - start).toBeLessThan(400);
  });

  it('falls back straight away when Ollama is not running', async () => {
    server = buildServer({ ollama: { host: 'http://127.0.0.1:9', liveTimeoutMs: 4000 } });
    const start = Date.now();
    const { body } = await line(server, { characterId: nonPatriarch.id, step: 'whoAreYou' });
    expect(body.source).toBe('fallback');
    expect(Date.now() - start).toBeLessThan(150);
  });

  it('reports ollama in /api/health only when the model is installed', async () => {
    mock = await startMockOllama({ models: ['gemma3:4b-it-qat'], reply: (body) => goodReply(stepOf(body)) });
    server = buildServer({ ollama: { host: mock.url } });
    expect((await server.inject({ url: '/api/health' })).json()).toMatchObject({ ok: true, ollama: true });
    await server.close();
    server = buildServer({ ollama: { host: mock.url, model: 'gemma3:27b' } });
    expect((await server.inject({ url: '/api/health' })).json()).toMatchObject({ ollama: false });
    await server.close();
    server = buildServer({ ollama: { host: 'http://127.0.0.1:9' } });
    expect((await server.inject({ url: '/api/health' })).json()).toMatchObject({ ollama: false });
  });
});

describe('prompts', () => {
  const allSteps = STEPS.filter((s) => s !== 'taunt');

  it('match their snapshots for seed 42', () => {
    const snapshot: Record<string, unknown> = {};
    for (const character of CASE.characters) {
      for (const step of allSteps) {
        snapshot[`${character.id}:${step}`] = buildPrompt(CASE, character.id, step, { trust: 50, lastChoiceText: 'A traveller lost in the storm', lastChoiceCategory: 'honest' });
      }
    }
    expect(snapshot).toMatchSnapshot();
  });

  it('give the lie instruction only in the killer\'s reward, and no facts outside what each step allows', () => {
    for (let seed = 0; seed < 50; seed++) {
      const caseFile = generateCase(seed);
      for (const character of caseFile.characters) {
        for (const step of allSteps) {
          const text = buildPrompt(caseFile, character.id, step, { trust: 50 }).map((m) => m.content).join('\n');
          const killerReward = character.id === caseFile.killerId && step === 'reward';
          expect(text.includes(LIE_INSTRUCTION), `${seed} ${character.id} ${step}`).toBe(killerReward);
          const allowed = step === 'reward' ? caseFile.facts.filter((f) => f.holderId === character.id) : [];
          for (const fact of caseFile.facts) {
            expect(text.includes(fact.text), `${seed} ${character.id} ${step} leaks ${fact.id}`).toBe(allowed.includes(fact));
          }
          for (const secret of caseFile.secrets) expect(text.includes(secret.text) && !allowed.some((f) => f.text === secret.text)).toBe(false);
        }
        if (character.id === caseFile.killerId) {
          const reward = buildPrompt(caseFile, character.id, 'reward', { trust: 50 }).map((m) => m.content).join('\n');
          expect(reward).toContain(caseFile.facts.find((f) => f.isLie)!.text);
        }
      }
    }
  });
});

describe('riddle answers', () => {
  it('include the case file\'s right answer exactly once, for 200 seeds and every character', async () => {
    // Ollama absent: every riddle comes from the fallbacks, which is the path that must never fail.
    server = buildServer({ ollama: { host: 'http://127.0.0.1:9' } });
    for (let seed = 0; seed < 200; seed++) {
      const caseFile = generateCase(seed);
      for (const character of caseFile.characters) {
        const response = await server.inject({ method: 'POST', url: '/api/spirit/line', payload: { seed, characterId: character.id, step: 'riddle', trust: 50 } });
        const { riddle } = response.json() as { riddle: { options: string[]; correctIndex: number } };
        expect(riddle.options.filter((o) => o === character.riddle.answer)).toHaveLength(1);
        expect(riddle.options[riddle.correctIndex]).toBe(character.riddle.answer);
        expect(new Set(riddle.options.map((o) => o.toLowerCase())).size).toBe(4);
      }
    }
  });
});

describe('prefetch and the queue', () => {
  it('serves a line from the cache after a prefetch, without asking the model again', async () => {
    const { server: s, mock: m } = await setup((body) => goodReply(stepOf(body)));
    const response = await s.inject({ method: 'POST', url: '/api/spirit/prefetch', payload: { seed: 42, characterIds: [nonPatriarch.id], trust: 50 } });
    expect(response.statusCode).toBe(202);
    await s.llm.idle();
    expect(m.calls.map(stepOf).sort()).toEqual(['greeting', 'riddle']);
    const before = m.calls.length;
    expect((await line(s, { characterId: nonPatriarch.id, step: 'greeting' })).body.source).toBe('llm');
    expect((await line(s, { characterId: nonPatriarch.id, step: 'riddle' })).body.source).toBe('llm');
    expect(m.calls.length).toBe(before);
  });

  it('sends a live request ahead of queued prefetches', async () => {
    const { server: s, mock: m } = await setup((body) => ({ ...goodReply(stepOf(body)), delayMs: 150 }), { liveTimeoutMs: 3000 });
    const other = CASE.characters.filter((c) => c.role !== 'patriarch')[1]!;
    await s.inject({ method: 'POST', url: '/api/spirit/prefetch', payload: { seed: 42, characterIds: [nonPatriarch.id, other.id], trust: 50 } });
    const live = line(s, { characterId: other.id, step: 'whoAreYou' });
    await live;
    await s.llm.idle();
    // The live request is the first or second call sent, never behind all four prefetches.
    const order = m.calls.map(stepOf);
    expect(order.indexOf('whoAreYou')).toBeLessThanOrEqual(1);
  });
});

describe('POST /api/shadow/taunt', () => {
  it('returns a taunt of at most 12 words, and falls back when the model rambles', async () => {
    const { server: s } = await setup(() => ({ content: JSON.stringify({ line: 'You cannot run from me, little one, for this house remembers every footstep you take tonight.' }) }));
    for (const context of ['chase', 'whisper']) {
      const response = await s.inject({ method: 'POST', url: '/api/shadow/taunt', payload: { seed: 42, context } });
      const body = response.json() as { source: string; line: string };
      expect(body.source).toBe('fallback');
      expect(body.line.split(/\s+/).length).toBeLessThanOrEqual(12);
    }
  });
});

describe('fallbacks', () => {
  it('cover every role, step, trust bucket, reply kind and riddle theme, and pass validation', () => {
    for (const role of ROLE_ORDER as Role[]) {
      const f = FALLBACKS[role];
      for (const bucket of TRUST_BUCKETS) expect(f.greeting[bucket].length, `${role} greeting ${bucket}`).toBeGreaterThan(0);
      expect(f.whoAreYou.length).toBeGreaterThan(0);
      for (const kind of ['honest', 'evasive', 'lie'] as const) expect(f.reaction[kind].length, `${role} reaction ${kind}`).toBeGreaterThan(0);
      expect(f.reward.every((l) => l.includes('{fact}'))).toBe(true);
      expect(f.silence.length).toBeGreaterThan(0);
      for (const bundle of RIDDLE_BUNDLES[role]) {
        const riddle = f.riddles[bundle.riddle.theme];
        expect(riddle, `${role} riddle ${bundle.riddle.theme}`).toBeDefined();
        const check = validateStep('riddle', { question: riddle!.question, wrongAnswers: riddle!.wrong }, { answer: bundle.riddle.answer, otherNames: [], allowedText: '' });
        expect(check.ok, `${role} ${bundle.riddle.theme}: ${check.ok ? '' : check.errors.join('; ')}`).toBe(true);
      }
      for (const text of [...Object.values(f.greeting).flat(), ...f.whoAreYou, ...Object.values(f.reaction).flat(), ...f.silence]) {
        expect(validateStep('greeting', { line: text }, { otherNames: [], allowedText: '' }).ok, text).toBe(true);
      }
    }
    expect(SHADOW_TAUNTS.length).toBeGreaterThanOrEqual(20);
    for (const taunt of SHADOW_TAUNTS) expect(taunt.split(/\s+/).length, taunt).toBeLessThanOrEqual(12);
  });
});
