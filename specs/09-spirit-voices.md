# 09: Spirit voices
Status: Done
Depends on: 07, 08

## Goal
Every spirit line is spoken aloud by a local Piper voice that sounds distinct and ghostly, and the game carries on silently with text if Piper is missing.

## Requirements
- WHEN the client posts to `/api/tts` with `{ text, voiceId, rate?, expression?, pitch? }` THE SYSTEM SHALL run Piper locally (`server/tts.ts`) and return `audio/wav`. `rate` is Piper's `length_scale` (above 1 is slower); `expression` its `noise_scale` (how much the intonation varies, 0.3 to 0.9); `pitch` the client's playback pitch, so pauses can be written to sound the same after it.
- THE SYSTEM SHALL speak slowly, with a long pause after ".", "?" and "!", a longer one after an ellipsis, and a shorter one after ",", ";", ":" and a dash.
- THE SYSTEM SHALL use 3 or 4 English Piper voice models stored in `voices/` (git-ignored), fetched once by `npm run setup:voices` during setup, never at runtime. The chosen voices are recorded in this spec during planning.
- THE SYSTEM SHALL assign each spirit a voice deterministically from the seed and the character's traits: a base voice plus a pitch offset and a speaking rate (Piper `length_scale`), so no two spirits in a run sound the same.
- THE SYSTEM SHALL make voices ghostly on the client: pitch shift, band-limiting, an echo (feedback delay) and the room reverb from spec 07, through the voice bus. La Sombra uses a much lower, darker chain (a doubled voice and a long echo), placed at its position.
- THE SYSTEM SHALL cache generated audio on disk in `.cache/tts/`, keyed by a hash of the text and voice, and cache decoded buffers on the client.
- WHEN dialogue is prefetched THE SYSTEM SHALL also prefetch its speech.
- WHEN audio is available THE SYSTEM SHALL tell the typewriter the line's duration so text and speech finish together.
- WHEN Piper or a voice model is missing, Piper errors, or synthesis takes over 5 s THE SYSTEM SHALL answer 503 quickly, and the client SHALL show the text without speech and without an error dialog. `/api/health` reports `piper: false` when Piper or the models are missing.
- No new npm dependency. Piper is an external local program installed with `pip` (see `docs/build-plan.md`).

## Interfaces
```ts
POST /api/tts { text, voiceId, rate?, expression?, pitch? } -> audio/wav | 503
assignVoices(seed, characters): Record<CharacterId, { voiceId; pitch; rate }>
speak(line: string, voice: VoiceSpec, position?: Vec3): Promise<{ spoken: boolean; durationMs?: number }>
```

## Out of scope
The dialogue box (10), what spirits say (08).

## Acceptance checks
Must:
- [x] With a fake `piper` script on PATH that writes a tiny WAV, `/api/tts` returns `audio/wav` and passes the right model and rate arguments.
- [x] With Piper missing, `/api/tts` returns 503 within 500 ms and `/api/health` reports `piper: false`.
- [x] Voice assignment is deterministic, and for 1,000 seeds no two spirits in a run share the same voice settings.
- [x] `speak()` resolves `{ spoken: false }` and never throws when TTS is unavailable.
- [x] Playwright: the ghost voice chain renders a test WAV offline with non-silent output and no clipping.
Should:
- [x] Manual on the M1 Pro: first audio of a 20-word line in under 1.5 s when not cached, recorded here.
- [x] Manual listening: each spirit in seed 42 is distinguishable, and La Sombra is unsettling.

## Test plan
Vitest: TTS route with a fake Piper, missing Piper, cache hits, voice assignment property test. Playwright: offline render of the voice chain. Manual: latency and listening.

## Decisions
- Piper is `piper-tts` 1.8.0 (the OHF-Voice piper1-gpl package), installed with `python3 -m pip install --user piper-tts`; its script lands in `~/Library/Python/3.9/bin`, which the server searches after `PIPER_BIN` and `PATH`. It is run as `piper -m <model> -f <out.wav> --length-scale <x>`, with the text on stdin.
- The voices, all "medium" quality from the rhasspy `piper-voices` collection, fetched into `voices/` by `npm run setup:voices`:
  - `en_US-lessac-medium` (female, clear) and `en_GB-jenny_dioco-medium` (female): the women of the house.
  - `en_US-ryan-medium` (male, deep) and `en_GB-alan-medium` (male): the men, and ryan for La Sombra.
