# The Ofrenda House: spec-driven build plan

We build the game from small specs, each with its own acceptance checks, so Claude Code always works against a written definition of done and we can stop cleanly at any point before the deadline (Saturday 31 October 2026, 11:59 pm Pacific).

## How it works

Every feature starts as a short spec in `specs/`, and only then becomes code. Claude Code reads the spec, proposes a plan, implements it, and isn't done until every acceptance check in the spec passes. Each spec is one local git branch (`spec/NN-name`) that's merged into `main` once its checks pass. Everything runs in the terminal on the Mac; GitHub comes later.

The loop for each spec:

1. **Write the spec.** Draft `specs/NN-name.md` from `docs/story.md` and the template below; the human approves or edits it.
2. **Plan.** In plan mode, read the spec and the existing code and list the files that will be touched. Stay in scope.
3. **Build against the checks.** Write the tests named in the acceptance checks first, then the code, until they pass.
4. **Look at it.** For anything visual, run the game in headless Chromium (Playwright) and save screenshots to `artifacts/screenshots/`.
5. **Close the loop.** Tick each acceptance box in the spec, set its status to Done, run `npm run check`, then commit and merge the branch into `main`.

### The constitution (goes into CLAUDE.md)

- Everything runs offline on the player's machine: no cloud APIs, no CDN downloads at runtime, no external art or audio files. All visuals and sounds are generated in code.
- The case file owns the facts and the LLM only writes words. Game logic never trusts model output that hasn't been checked against a schema.
- Every LLM or text-to-speech call has a fallback, so the game runs even with Ollama switched off.
- Pure logic (generators, case file, dialogue rules) is seeded and deterministic, and covered by unit tests.
- TypeScript strict mode throughout, small modules, and no new dependency without a line in the spec saying why.
- Performance target: 60 fps on an M1 Pro MacBook Pro with 16 GB, with Ollama running alongside.

## Stack and repo layout

| Layer | Choice | Why |
| --- | --- | --- |
| Game | TypeScript, Vite, three.js | A real 3D first-person view with shadow-casting lights, running in any modern browser |
| Audio | Web Audio API (positional audio, convolution reverb) | Rain, thunder, creaks and echoes are all synthesised, with no sound files |
| Local server | Node with Fastify | Serves the game, talks to Ollama, runs text-to-speech, and checks every model response |
| Language model | Ollama running Gemma 3 4B (`gemma3:4b`, about 3 GB) | Open weights, runs on a laptop, returns JSON output |
| Voices | Piper text-to-speech, run by the local server | Fast on a CPU, open source, a voice per spirit |
| Tests | Vitest for logic, Playwright for the browser | Deterministic unit tests, plus screenshots of the real game |

```text
the-ofrenda-house/
  CLAUDE.md              the constitution
  specs/                 one file per spec, 00 to 22
    _template.md
  docs/
    story.md             story bible
    build-plan.md        this file
  src/
    core/                seeded RNG, game state, events
    case/                household, secrets, killer, clues
    world/               endless house generator, chunks
    render/              geometry, procedural textures, portraits
    lighting/            flashlight, lightning, fog
    audio/               synths, spatial sound, reverb
    player/              movement, collision, interaction
    items/               candles, matches, keys (spec 18)
    spirits/             ghosts, encounters, the Shadow
    scares/              bats, rats, cats, triggers
    ui/                  dialogue box, choices, journal, HUD
    story/               prologue, chase, encounters, monologue, dawn, endings
  server/
    llm.ts               Ollama client, prompts, schemas
    tts.ts               Piper wrapper
    fallbacks/           hand-written lines per role
  tests/
    unit/  e2e/  mocks/  mock Ollama for deterministic tests
```

## Setup on the Mac

The M1 Pro with 16 GB runs everything comfortably. Gemma 3 4B uses about 3 GB and runs on the Apple GPU through Metal. A 12B model would compete with the game for memory and GPU time, so stay at 4B and only drop to `gemma3:1b` if dialogue feels slow.

```bash
brew install node git ollama
ollama serve                              # or open the Ollama app
ollama pull gemma3:4b
python3 -m pip install --user piper-tts   # local voices, used by spec 09
npm run setup:voices                      # fetches the four Piper voice models into voices/, once
```

Three terminal tabs: Ollama, `npm run dev` (game and local server, from spec 00 onward), and Claude Code.

**GitHub later.** Until the repo exists, everything lives in local git and `npm run check` (lint, type check, tests) is the gate before every merge. When the repo is created: `git remote add origin <url>` and `git push -u origin main`, then add a GitHub Actions workflow running the same check. It must be public before Saturday's post.

## The specs

There are 23 specs (00 to 22), and every one is needed for the full game. Inside each spec, the checks are split into Must and Should, so if time runs short we can ship once the Must checks pass.

