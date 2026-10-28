# 08: LLM bridge
Status: Approved
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
buildPrompt(caseFile, characterId, step, ctx): ChatMessage[]   // pure, snapshot-tested
validateStep(step, output, ctx): Result<StepOutput, string[]>
```

## Out of scope
Speech (09), the dialogue box and trust maths (10), encounter order (11).

## Acceptance checks
Must:
- [ ] With the mock Ollama in `tests/mocks/`, a valid response returns `source: 'llm'` and passes the schema.
- [ ] Malformed JSON, a schema failure, duplicate answers or a leaked right answer each return a fallback.
- [ ] A timeout returns a fallback within the timeout plus 100 ms; Ollama being down returns a fallback immediately.
- [ ] The killer's reward prompt contains the lie text and the lie instruction; no other prompt contains the instruction, and no prompt contains facts outside the allowed set (snapshot tests).
- [ ] For 200 seeds and every character, the riddle options contain the case file's right answer exactly once.
- [ ] A prefetch followed by a line request is served from the cache without a new Ollama call.
- [ ] Taunts never exceed 12 words.
- [ ] Fallbacks exist for every role, step, trust bucket and riddle theme (test iterates them all).
Should:
- [ ] Manual with real Ollama on the M1 Pro: median greeting latency under 2.5 s, recorded here.
- [ ] A live request queued behind two prefetches is sent first.

## Test plan
Vitest with a fake Ollama Fastify server (scripted replies, delays, garbage): schema and semantic rejection, timeouts, fallbacks, prompt snapshots, cache, queue order. Manual: latency and line quality with the real model.
