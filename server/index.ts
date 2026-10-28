import Fastify, { type FastifyInstance } from 'fastify';
import { createBridge, type Bridge } from './llm/bridge';
import { configFromEnv, type OllamaConfig } from './llm/ollama';
import { STEPS, type LineRequest, type SpiritStep, type TauntRequest } from './llm/types';

export interface Health {
  ok: true;
  ollama: boolean;
  piper: boolean;
}

declare module 'fastify' {
  interface FastifyInstance {
    /** The LLM bridge (spec 08): spirits' lines, prefetching and the Shadow's taunts. */
    llm: Bridge;
  }
}

export interface ServerOptions {
  /** Where Ollama is and how long to wait; defaults come from the environment. */
  ollama?: Partial<OllamaConfig>;
}

const SPIRIT_STEPS = STEPS.filter((s): s is SpiritStep => s !== 'taunt');

/** Builds the local server without listening, so tests can use `inject()`. */
export function buildServer(options: ServerOptions = {}): FastifyInstance {
  const server = Fastify({ logger: false });
  const bridge = createBridge(configFromEnv(options.ollama));
  server.decorate('llm', bridge);

  // piper stays false until spec 09 checks for it.
  server.get('/api/health', async (): Promise<Health> => ({ ok: true, ollama: await bridge.available(), piper: false }));

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