| # | Spec | Depends on | Key acceptance checks |
| --- | --- | --- | --- |
| 00 | Scaffold and constitution | None | `npm run dev` serves a black canvas; `npm run check` runs lint, type check and tests; `CLAUDE.md` holds the rules |
| 01 | Seeded randomness | 00 | The same seed gives the same sequence; generators can split off independent streams |
| 02 | Case file generator | 01 | Builds 7 to 8 characters with 3 or 4 secrets and one killer; the killer always has a secret; every red herring has a clue that clears them; a solver test proves all 1,000 test seeds can be solved |
| 03 | Endless house generator | 01, 02 | Builds chunks around the player and unloads them behind; places the 6 key rooms within reach; reshuffles unseen corridors on a lightning event; the front door stays sealed until the case is solved |
| 04 | Rendering and procedural materials | 03 | Walls, floors, wallpaper, doors and windows are drawn from canvas textures; portraits are generated from each character's traits; holds 60 fps on the M1 Pro |
| 05 | Player controller | 04 | Arrow keys move and turn, Shift runs, the mouse looks; no walking through walls; E interacts with the nearest door, object or spirit |
| 06 | Lighting and darkness | 04, 05 | The flashlight is a focused spotlight casting real-time shadows, with flicker and a draining battery; lightning flashes through the windows with shadows; fog and near-black ambient light |
| 07 | Audio engine | 05, 06 | Synthesised rain, wind, thunder delayed after each flash, door creaks, keys locking and unlocking, footsteps, heartbeat and stingers; sounds placed in 3D, with reverb by room size |
| 08 | LLM bridge | 00, 02 | The server prompts Ollama with persona plus facts; responses are checked against a JSON schema; falls back to hand-written lines on a timeout or bad output; prefetches the next room's lines |
| 09 | Spirit voices | 07, 08 | Piper speaks each line with a voice per spirit, pitched and echoed; text appears even if text-to-speech is missing |
| 10 | Dialogue and journal UI | 08 | Typewriter text with 3 or 4 choices picked by click or keys 1 to 4; trust is tracked; J opens the clue journal |
| 11 | Spirits and encounters | 06, 10 | Translucent ghosts with a noise shader; the encounter steps run in order (appear, who are you, riddle, reward or silence); the killer's friendly form tells exactly one lie |
| 12 | The Shadow and hazards | 03, 06, 11, 17, 18 | Pathfinds to the player and grows bolder after failed riddles; threatens a player in light and chases one in the dark; never enters a lit sanctuary; falling chandelier, slamming door and lights dying; being caught triggers the possessed ending |
| 13 | Jump scares | 06, 07 | Bats, rats and cats are low-poly meshes animated in code; placed triggers fire with a sound stinger; a cooldown stops scares piling up |
| 14 | Story flow and endings | 11, 12, 13, 18, 20, 21 | Prologue door lock; Act 1 chase with the patriarch; the clock to dawn; true, escape, possessed and trapped endings |
| 15 | Release and write-up | All | README with offline setup; one-command start; demo video; DEV post draft in `docs/post.md` |
| 16 | Exterior and arrival | 04, 05, 06, 07 | The storm outside, the walk up to the door, the door opening and slamming |
| 17 | Torch battery | 06 | Starts at 60–70%, dims and flickers as it fades, cuts out when critical, never charges above 10% |
| 18 | Candles, matches and keys | 03, 05, 06, 10, 11, 17 | Unlit candles under each portrait; a candle and matchbox at the Act 1 dead end; finite matches; candles burn out; a solved spirit's candle lights itself; keys laid beside it |
| 19 | Spirit presence | 11 | A halo visible in the dark; floating; coming and going through walls |
| 20 | Inner monologue | 10, 17, 18 | Hand-written thoughts on screen as hints, once each, queued, never during encounters |
| 21 | Naming the killer | 02, 07, 08, 11, 18, 19 | With enough clues, solved spirits ask who did it, laugh, and leave the exit key or another room's key; the dining room finale |
| 22 | Dawn | 03, 14, 21 | The patriarch's last question at dawn; the walls stop and petals lead back to the front door, or the player is trapped |

## Build order

| Day | Theme | Specs |
| --- | --- | --- |
| Wed 28 | Specs and scaffold | Draft all 16 specs, 00, 01 |
| Thu 29 | The world | 02 (parallel session), 03, 04, 05, 06, 07 |
| Fri 30 | The haunting | 08 (parallel session), 09, 10, 11; then, after the design update on Thu 29 (specs 17 to 22): 17, 18, 19, 12, 21, 20 |
| Sat 31 | Ship it | 13, 14, 22, then bug fixes, 15, demo video, DEV post, submit by 11:59 pm Pacific. If time runs short, cut first: 13's Should checks, 20's follow-up hints, 22's petal trail (a thought instead) |

