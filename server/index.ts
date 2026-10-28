import Fastify, { type FastifyInstance } from 'fastify';

export interface Health {
  ok: true;
  ollama: boolean;
  piper: boolean;
}

/** Builds the local server without listening, so tests can use `inject()`. */
export function buildServer(): FastifyInstance {
  const server = Fastify({ logger: false });

  // ollama and piper stay false until specs 08 and 09 check for them.
  server.get('/api/health', async (): Promise<Health> => ({ ok: true, ollama: false, piper: false }));

  return server;
}
