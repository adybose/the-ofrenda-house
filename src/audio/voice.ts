import { lengthScale, type VoiceSpec } from '../dialogue/voices';
import type { AudioEngine, Vec3 } from './engine';

/** What `speak` needs from the outside world, so it can be tested without a browser. */
export interface SpeakerDeps<B extends { duration: number }> {
  fetch: (url: string, init: { method: string; headers: Record<string, string>; body: string }) => Promise<{ ok: boolean; status: number; arrayBuffer(): Promise<ArrayBuffer> }>;
  decode: (bytes: ArrayBuffer) => Promise<B>;
  /** Plays a decoded line through the ghost chain (`AudioEngine.playVoice`). */
  play: (buffer: B, voice: VoiceSpec, position?: Vec3) => void;
}

export interface Speaker {
  /**
   * Speaks a line aloud in a spirit's voice (spec 09). `durationMs` is how long it lasts after the pitch
   * shift, for the typewriter. Never throws: without speech it resolves `{ spoken: false }` and the
   * line is shown as text.
   */
  speak(line: string, voice: VoiceSpec, position?: Vec3): Promise<{ spoken: boolean; durationMs?: number }>;
}

/** Decoded lines kept in memory: a repeated line plays at once. */
const MAX_CACHED = 64;

export function createSpeaker<B extends { duration: number }>(deps: SpeakerDeps<B>): Speaker {
  const decoded = new Map<string, Promise<B | undefined>>();

  async function load(text: string, voice: VoiceSpec): Promise<B | undefined> {
    try {
      const response = await deps.fetch('/api/tts', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ text, voiceId: voice.voiceId, rate: lengthScale(voice), expression: voice.expression }),
      });
      if (!response.ok) return undefined;
      return await deps.decode(await response.arrayBuffer());
    } catch {
      return undefined;
    }
  }

  return {
    async speak(line, voice, position) {
      const text = line.trim();
      if (!text) return { spoken: false };
      const key = JSON.stringify([voice.voiceId, lengthScale(voice), voice.expression, text]);
      let pending = decoded.get(key);
      if (!pending) {
        pending = load(text, voice);
        decoded.set(key, pending);
        if (decoded.size > MAX_CACHED) decoded.delete(decoded.keys().next().value!);
      }
      const buffer = await pending;
      // A failure isn't cached: Piper may be back next time.
      if (!buffer) {
        decoded.delete(key);
        return { spoken: false };
      }
      try {
        deps.play(buffer, voice, position);
      } catch {
        return { spoken: false };
      }
      return { spoken: true, durationMs: Math.round((buffer.duration / voice.pitch) * 1000) };
    },
  };
}

/** The game's speaker: speech from the local server, decoded and played by the audio engine. */
export function speakerFor(audio: AudioEngine): Speaker {
  return createSpeaker({
    fetch: (url, init) => fetch(url, init),
    decode: (bytes) => audio.decodeAudio(bytes),
    play: (buffer, voice, position) => audio.playVoice(buffer, voice, position),
  });
}
