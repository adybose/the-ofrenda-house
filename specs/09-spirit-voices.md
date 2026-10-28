# 09: Spirit voices
Status: Approved
Depends on: 07, 08

## Goal
Every spirit line is spoken aloud by a local Piper voice that sounds distinct and ghostly, and the game carries on silently with text if Piper is missing.

## Requirements
- WHEN the client posts to `/api/tts` with `{ text, voiceId }` THE SYSTEM SHALL run Piper locally (`server/tts.ts`) and return `audio/wav`.
- THE SYSTEM SHALL use 3 or 4 English Piper voice models stored in `voices/` (git-ignored), fetched once by `npm run setup:voices` during setup, never at runtime. The chosen voices are recorded in this spec during planning.
- THE SYSTEM SHALL assign each spirit a voice deterministically from the seed and the character's traits: a base voice plus a pitch offset and a speaking rate (Piper `length_scale`), so no two spirits in a run sound the same.
- THE SYSTEM SHALL make voices ghostly on the client: pitch shift, band-limiting, an echo (feedback delay) and the room reverb from spec 07, through the voice bus. La Sombra uses a much lower, whispered chain, placed at its position.
- THE SYSTEM SHALL cache generated audio on disk in `.cache/tts/`, keyed by a hash of the text and voice, and cache decoded buffers on the client.
- WHEN dialogue is prefetched THE SYSTEM SHALL also prefetch its speech.
- WHEN audio is available THE SYSTEM SHALL tell the typewriter the line's duration so text and speech finish together.
- WHEN Piper or a voice model is missing, Piper errors, or synthesis takes over 5 s THE SYSTEM SHALL answer 503 quickly, and the client SHALL show the text without speech and without an error dialog. `/api/health` reports `piper: false` when Piper or the models are missing.
- No new npm dependency. Piper is an external local program installed with `pip` (see `docs/build-plan.md`).

## Interfaces
```ts
POST /api/tts -> audio/wav | 503
assignVoices(seed, characters): Record<CharacterId, { voiceId; pitch; rate }>
speak(line: string, voice: VoiceSpec, position?: Vec3): Promise<{ spoken: boolean; durationMs?: number }>
```

## Out of scope
The dialogue box (10), what spirits say (08).

## Acceptance checks
Must:
- [ ] With a fake `piper` script on PATH that writes a tiny WAV, `/api/tts` returns `audio/wav` and passes the right model and rate arguments.
- [ ] With Piper missing, `/api/tts` returns 503 within 500 ms and `/api/health` reports `piper: false`.
- [ ] Voice assignment is deterministic, and for 1,000 seeds no two spirits in a run share the same voice settings.
- [ ] `speak()` resolves `{ spoken: false }` and never throws when TTS is unavailable.
- [ ] Playwright: the ghost voice chain renders a test WAV offline with non-silent output and no clipping.
Should:
- [ ] Manual on the M1 Pro: first audio of a 20-word line in under 1.5 s when not cached, recorded here.
- [ ] Manual listening: each spirit in seed 42 is distinguishable, and La Sombra is unsettling.

## Test plan
Vitest: TTS route with a fake Piper, missing Piper, cache hits, voice assignment property test. Playwright: offline render of the voice chain. Manual: latency and listening.
