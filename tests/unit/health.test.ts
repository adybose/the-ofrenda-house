import { afterEach, describe, expect, it } from 'vitest';
import { buildServer } from '../../server/index';

describe('GET /api/health', () => {
  const server = buildServer();
  afterEach(async () => {
    await server.close();
  });

  it('returns 200 with ok: true and the service flags', async () => {
    const response = await server.inject({ method: 'GET', url: '/api/health' });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ ok: true, ollama: false, piper: false });
  });
});
