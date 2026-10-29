import { afterEach, describe, expect, it } from 'vitest';
import { buildServer } from '../../server/index';

describe('GET /api/health', () => {
  // Point at a port nothing listens on and a Piper that isn't there, so the result doesn't depend on
  // a local Ollama or Piper.
  const server = buildServer({ ollama: { host: 'http://127.0.0.1:9' }, tts: { bin: '/nonexistent/piper', userBinDirs: [] } });
  afterEach(async () => {
    await server.close();
  });

  it('returns 200 with ok: true and the service flags', async () => {
    const response = await server.inject({ method: 'GET', url: '/api/health' });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ ok: true, ollama: false, piper: false });
  });
});
