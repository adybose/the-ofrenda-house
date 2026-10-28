# The Ofrenda House

A first-person 3D horror mystery for Hacktoberfest 2026. A stranger trapped in a 1931 mansion on the night of 1 November must work out which spirit poisoned the household before dawn. Deadline: Saturday 31 October 2026, 11:59 pm Pacific.

## Sources of truth

- `docs/story.md` is the story bible. If a spec and the story disagree, stop and raise it before coding.
- `docs/build-plan.md` sets the stack, repo layout, build order and testing approach.
- `specs/NN-name.md` is the definition of done for each feature. `specs/_template.md` is the template.

## The constitution

- Everything runs offline on the player's machine: no cloud APIs, no CDN downloads at runtime, no external art or audio files. All visuals and sounds are generated in code.
- The case file owns the facts and the LLM only writes words. Game logic never trusts model output that hasn't been checked against a schema.
- Every LLM or text-to-speech call has a fallback, so the game runs even with Ollama switched off.
- Pure logic (generators, case file, dialogue rules) is seeded and deterministic, and covered by unit tests.
- TypeScript strict mode throughout, small modules, and no new dependency without a line in the spec saying why.
- Performance target: 60 fps on an M1 Pro MacBook Pro with 16 GB, with Ollama running alongside.

## How we work

- No game code without a spec whose status is Approved.
- One spec per local branch, `spec/NN-name`, cut from `main` and merged back once its Must checks pass.
- Start in plan mode: read the spec and the existing code, list the files you will touch, and stay inside the spec's scope. "Out of scope" is binding.
- Write the tests for the Must checks first, then the code.
- For anything visual, run the game in headless Chromium (Playwright) and save screenshots to `artifacts/screenshots/`.
- Only tick an acceptance box when a test or screenshot proves it. Then set the status to Done, run `npm run check`, commit and merge.
- If a spec is wrong, change the spec first, then the code. Record any cut in the spec itself.
- Automated tests never call the real Ollama or Piper; use the mocks in `tests/mocks/`.
- Debug URL flags (for example `?seed=42&skip=act1`) jump to any part of the game for screenshots and manual play.

## Commands (defined by spec 00)

- `npm run dev`: game (Vite) and local server (Fastify) together.
- `npm run check`: lint, type check and unit tests. The gate before every merge.
- `npm run e2e`: Playwright browser tests, screenshots to `artifacts/screenshots/`.

## Layout

`src/` holds the game (`core`, `case`, `world`, `render`, `lighting`, `audio`, `player`, `spirits`, `scares`, `ui`, `story`), `server/` holds the local Fastify server (`llm.ts`, `tts.ts`, `fallbacks/`), and `tests/` holds `unit/`, `e2e/` and `mocks/`. See `docs/build-plan.md` for details.
