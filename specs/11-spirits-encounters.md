# 11: Spirits and encounters
Status: Done
Depends on: 06, 10

## Goal
In each key room a translucent spirit appears, asks who you are, sets a riddle and either gives you a clue card or falls silent, and one of them is the killer telling exactly one lie.

## Requirements
- THE SYSTEM SHALL draw each spirit as a low-poly figure shaped and tinted from its character's traits, with a translucent shader driven by animated 3D noise, a slow float, flicker, and fade in and out. The killer's friendly form looks no different from the others.
- WHEN the player enters a key room whose spirit is unresolved THE SYSTEM SHALL fade the spirit in, play a whisper, disable controls, turn the camera to face it and start the encounter.
- THE SYSTEM SHALL run the encounter steps strictly in order: appear (greeting line) → who are you (choice, trust change, reaction line) → riddle (4 options) → reward or silence.
- WHEN the riddle is answered wrongly and the spirit's trust is warm THE SYSTEM SHALL allow one second try with the wrong option removed; otherwise the encounter goes to silence.
- WHEN the riddle is answered correctly THE SYSTEM SHALL give the spirit's clue card (the case file fact's text, never model text) and the key it holds, if any, then the spirit fades in peace and a candle is left burning in its room.
- WHEN the encounter ends in silence THE SYSTEM SHALL fade the spirit without its clue and emit `riddleFailed`, which raises the Shadow's threat (spec 12).
- THE SYSTEM SHALL run each spirit's encounter once per run.
- WHEN the player comes within 2 rooms of an unresolved key room THE SYSTEM SHALL prefetch that spirit's dialogue and speech (specs 08 and 09).
- WHILE an encounter is active THE SYSTEM SHALL emit `encounterActive` so the Shadow and scares hold off.
- The encounter state machine SHALL be a pure reducer, unit-tested without rendering. No new dependency.

## Interfaces
```ts
encounterReducer(state: EncounterState, event: EncounterEvent): EncounterState
createSpirit(character: Character, rng: Rng): THREE.Object3D
events: encounterStarted { characterId }, encounterEnded { characterId, outcome: 'reward' | 'silence' },
        clueAwarded { factId }, keyAwarded { keyId }, riddleFailed { characterId },
        encounterActive { active }
```

## Out of scope
The patriarch's scripted appearances in Act 1 and at the ofrenda (14), the Shadow (12), line wording (08).

## Acceptance checks
Must:
- [x] Unit: the reducer only allows the steps in order; a second try only when trust is warm; no clue or key on silence; silence emits `riddleFailed`.
- [x] Property test over 1,000 seeds: of all clue cards a player could collect, exactly one is a lie, it comes from the killer, and it contradicts a true card from another spirit.
- [x] Playwright (`?seed=42&skip=act1&debug=encounter`, mock LLM): a whole encounter played with keys only, with screenshots of appear, who are you, riddle and reward; the clue is in the journal afterwards.
- [x] Playwright: a spirit screenshot shows the background through it.
Should:
- [x] The prefetch request is sent before the player enters the room (network log).
- [x] A spirit flinches or brightens when the flashlight beam is on it.

## Test plan
Vitest: encounter reducer, clue-card lie property test. Playwright with the mock LLM and TTS off: full encounter, translucency screenshot, prefetch timing.

## Decisions
- The reducer (`src/story/encounter.ts`) owns the steps and what each emits; the controller (`src/story/encounters.ts`) only shows lines, takes choices and feeds the reducer its events. A wrong answer with warm trust stays at the riddle once, with that option removed and the line "Think again." (the wording of other lines is spec 08's).
- The fallback lines and `riddleFor` moved from the server's bridge into `src/dialogue/fallback-lines.ts`, which the bridge and the client share: if the local server isn't running at all, the client still plays every step from the same hand-written lines.
- The client checks every line it gets: a riddle needs 4 options with the case file's answer exactly once at `correctIndex`, or the step falls back.
- The spirit appears about 2.8 m in front of the player, floating a hand's width above the floor, as they come in, towards the middle of its room (at the room's centre it looked small and far off). Its clue cards are its case-file facts (one or more; the killer's include the lie), and its keys are those of the locked rooms it holds (spec 03's lock plan).
- `encounterActive { active }` is emitted when an encounter starts and ends, for the Shadow and the scares (specs 12 and 13).
- Debug: `?debug=encounter` installs `window.__encounter` (go to a key room, the step, show or hide the spirit); `?debug=spirits` shows every spirit of the seed in a row.
- In the dialogue box (spec 10's), four short options now sit in two columns and the box sits lower, so it doesn't hide the spirit; the spirit floats a little above the floor for the same reason.
- Translucency is measured by drawing the spirit alone on black and on white: an opaque figure would look the same on both. Seed 42's spirit region averages 67 on black and 246 on white, out of 255. In the room screenshot (`artifacts/screenshots/11-spirit-translucent.png`) the floorboards show through it.
- The spec 06 flashlight test now hides the HUD overlays (the journal button and battery bar sit in its corner regions) while it measures the lit scene.
- Checked once against the real local server with Ollama (29 October 2026): the model wrote the lines, its riddle passed the client's check, and the reward gave the spirit's two clue cards and its key.
