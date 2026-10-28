# 15: Release and write-up
Status: Approved
Depends on: 00 to 14

## Goal
Anyone can clone the repo, run one command and play offline, and the DEV post tells the story of how the game was built.

## Requirements
- THE SYSTEM SHALL include a README covering: what the game is, screenshots, offline setup on a Mac (Node, Ollama with `gemma3:4b`, Piper and `npm run setup:voices`), the one-command start, controls, debug flags, how it was built from specs, and troubleshooting. It SHALL say plainly that the game runs without Ollama or Piper, using fallbacks.
- WHEN the player runs `npm start` THE SYSTEM SHALL build the client if needed, start Fastify serving the built game and the API on localhost, print whether Ollama, the model and Piper were found, and print the URL to open.
- THE SYSTEM SHALL make no request outside localhost from the production build.
- THE SYSTEM SHALL include a licence (MIT unless decided otherwise).
- THE SYSTEM SHALL include a GitHub Actions workflow running `npm ci`, `npm run check` and `npm run e2e` with the mocks. The human creates the public GitHub repo, adds the remote and pushes; Claude Code does not push without being asked.
- THE SYSTEM SHALL have a 60 to 120 second demo video showing the prologue, an encounter, a Shadow chase and an ending, linked from the README.
- THE SYSTEM SHALL have a draft DEV post in `docs/post.md` in the DEV challenge template, written from `docs/story.md`, the specs and the git history.
- Every spec SHALL be Done, or have its cut Must checks recorded in the spec.

## Interfaces
npm scripts: `start`, `setup:voices`. Files: `README.md`, `LICENSE`, `.github/workflows/check.yml`, `docs/post.md`.

## Out of scope
New features or content. Only bug fixes found while preparing the release.

## Acceptance checks
Must:
- [ ] From a fresh clone in a new directory, `npm ci` then `npm start` serves a playable game with Ollama switched off.
- [ ] The Playwright offline guard passes against the production build.
- [ ] The README covers setup, start, controls and running without Ollama or Piper.
- [ ] `docs/post.md` exists as a complete draft.
- [ ] Every spec is Done or records its cuts.
Should:
- [ ] The GitHub repo is public with the Actions workflow green on `main`, before the post goes live.
- [ ] The demo video is recorded and linked.
- [ ] A full playthrough on the M1 Pro with real Ollama and Piper, with no errors in the console.

## Test plan
Manual: fresh-clone run, final playthrough, video. Playwright: offline guard on the production build. CI: the workflow run on GitHub.
