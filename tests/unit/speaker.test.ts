import { describe, expect, it, vi } from 'vitest';
import { createSpeaker } from '../../src/audio/voice';
import { SHADOW_VOICE, lengthScale, type VoiceSpec } from '../../src/dialogue/voices';

const VOICE: VoiceSpec = { voiceId: 'en_US-lessac-medium', pitch: 0.9, rate: 1.1, expression: 0.8 };

const okResponse = () => ({ ok: true, status: 200, arrayBuffer: async () => new ArrayBuffer(8) });

function setup(fetchImpl: () => Promise<{ ok: boolean; status: number; arrayBuffer(): Promise<ArrayBuffer> }>, decode = async () => ({ duration: 1.8 })) {
  const fetch = vi.fn(fetchImpl);
  const decodeSpy = vi.fn(decode);
  const play = vi.fn();
  return { fetch, decode: decodeSpy, play, speaker: createSpeaker({ fetch, decode: decodeSpy, play }) };
}

describe('speak()', () => {
  it('speaks: asks for the voice and its length scale, plays it, and gives the duration after the pitch shift', async () => {
    const { fetch, play, speaker } = setup(async () => okResponse());
    const result = await speaker.speak('Who walks in my house?', VOICE, [1, 2, 3]);
    expect(result).toEqual({ spoken: true, durationMs: Math.round((1.8 / 0.9) * 1000) });
    const [url, init] = fetch.mock.calls[0]! as unknown as [string, { body: string }];
    expect(url).toBe('/api/tts');
    expect(JSON.parse(init.body)).toEqual({ text: 'Who walks in my house?', voiceId: VOICE.voiceId, rate: lengthScale(VOICE), expression: 0.8 });
    expect(play).toHaveBeenCalledWith({ duration: 1.8 }, VOICE, [1, 2, 3]);
  });

  it('decodes a line once, then plays it again from memory', async () => {
    const { fetch, decode, play, speaker } = setup(async () => okResponse());
    await speaker.speak('Again.', VOICE);
    await speaker.speak('Again.', VOICE);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(decode).toHaveBeenCalledTimes(1);
    expect(play).toHaveBeenCalledTimes(2);
    // A different voice is a different line.
    await speaker.speak('Again.', SHADOW_VOICE);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('stays silent, without throwing, when speech is unavailable', async () => {
    const cases = [
      setup(async () => ({ ok: false, status: 503, arrayBuffer: async () => new ArrayBuffer(0) })),
      setup(async () => {
        throw new TypeError('Failed to fetch');
      }),
      setup(
        async () => okResponse(),
        async () => {
          throw new DOMException('Unable to decode audio data', 'EncodingError');
        },
      ),
    ];
    for (const { speaker, play } of cases) {
      await expect(speaker.speak('Hello?', VOICE)).resolves.toEqual({ spoken: false });
      expect(play).not.toHaveBeenCalled();
    }
  });

  it('does not ask for speech when there is nothing to say', async () => {
    const { fetch, speaker } = setup(async () => okResponse());
    await expect(speaker.speak('   ', VOICE)).resolves.toEqual({ spoken: false });
    expect(fetch).not.toHaveBeenCalled();
  });
});