Specs 02 and 08 are pure logic with no 3D code, so they can run in a second Claude Code session in its own git worktree while the main session builds the world.

## Spec template

```markdown
# NN: <name>
Status: Draft | Approved | In progress | Done
Depends on: <spec numbers>

## Goal
One or two sentences on what the player gets from this.

## Requirements
- WHEN <event> THE SYSTEM SHALL <behaviour>
- ...

## Interfaces
Types, functions or events other specs rely on.

## Out of scope
What this spec must not touch.

## Acceptance checks
Must:
- [ ] <check that a test or screenshot can prove>
Should:
- [ ] <check>

## Test plan
Which unit tests, mocks and screenshots prove the checks.
```

## Worked example: spec 02

```markdown
# 02: Case file generator
Status: Draft
Depends on: 01

## Goal
Each run gets a new household and a new killer, and the mystery can
always be solved from the clues the spirits hold.

## Requirements
- WHEN a run starts THE SYSTEM SHALL draw 7 to 8 characters from the role
  pool (patriarch, painter and matriarch are always present) and give each
  a name, personality, room and riddle theme.
- THE SYSTEM SHALL give 3 or 4 characters a hidden secret from the secret
  pool, never to the patriarch.
- THE SYSTEM SHALL pick the killer from the characters with a secret, and
  record motive, means (the poison) and opportunity.
- THE SYSTEM SHALL spread clues so that: each victim spirit holds 1 or 2
  true facts; every red herring is cleared by at least one fact; the killer
  is the only suspect left once all facts are known.
- THE SYSTEM SHALL mark one fact the killer's friendly form will state
  falsely, and that lie must contradict a true fact held by another spirit.

## Interfaces
generateCase(seed): CaseFile, with characters[], secrets[], killerId,
facts[] { id, holderId, kind: motive | means | opportunity | alibi, text, isLie }

## Out of scope
Wording of lines (spec 08), room placement (spec 03).

## Acceptance checks
Must:
- [ ] The same seed always gives the same case file.
- [ ] A brute-force solver finds exactly one consistent killer for all
      1,000 test seeds.
- [ ] The patriarch is never the killer, and the killer always has a secret.
Should:
- [ ] Each secret type appears as the killer's motive at least once in
      1,000 seeds.

## Test plan
Vitest: determinism test, solver property test over 1,000 seeds,
role and secret constraint tests.
```

## Testing

| Kind | Tool | Covers | Runs |
| --- | --- | --- | --- |
| Unit and property tests | Vitest | Seeded RNG, case file solver, house generator rules, dialogue schema checks, trust maths | Before every merge, via `npm run check` |
| Mocked LLM tests | Vitest plus a fake Ollama server in `tests/mocks/` | Prompt building, schema rejection, timeouts, fallbacks, prefetch | Before every merge, via `npm run check` |
| Browser tests | Playwright in headless Chromium | The game boots, the controls move the camera, the flashlight casts a shadow, a dialogue choice by key 2 works, endings trigger | Before each merge, screenshots saved to `artifacts/screenshots/` |
| Manual play | The human, with real Ollama and Piper | Scare timing, voice quality, whether the riddles are fun | Thursday and Friday evenings |

Automated tests never need the real model. A debug URL flag (`?seed=42&skip=act1`) jumps straight to any part of the game for screenshots and manual play.

## Prompts to run in Claude Code

1. **Kick-off (once):** "Read `docs/story.md` and `docs/build-plan.md`. This directory is the project root. Run `git init` if needed. Create `CLAUDE.md` with the constitution from the build plan, `specs/_template.md`, and draft specs 00 to 15 as files with status Draft. Don't write any game code yet."
2. **Approve:** read the drafts, edit anything you disagree with, and set them to Approved.
3. **Per spec:** "Implement `specs/NN-name.md`. Start in plan mode and list the files you'll touch. Write the tests for the Must checks first, then the code. Run the tests, and for visual specs take Playwright screenshots. Work on a branch called spec/NN-name. Tick the checks you've proved, set the status to Done, run npm run check, then commit and merge into main."
4. **Logic in parallel:** run specs 02 and 08 in a second Claude Code session in its own git worktree.
5. **When something breaks:** "Spec NN check 3 fails in the browser. Reproduce it with a Playwright test first, then fix it without changing the spec." If the spec itself is wrong, change the spec first, then the code.
6. **Freeze (Friday night):** "List every unticked Must check across all specs." Fix or cut; record cuts in the spec.
7. **Write-up (Saturday):** "Using `docs/story.md`, the specs and the git history, draft `docs/post.md` in the DEV challenge template."
