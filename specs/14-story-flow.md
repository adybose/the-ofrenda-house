# 14: Story flow and endings
Status: Approved
Depends on: 11, 12

## Goal
The game plays as the story in `docs/story.md`: the door locks behind you, the patriarch chases you, the clock runs to dawn, and the accusation at the ofrenda leads to one of four endings.

## Requirements
- WHEN the game loads THE SYSTEM SHALL show a title screen with the game's name and "Click to enter"; the click unlocks audio (07) and starts the prologue.
- Prologue: THE SYSTEM SHALL show short captions over storm audio (11 pm, 1 November, the car dying, a light on the hill), then put the player at the front door. The door swings open by itself; when the player is inside it slams and the lock turns; E on it plays the locked sound; lightning shows the portrait hall, then darkness, and a prompt teaches F.
- Act 1: THE SYSTEM SHALL script the portrait hall: lightning flashes between which portraits change pose, the bat bursting from the chandelier (13, forced), the empty portrait at the end of the hall and the patriarch standing behind the player. He says "Who are you? How dare you enter my house?" and chases; prompts teach the arrows and Shift; the corridor shifts behind the player (03) into a dead end; he looms, stops and speaks his lines from the story word for word; he vanishes and the grandfather clock strikes midnight. The patriarch cannot catch the player in Act 1. His Act 1 lines are fixed text, not model output.
- Act 2: THE SYSTEM SHALL run an in-game clock from midnight to 6 am over `DAWN_MINUTES` real minutes (default 24), shown as a burning candle in the HUD, with a chime each hour.
- WHEN the clues held are enough for the solver (02) to leave one suspect, or every spirit has been resolved, THE SYSTEM SHALL reveal the dining room (03).
- Ofrenda: THE SYSTEM SHALL lay the table with a candle and portrait for each of the dead. The patriarch appears and says "Tell us who did this." The player looks at a portrait and presses E to place the marigold, then confirms.
- THE SYSTEM SHALL resolve the ending as follows:
  - correct accusation and `toldTheTruth` (10) → **true**: the spirits turn on the Shadow and it burns away; the painter unveils the painting of baby Elena and the player recognises their grandmother; the patriarch opens the front door ("Go home, child. Light a candle for us."); dawn on 2 November.
  - correct accusation only → **escape**: the Shadow is bound and the door opens, but the spirits stay behind.
  - wrong accusation, or `caughtByShadow` → **possessed**: the killer's portrait smiles, vision goes dark, and a new portrait with the player's face hangs in the hall.
  - the clock reaching 6 am → **trapped**: the clock strikes six and the rooms stop moving.
- WHEN an ending finishes THE SYSTEM SHALL offer "Play again (new household)" and "Replay this seed".
- THE SYSTEM SHALL support the debug flags `?skip=act1` (start Act 2 at midnight), `?skip=ofrenda` (dining room with every clue held), `&ending=true|escape|possessed|trapped` and `&clock=HH:MM`.
- Ending resolution, the clock and the reveal condition SHALL be pure functions. No new dependency.

## Interfaces
```ts
resolveEnding(input: { accusedId?; killerId; toldTheTruth: boolean; caught: boolean; dawn: boolean }): 'true' | 'escape' | 'possessed' | 'trapped'
gameClock(elapsedMs: number, dawnMinutes: number): { hour: number; minute: number; dawn: boolean }
shouldRevealOfrenda(caseFile, heldFactIds, resolvedIds): boolean
```

## Out of scope
New mechanics; anything not described in `docs/story.md`.

## Acceptance checks
Must:
- [ ] Unit: `resolveEnding` table test covering every combination.
- [ ] Unit: the clock maps elapsed time to hours correctly and reports dawn at `DAWN_MINUTES`.
- [ ] Unit: the reveal condition for single-suspect clues and for all spirits resolved.
- [ ] Playwright (`?seed=42`, mocks): title, then prologue, the door locks behind the player (screenshot); E on the front door is refused.
- [ ] Playwright: a scripted run of Act 1 with key presses reaches the midnight chime and Act 2.
- [ ] Playwright (`?skip=ofrenda`): a correct, honest accusation shows the true ending; a wrong one shows the possessed ending; screenshots of all four endings via `&ending=`.
- [ ] Playwright (`&clock=05:59`): waiting one minute gives the trapped ending.
Should:
- [ ] Manual: Act 1 takes about 3 minutes and Act 2 15 to 25 minutes on a first play.
- [ ] The title screen shows whether Ollama and Piper were found.

## Test plan
Vitest: ending resolution, clock, reveal condition. Playwright with mock LLM and TTS: prologue, Act 1 scripted run, accusations, ending screenshots, dawn. Manual: full playthroughs on Thursday and Friday evening.

## Open questions
- "Trapped ending (dawn arrives, or you're locked in)": what counts as locked in? Proposal: only dawn, given the dining room is revealed once every spirit is resolved.
- Can the player accuse the patriarch? Proposal: no, his portrait is on the ofrenda but cannot be chosen.
