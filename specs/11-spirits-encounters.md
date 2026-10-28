# 11: Spirits and encounters
Status: Approved
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
        clueAwarded { factId }, keyAwarded { keyId }, riddleFailed { characterId }
```

## Out of scope
The patriarch's scripted appearances in Act 1 and at the ofrenda (14), the Shadow (12), line wording (08).

## Acceptance checks
Must:
- [ ] Unit: the reducer only allows the steps in order; a second try only when trust is warm; no clue or key on silence; silence emits `riddleFailed`.
- [ ] Property test over 1,000 seeds: of all clue cards a player could collect, exactly one is a lie, it comes from the killer, and it contradicts a true card from another spirit.
- [ ] Playwright (`?seed=42&skip=act1&debug=encounter`, mock LLM): a whole encounter played with keys only, with screenshots of appear, who are you, riddle and reward; the clue is in the journal afterwards.
- [ ] Playwright: a spirit screenshot shows the background through it.
Should:
- [ ] The prefetch request is sent before the player enters the room (network log).
- [ ] A spirit flinches or brightens when the flashlight beam is on it.

## Test plan
Vitest: encounter reducer, clue-card lie property test. Playwright with the mock LLM and TTS off: full encounter, translucency screenshot, prefetch timing.
