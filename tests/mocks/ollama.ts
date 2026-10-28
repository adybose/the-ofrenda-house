import Fastify from 'fastify';

export interface ChatBody {
  model: string;
  messages: { role: string; content: string }[];
  format: unknown;
  stream: boolean;
  options?: Record<string, unknown>;
}

export interface MockReply {
  /** The model's message content (a JSON string when well behaved). */
  content: string;
  delayMs?: number;
  status?: number;
}

/**
 * A fake Ollama for tests: `/api/tags` lists `models`, and `/api/chat` answers with whatever
 * `reply` returns for each request, after an optional delay. Every chat body is recorded.
 */
export async function startMockOllama(options: { models?: string[]; reply: (body: ChatBody, index: number) => MockReply }) {
  const server = Fastify({ logger: false });
  const calls: ChatBody[] = [];
  const started: number[] = [];
  server.get('/api/tags', async () => ({ models: (options.models ?? ['gemma3:4b']).map((name) => ({ name, model: name })) }));
  server.post('/api/chat', async (request, response) => {
    const body = request.body as ChatBody;
    const index = calls.length;
    calls.push(body);
    started.push(Date.now());
    const reply = options.reply(body, index);
    if (reply.delayMs) await new Promise((resolve) => setTimeout(resolve, reply.delayMs));
    response.status(reply.status ?? 200);
    return { model: body.model, message: { role: 'assistant', content: reply.content }, done: true };
  });
  await server.listen({ host: '127.0.0.1', port: 0 });
  const address = server.server.address();
  const port = typeof address === 'object' && address ? address.port : 0;
  return { url: `http://127.0.0.1:${port}`, calls, started, close: () => server.close() };
}

/** The step a chat request is for, read from the instruction the bridge sends. */
export function stepOf(body: ChatBody): string {
  return /STEP: (\w+)/.exec(body.messages.at(-1)?.content ?? '')?.[1] ?? 'unknown';
}
