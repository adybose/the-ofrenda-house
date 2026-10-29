import Fastify, { type FastifyInstance } from 'fastify';
import { assignVoices, lengthScale } from '../src/dialogue/voices';
import { createBridge, type Bridge } from './llm/bridge';
import { configFromEnv, type OllamaConfig } from './llm/ollama';
import { STEPS, type LineRequest, type SpiritStep, type TauntRequest } from './llm/types';
import { createTts, ttsFromEnv, type Tts, type TtsOptions } from './tts';

export interface Health {
  ok: true;
  ollama: boolean;
  piper: boolean;
}

declare module 'fastify' {
  interface FastifyInstance {
    /** The LLM bridge (spec 08): spirits' lines, prefetching and the Shadow's taunts. */
    llm: Bridge;
    /** Piper text-to-speech (spec 09). */
    tts: Tts;
  }
}

export interface ServerOptions {
  /** Where Ollama is and how long to wait; defaults come from the environment. */
  ollama?: Partial<OllamaConfig>;
  /** Where Piper and its voices are; defaults come from the environment. */
  tts?: Partial<TtsOptions>;
}

const SPIRIT_STEPS = STEPS.filter((s): s is SpiritStep => s !== 'taunt');

/** Builds the local server without listening, so tests can use `inject()`. */
export function buildServer(options: ServerOptions = {}): FastifyInstance {
  const server = Fastify({ logger: false });
  const tts = createTts(ttsFromEnv(options.tts));
  // Each line a prefetch makes ready is spoken ahead of time too, in that spirit's voice.
  const bridge: Bridge = createBridge(configFromEnv(options.ollama), {
    onPrefetched(seed, characterId, response) {
      const voice = assignVoices(seed, bridge.caseFor(seed).characters)[characterId];
      if (voice) tts.prefetch(response.line, voice.voiceId, lengthScale(voice));
    },
  });
  server.decorate('llm', bridge);
  server.decorate('tts', tts);

  server.get('/api/health', async (): Promise<Health> => ({ ok: true, ollama: await bridge.available(), piper: await tts.available() }));

  server.post('/api/tts', async (request, reply) => {
    const body = (request.body ?? {}) as { text?: unknown; voiceId?: unknown; rate?: unknown };
    const text = typeof body.text === 'string' ? body.text.trim() : '';
    if (!text || text.length > 600 || !tts.knows(body.voiceId)) return reply.status(400).send({ error: 'text and a known voiceId required' });
    const rate = typeof body.rate === 'number' && body.rate >= 0.5 && body.rate <= 2 ? body.rate : 1;
    const wav = await tts.synthesize(text, body.voiceId, rate);
    if (!wav) return reply.status(503).send({ error: 'speech unavailable' });
    return reply.type('audio/wav').send(wav);
  });

  server.post('/api/spirit/line', async (request, reply) => {
    const body = (request.body ?? {}) as Partial<LineRequest>;
    const known = body.seed !== undefined && body.characterId && bridge.caseFor(body.seed).characters.some((c) => c.id === body.characterId);
    if (!known || !SPIRIT_STEPS.includes(body.step as SpiritStep)) return reply.status(400).send({ error: 'unknown seed, character or step' });
    return bridge.line({ ...(body as LineRequest), trust: typeof body.trust === 'number' ? body.trust : 50 });
  });

  server.post('/api/spirit/prefetch', async (request, reply) => {
    const body = (request.body ?? {}) as { seed?: number | string; characterIds?: string[]; trust?: number };
    if (body.seed === undefined || !Array.isArray(body.characterIds)) return reply.status(400).send({ error: 'seed and characterIds required' });
    bridge.prefetch(body.seed, body.characterIds, typeof body.trust === 'number' ? body.trust : 50);
    return reply.status(202).send({ queued: body.characterIds.length });
  });

  server.post('/api/shadow/taunt', async (request, reply) => {
    const body = (request.body ?? {}) as Partial<TauntRequest>;
    if (body.seed === undefined || (body.context !== 'chase' && body.context !== 'whisper')) return reply.status(400).send({ error: 'seed and context required' });
    return bridge.taunt(body as TauntRequest);
  });

  return server;
}