- `/api/tts` takes an optional `rate` beside `{ text, voiceId }`: the acceptance check needs the rate passed to Piper.
- Pitch is applied on the client by playback rate, which also changes speed, so the client asks Piper for a length scale of `rate × pitch`: after the pitch shift the line runs at `rate`.
- Voice assignment (`src/dialogue/voices.ts`, shared by client and server): gender picks the voice, each gender's spirits spread evenly across its two voices; age by role sets the range of pitch and pace (the grandmother and patriarch lower and slower, the eldest child higher and quicker, the ranges never overlapping); spirits on the same voice spread to the furthest free point of that range in pitch and pace together, so any two on one voice differ by at least 0.05 in pitch or 0.09 in pace. A first version chose each spirit's voice and nudges independently: in seed 42 all four men landed on one voice, two of them 0.02 apart in pitch.
- Seed 42's voices (after the second listen), with how long the 20-word sample line lasts as heard: Don Emilio (patriarch) ryan, pitch 0.8, rate 1.8, expression 0.76, 8.9 s; Rafael (painter) alan 0.88, 1.52, 0.46, 8.3 s; Doña Esperanza (matriarch) lessac 0.96, 1.34, 0.44, 7.7 s; Severo (bookkeeper) ryan 1.0, 1.34, 0.45, 6.8 s; Ernesto (housekeeper) alan 1.0, 1.34, 0.44, 7.4 s; Lucía (eldest child) jenny 1.04, 1.23, 0.48, 6.3 s; Dr. Pilar Ortega (doctor, a woman) lessac 1.08, 1.52, 0.46, 8.4 s. La Sombra: ryan, pitch 0.75, rate 1.68, expression 0.45, 9.1 s. First audio about 0.8 s uncached for each.
- Server (`server/tts.ts`): at most two Piper processes at once, live requests ahead of prefetches, identical requests in flight shared; WAVs cached in `.cache/tts/` by a SHA-256 of voice, length scale and text, written to a temporary file and renamed so a killed run never leaves half a file. When the bridge finishes prefetching a line (a new `onPrefetched` hook), its speech is prefetched in that spirit's voice.
- Client: `speak()` (`src/audio/voice.ts`) keeps the last 64 decoded lines in memory and never caches a failure (Piper may come back). The ghost chain (`src/audio/ghost.ts`): spirits are band-limited (220 Hz to 3.8 kHz) with a 0.23 s echo at 0.35 feedback, into the voice bus (room reverb, and the storm ducks); La Sombra is low-passed at 2.5 kHz with breath whose loudness follows its words and a longer, darker echo. Offline, a voice-like test WAV peaks at 0.67 through the spirit chain and 0.91 through La Sombra's (0.46 once its noise layer was replaced by the doubled voice, its spectral flatness falling from 0.56, noise-like, to 0).
- Latency, 29 October 2026, M1 Pro, with Ollama running: the first audio of the 20-word line "Who walks in my house on the night of the dead? Closer, stranger, and tell me why you are here." took 0.74 to 0.79 s uncached for each of the four voices (Piper's start-up and model load included), and 1 ms from the disk cache.
- Debug: `?debug=voices` lists each spirit of the seed with its voice, a button to hear a line, and the time to first audio; hooks gained `renderGhostVoice`. The spec 00 health test now points at a Piper that isn't there, as it already did for Ollama, so it doesn't depend on what is installed.
- After the first listen (29 October 2026): speech was too fast and ran through its punctuation, the patriarch was not deep enough, Dr. Pilar's low-pitched female voice sounded as if she might be a man, and La Sombra's "whisper" (noise following its words) sounded like radio static. So:
  - The line is split into phrases after its punctuation, each keeping its punctuation (so its intonation: a question's rise, the lift before a comma, a full stop's fall), and sent to one Piper run as one phrase per stdin line with `-d` (Piper 1.8 writes a WAV per line). The server joins them with silence: 0.85 s after ".", "?" and "!", 1.1 s after an ellipsis, 0.4 s after ",", ";", ":" and a dash.
  - Natural modulation: Piper's `--noise-w-scale` (rhythm variation) goes from 0.8 to 1.0, and each spirit has an `expression`, Piper's `--noise-scale` (intonation variation, default 0.667), of 0.75 to 0.85: the grandmother at the calm end, the eldest child at the lively end.
  - Every spirit speaks about 0.2 slower (length scale: old 1.4, middle 1.28, young 1.18, each ±0.09; La Sombra 1.5).
  - Women are pitched 0.04 up and men 0.04 down, so no woman goes below about 0.9 or man above about 1.0; the patriarch has his own deeper range (0.725 to 0.875).
  - La Sombra's noise layer is gone ("whispered" in the requirement became "darker"): its voice is doubled by a second copy slightly lower and 25 ms late, band-limited from 80 Hz to 2.2 kHz, with the long dark echo.
  - The patriarch keeps to the low half of his range (0.74 to 0.8): the seed had put him at the top, 0.86, just under the painter.
  - Latency after these changes: the patriarch's 20-word line, now three phrases in one Piper run, took 0.92 s uncached and lasts 6.3 s before the pitch shift, pauses included.
- After the second listen (29 October 2026): the livelier delivery was the wrong direction. Pitch jumping up on some words isn't scary; the user wants it mostly flat and serious (the best were Lucía, Doña Esperanza, Severo and Dr. Pilar, which still varied a little too much). La Sombra was scary but its echo made it incomprehensible, and the patriarch's inflection was right but he should be slower. So:
  - Expression (Piper's noise scale) drops to about 0.45, well under Piper's default of 0.667: old 0.42, middle 0.45, young 0.48, each ±0.01. The patriarch keeps 0.76. Rhythm variation (`--noise-w-scale`) drops to 0.6, an even, measured delivery. The cache format went to 3.
  - The steady rhythm alone made Piper about 10% faster (one phrase: 2.24 s at 1.0, 2.01 s at 0.6), so every pace rose about 12% to keep the slowness: old 1.57, middle 1.43, young 1.32. The patriarch's range is 1.8 to 1.89, always the slowest. La Sombra is 1.68.
  - The four voices talk at very different natural speeds. The same 29-word passage grows by 4.56 s per unit of length scale in lessac's voice, 5.18 in jenny's, 3.91 in ryan's and 7.14 in alan's, with about 2.7 s that doesn't stretch. Each voice now has a `tempo` (lessac 1, jenny 0.88, ryan 1.17, alan 0.64) multiplied into the length scale, so a pace sounds the same on any voice. Without it the patriarch, on ryan, came out quicker than the painter on alan.
  - La Sombra's echo is one short slap (0.14 s, 0.15 feedback, 0.2 level; it was 0.38 s, 0.45, 0.45 and rang 1.9 s past its last word), its double is quieter (0.4, 18 ms behind), and its low-pass opens from 2.2 to 3.4 kHz so consonants come through. Pitch 0.75, from 0.7.
- After the third listen (29 October 2026): "Closer, stranger" means "come closer, stranger", and "…, little thief" is La Sombra addressing the player; both are said almost in one breath, but every comma got 0.4 s. A comma now doesn't split the line when there is only one word before it, or just one or two words after it that end the sentence: those words stay in one Piper phrase, and Piper's own comma pause is used (measured: about 0.2 s between "Closer" and "stranger", 0.19 s before "little thief"). Other commas keep 0.4 s. The cache format went to 4.
- The `?debug=voices` lines are test lines written for this panel, not game dialogue (which comes from spec 08's model or its fallbacks): spirits say "Who walks in my house on the night of the dead? Closer, stranger, and tell me why you are here."; La Sombra, which only ever taunts in the game, says "You should not have come here, little thief. The house remembers every one of you."
- After the fourth listen (29 October 2026): Piper's own comma pause, and its silence at both ends of every phrase, stretch with each voice's pace, its natural speed and the client's pitch shift, so pauses differed from spirit to spirit (Doña Esperanza's 0.4 s comma pause came out at 0.83 s, her "Closer, stranger" at 0.32 s). The user named Severo's delivery the best, so it became the standard. Measured as heard, it had 0.86 s after "…the night of the dead?", 0.17 s between "Closer" and "stranger" and 0.40 s before "and tell me why you are here". Now:
  - The short address is split again, with its own brief `address` pause.
  - `joinWavs` trims each phrase's own silence (below about -40 dBFS), keeping 20 ms at each end.
  - Pauses are written × the spirit's pitch (`/api/tts` takes `pitch`), so they sound the same after the pitch shift.
  - `PAUSES` are Severo's values less the kept edges: sentence 0.82, ellipsis 1.05, comma 0.36, address 0.16. The cache format went to 6.
- Measured afterwards with real Piper, as heard (after "dead?", at "Closer, stranger", before "and tell me"): Don Emilio 0.84, 0.15, 0.39; Rafael 0.84, 0.19, 0.41; Doña Esperanza 0.84, 0.18, 0.40; Severo 0.85, 0.15, 0.37; Ernesto 0.84, 0.19, 0.40; Lucía 0.85, 0.19, 0.38; Dr. Pilar 0.83, 0.18, 0.40. La Sombra: 0.16 before "little thief", 0.83 after it. First audio still about 0.8 s uncached.
- After the fifth listen (29 October 2026): splitting at "Closer," made it a whole utterance, which Piper drew out and let fall like the end of a sentence, so 0.17 s of silence still sounded like a full break; and trimming each phrase cut the breath-out that had made Severo's 0.4 s comma pause feel long. Measured silence was the wrong guide. Now:
  - A comma that only sets off a short address is left out of the text Piper reads ("Closer stranger,", "…come here little thief."), so the words run on in one breath.
  - The comma pause is 0.6 s; the sentence pause is unchanged at 0.82 s. The cache format went to 7.
- Measured afterwards with real Piper, as heard: no gap of 40 ms or more between "Closer" and "stranger" for any spirit, or before La Sombra's "little thief"; 0.60 to 0.69 s before "and tell me"; 0.81 to 0.85 s after "dead?".
- The user passed the listening check on 29 October 2026, after six rounds of listening (above).
