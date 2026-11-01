# 15: Release and write-up
Status: Done
Depends on: 00 to 14, 16 to 22

## Goal
Anyone can clone the repo onto a Mac, run one command and play offline on localhost (it is never deployed), and the DEV post tells the story of how the game was built.

## Requirements
- THE SYSTEM SHALL include a README covering: what the game is, screenshots, offline setup on a Mac (Node, Ollama with `gemma3:4b`, Piper and `npm run setup:voices`), the one-command start, controls, debug flags, how it was built from specs, and troubleshooting. It SHALL say plainly that the game runs without Ollama or Piper, using fallbacks.
- WHEN the player runs `npm start` THE SYSTEM SHALL build the game, serve it with Vite's preview on localhost:4173 (which proxies `/api` to the local Fastify server), start that server on 127.0.0.1, print whether Ollama, the model, Piper and the voices were found (with the command to fix each), and print the URL to open.
- THE SYSTEM SHALL make no request outside localhost from the production build.
- THE SYSTEM SHALL include a licence (MIT unless decided otherwise).
- THE SYSTEM SHALL include a GitHub Actions workflow running `npm ci`, `npm run check` and `npm run e2e` with the mocks (it checks the code; nothing is deployed). The human creates the public GitHub repo, adds the remote and pushes; Claude Code does not push without being asked.
- THE SYSTEM SHALL have a 60 to 120 second demo video showing the prologue, an encounter, a match and a candle in the dark, a Shadow chase and an ending, linked from the README.
- THE SYSTEM SHALL have a draft DEV post in `docs/post.md` in the DEV challenge template, written from `docs/story.md`, the specs and the git history.
- Every spec SHALL be Done, or have its cut Must checks recorded in the spec.

## Interfaces
npm scripts: `start`, `setup:voices`. Files: `README.md`, `LICENSE`, `.github/workflows/check.yml`, `docs/post.md`.

## Out of scope
New features or content. Only bug fixes found while preparing the release.

## Acceptance checks
Must:
- [x] From a fresh clone in a new directory, `npm ci` then `npm start` serves a playable game with Ollama switched off.
- [x] The Playwright offline guard passes against the production build.
- [x] The README covers setup, start, controls and running without Ollama or Piper.
- [x] `docs/post.md` exists as a complete draft.
- [x] Every spec is Done or records its cuts.
Should:
- [ ] The GitHub repo is public with the Actions workflow green on `main`, before the post goes live.
- [ ] The demo video is recorded and linked.
- [ ] A full playthrough on the M1 Pro with real Ollama and Piper, with no errors in the console.

## Test plan
Manual: fresh-clone run, final playthrough, video. Playwright: offline guard on the production build. CI: the workflow run on GitHub.

## Decisions
- 1 November 2026 (IST): the user wants the game played only locally on a Mac, never deployed. `npm start` reuses Vite's preview of the built game (which already proxies `/api`) and the local Fastify server, rather than having Fastify serve files: no new code path to test, no new dependency.
- The voice models are not in the repo (241 MB, gitignored): `npm run setup:voices` creates `voices/` and downloads them once at setup. The game itself makes no request outside localhost.
- The screenshots in `docs/screenshots/` were chosen by the user.
- Proof: a fresh clone in a new directory (no `voices/`), `npm ci`, then the `npm start` commands with Ollama pointed at a dead port: the game served on localhost, `/api/health` answered `{"ok":true,"ollama":false,"piper":false}` through the proxy, and the status block said "missing Ollama" and "missing Piper voice models (voices/)" with the command for each. (The user's own `npm start` held port 4173, so the clone's preview ran on 4174.) The full Playwright suite, 94 tests including the offline guard in `tests/e2e/offline.spec.ts`, passed against the production build; `npm run check` passed with 331 unit tests. Every other spec is Done with its Must checks ticked.
- Left to the user (Should): the demo video and its links in `README.md` and `docs/post.md` (marked TODO, with the challenge name), the Actions run on GitHub, and a full playthrough with real Ollama and Piper.
