# 00: Scaffold and constitution
Status: Done
Depends on: none

## Goal
A working skeleton: one command serves a black full-window canvas from a local server, and one command runs lint, type check and tests, so every later spec has somewhere to land and a gate to pass.

## Requirements
- WHEN the developer runs `npm run dev` THE SYSTEM SHALL start the Vite dev server for the game and the Fastify server together, with Vite proxying `/api/*` to Fastify, and serve a page with a full-window black three.js canvas.
- WHEN the window is resized THE SYSTEM SHALL resize the canvas and update the camera aspect without stretching.
- THE SYSTEM SHALL expose `GET /api/health` returning `{ ok: true, ollama: boolean, piper: boolean }` (both flags stay `false` until specs 08 and 09 fill them in).
- WHEN the developer runs `npm run check` THE SYSTEM SHALL run ESLint, `tsc --noEmit` over `src/`, `server/` and `tests/`, and Vitest, and exit non-zero if any of them fails.
- WHEN the developer runs `npm run e2e` THE SYSTEM SHALL run Playwright in headless Chromium against a production build and save screenshots to `artifacts/screenshots/`.
- THE SYSTEM SHALL compile with TypeScript `strict: true` and `noUncheckedIndexedAccess: true`.
- THE SYSTEM SHALL load nothing from outside localhost at runtime: no CDN scripts, web fonts or remote assets.
- THE SYSTEM SHALL provide a typed event bus in `src/core/events.ts` that later specs extend with their own events.
- THE SYSTEM SHALL ignore `node_modules/`, `dist/`, `artifacts/`, `.cache/`, `voices/` and `.DS_Store` in git.
- `CLAUDE.md` SHALL hold the constitution from `docs/build-plan.md`.

Dependencies and why:
- `three`: the 3D renderer named in the stack.
- `fastify`: the local server named in the stack.
- Dev: `typescript`, `vite`, `vitest`, `@playwright/test` (the stack's build and test tools); `eslint` and `typescript-eslint` (lint step of `npm run check`); `@types/three`, `@types/node` (types); `tsx` (runs the TypeScript server without a build step); `concurrently` (runs Vite and Fastify from one `npm run dev`).

## Interfaces
- `src/main.ts`: boot entry, creates the renderer, scene and camera.
- `src/core/events.ts`: `createEventBus<M>()` returning `{ on, off, emit }`; a `GameEvents` interface that later specs extend by declaration merging.
- `server/index.ts`: `buildServer(): FastifyInstance`, exported so tests can call `inject()` without opening a port; `server/main.ts` starts it on `127.0.0.1`.
- npm scripts: `dev`, `build`, `preview`, `lint`, `typecheck`, `test`, `e2e`, `check`.
- `tests/e2e/fixtures.ts`: a Playwright fixture that fails a test if the page requests anything outside localhost. Every later e2e test uses it.

## Out of scope
Any game content; rendering beyond a cleared canvas; seeded randomness (01); LLM (08) and TTS (09) logic; GitHub remote and CI (15).

## Acceptance checks
Must:
- [x] `npm run dev` serves a page on localhost showing a full-window black canvas with no console errors.
- [x] `npm run check` runs lint, type check and unit tests, and fails when any one of them fails.
- [x] `GET /api/health` returns 200 with `ok: true` (Vitest via `buildServer().inject`).
- [x] Playwright boot test: the canvas fills the viewport; screenshot saved to `artifacts/screenshots/00-boot.png`.
- [x] Playwright offline guard: every request the page makes goes to localhost.
- [x] `CLAUDE.md` contains the six constitution rules.
Should:
- [x] The event bus has unit tests for `on`, `off` and `emit`, and a type test showing a wrong payload fails to compile.
- [x] `npm run check` finishes in under 30 seconds on the M1 Pro.

## Test plan
Vitest: event bus, health route via `inject`. Playwright: boot screenshot and the offline request guard fixture.
