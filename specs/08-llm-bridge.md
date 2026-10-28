# 08: LLM bridge
Status: Done
Depends on: 00, 02

## Goal
Every spirit speaks fresh, in-character lines from a local Gemma model, while the case file stays in charge of every fact and the game never waits on, or breaks because of, the model.

## Requirements
- WHEN the client posts to `/api/spirit/line` with `{ seed, characterId, step, trust, lastChoiceText? }` THE SYSTEM SHALL rebuild the case file from the seed with the shared `src/case` code and build the prompt server-side. The client never sends facts.
- THE SYSTEM SHALL build each prompt from one shared system prompt (1931, stay in character, never mention being an AI, short lines), the spirit's persona card (name, role, personality, mood, speech style, period details), the trust level, the player's last choice, and only the facts allowed for this step.
- Steps are `greeting`, `whoAreYou` (the spirit's question only; reply options are code-owned in spec 10), `reaction`, `riddle`, `reward` and `silence`.
- WHEN the step is `riddle` THE SYSTEM SHALL ask the model for the riddle text and 3 wrong answers only; the right answer comes from the case file, and the 4 options are shuffled with a seeded stream.
- WHEN the step is `reward` THE SYSTEM SHALL include the clue fact's text from the case file; for the killer that text is the lie, with one extra instruction to state it convincingly. No other spirit's prompt contains that instruction.
- THE SYSTEM SHALL call Ollama's `/api/chat` at `OLLAMA_HOST` (default `http://127.0.0.1:11434`) with model `OLLAMA_MODEL` (default `gemma3:4b`), non-streaming, with `format` set to the step's JSON schema and a token cap.
- THE SYSTEM SHALL validate every response against the same JSON schema, then check it semantically: length limits; 3 wrong answers that are distinct from each other and from the right answer (case- and space-insensitive); the right answer not appearing in the riddle text; no names of other characters unless they appear in the allowed facts; no out-of-character words such as "AI" or "language model".
- WHEN Ollama is unreachable, times out (about 4 s for a live request) or fails validation THE SYSTEM SHALL retry once if time allows, then return a hand-written fallback from `server/fallbacks/<role>.ts`, marked `source: 'fallback'`.
- WHEN the client posts to `/api/spirit/prefetch` with `{ seed, characterIds, trust }` THE SYSTEM SHALL generate those spirits' greeting and riddle in the background into an in-memory cache keyed by seed, character, step and trust bucket.
- THE SYSTEM SHALL send one request at a time to Ollama, with live requests ahead of prefetches.
- WHEN the client posts to `/api/shadow/taunt` with `{ seed, context: 'chase' | 'whisper' }` THE SYSTEM SHALL return a validated taunt of at most 12 words, or a fallback.
- THE SYSTEM SHALL report `ollama: true` in `/api/health` only when the model is listed by Ollama's `/api/tags`.
- The client shows text only after validation. The typewriter effect in spec 10 plays the validated line, which is how `docs/story.md`'s "streams in" is met.
- Fallbacks SHALL cover every role and step: greetings for each trust bucket, who-are-you questions, reactions for honest, evasive and lie replies, a riddle with 3 wrong answers for every riddle theme, reward and silence lines, and at least 20 Shadow taunts.
- Dependency: `ajv`, to validate model output against the exact JSON schema passed to Ollama's `format`, so one schema serves both. Ollama is called with plain `fetch`, no SDK.

## Interfaces
```ts
POST /api/spirit/line -> { source: 'llm' | 'fallback'; line: string; riddle?: { question: string; options: string[]; correctIndex: number } }
POST /api/spirit/prefetch -> 202
POST /api/shadow/taunt -> { source; line }
buildPrompt(caseFile, characterId, step, ctx): ChatMessage[]   // pure, snapshot-tested (server/llm/prompts.ts)
validateStep(step, output, ctx): Result<StepOutput, string[]>  // server/llm/validate.ts
// request: { seed, characterId, step, trust, lastChoiceText?, lastChoiceCategory?: 'honest' | 'evasive' | 'lie' }
buildServer({ ollama?: { host, model, liveTimeoutMs, prefetchTimeoutMs } }); server.llm.idle()
trustBucket(trust): 'wary' | 'neutral' | 'warm'                 // src/dialogue/trust.ts, shared with spec 10
```

## Out of scope
Speech (09), the dialogue box and trust maths (10), encounter order (11).

## Acceptance checks
Must:
- [x] With the mock Ollama in `tests/mocks/`, a valid response returns `source: 'llm'` and passes the schema.
- [x] Malformed JSON, a schema failure, duplicate answers or a leaked right answer each return a fallback.
- [x] A timeout returns a fallback within the timeout plus 100 ms; Ollama being down returns a fallback immediately.
- [x] The killer's reward prompt contains the lie text and the lie instruction; no other prompt contains the instruction, and no prompt contains facts outside the allowed set (snapshot tests).
- [x] For 200 seeds and every character, the riddle options contain the case file's right answer exactly once.
- [x] A prefetch followed by a line request is served from the cache without a new Ollama call.
- [x] Taunts never exceed 12 words.
- [x] Fallbacks exist for every role, step, trust bucket and riddle theme (test iterates them all).
Should:
- [x] Manual with real Ollama on the M1 Pro: median greeting latency under 2.5 s, recorded here.
- [x] A live request queued behind two prefetches is sent first.

## Test plan
Vitest with a fake Ollama Fastify server (scripted replies, delays, garbage): schema and semantic rejection, timeouts, fallbacks, prompt snapshots, cache, queue order. Manual: latency and line quality with the real model.

### Latency record
29 October 2026, Apple M1 Pro 16 GB, Ollama with `gemma3:4b-it-qat`, model already loaded: 12 greetings over seeds 42, 7 and 99 at all three trust levels. Median 1.40 s, maximum 6.8 s (a single outlier; with the default 4 s budget it would have fallen back), no fallbacks. A riddle took 2.2 s, other steps 1.2 to 1.5 s.

Sample lines: "The rain… it smells of damp canvas. Observe your boots. Don't track mud." (the painter, greeting); "Well now, mi estimado. A rather sudden arrival on this dreadful night. Tell me, who are you, and from whence do you hail?" (the doctor, who are you); Shadow: "Enjoy the chill, little spark. It's permanent now." The riddle for "A paintbrush" read "I capture likenesses, frozen in time…" with options photograph, mirror and songbird's feather.

## Decisions
- Model: `OLLAMA_MODEL` if set; otherwise the first installed of `gemma3:4b` and `gemma3:4b-it-qat` (the 4B model in either form). This Mac has the QAT build, so no download was needed.
- Requests may carry `lastChoiceCategory` (honest, evasive, lie: spec 10's reply kinds), so the reaction step and its fallback know what the spirit senses.
- Trust buckets live in `src/dialogue/trust.ts` (wary below 35, warm from 70) for spec 10 to share.
- Only the reward step carries facts: the facts the spirit holds (the killer's is the lie, plus the lie instruction). Before that, prompts carry the persona and no facts at all.
- A live request interrupts a prefetch already running with Ollama (the prefetch goes back to the front of the prefetch queue), so the player never waits behind background work.
- Model output has Markdown emphasis stripped before validation (Gemma wraps Spanish words in asterisks).
- Watch in spec 11: the killer's reward line can drift from the lie's meaning (one sample: "He was the only one. A singular focus."). The clue card shows the case file's text, so the mystery is unaffected; spec 11 may want the voiced reward line to quote the card.
- The spec 00 health test now points the server at an unused port, so it passes whether or not Ollama runs on the machine.
