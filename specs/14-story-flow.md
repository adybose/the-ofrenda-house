# 14: Story flow and endings
Status: Approved
Depends on: 11, 12, 13, 18, 20, 21

## Goal
The game plays as the story in `docs/story.md`: the door locks behind you, the patriarch chases you, the clock runs to dawn, and naming the killer (21, 22) or being caught by La Sombra (12) leads to one of four endings.

## Requirements
- WHEN the game loads THE SYSTEM SHALL show a title screen with the game's name and "Click to enter"; the click unlocks audio (07) and starts the prologue.
- Prologue (the exterior, the walk up the path and the door opening and slamming are done by spec 16; this spec adds the title and captions around them): THE SYSTEM SHALL show short captions over storm audio (11 pm, 1 November, the car dying, a light on the hill), then put the player at the front door. The door swings open by itself; when the player is inside it slams and the lock turns; E on it plays the locked sound; lightning shows the portrait hall, then darkness, and a prompt teaches F.
- Act 1: THE SYSTEM SHALL script the portrait hall: lightning flashes between which portraits change pose, the bat bursting from the chandelier (13, forced), the empty portrait at the end of the hall and the patriarch standing behind the player. He says "Who are you? How dare you enter my house?" and chases; prompts teach the arrows and Shift; the corridor shifts behind the player (03) into a dead end; he looms, stops and speaks his lines from the story word for word; he vanishes and the grandfather clock strikes midnight; the thought "There must be a candle somewhere here." (20) points the player to the candle and matchbox in the dead end (18). The patriarch cannot catch the player in Act 1. His Act 1 lines are fixed text, not model output.
- Act 2: THE SYSTEM SHALL run an in-game clock from midnight to 6 am over `DAWN_MINUTES` real minutes (default 24), shown as a burning candle in the HUD, with a chime each hour.
- THE SYSTEM SHALL resolve the ending as follows:
  - the killer named (to a spirit, then out through the dining room, 21; or to the patriarch at dawn, then out through the front door, 22) and `toldTheTruth` (10) → **true**: the spirits turn on the Shadow and it burns away; the painter unveils the painting of baby Elena and the player recognises their grandmother; the patriarch lets the player go ("Go home, child. Light a candle for us."); dawn on 2 November.
  - the killer named only → **escape**: the Shadow is bound and the player walks free, but the spirits stay behind.
  - `caughtByShadow` → **possessed**: "You lost. You were possessed by the spirit of La Sombra." Vision goes dark, and a new portrait with the player's face hangs in the hall.
  - the wrong name at dawn (22) → **trapped**: the rooms stop moving with the player inside, and a new portrait with their face hangs in the hall.
- WHEN an ending finishes THE SYSTEM SHALL offer "Play again (new household)" and "Replay this seed".
- THE SYSTEM SHALL support the debug flags `?skip=act1` (start Act 2 at midnight, at the dead end), `?skip=exit` (holding the exit key, every clue held), `&ending=true|escape|possessed|trapped` and `&clock=HH:MM`.
- Ending resolution and the clock SHALL be pure functions. No new dependency.

## Interfaces
```ts
resolveEnding(input: { named: boolean; toldTheTruth: boolean; caught: boolean; dawnWrong: boolean }): 'true' | 'escape' | 'possessed' | 'trapped'
gameClock(elapsedMs: number, dawnMinutes: number): { hour: number; minute: number; dawn: boolean }
```

## Out of scope
New mechanics; anything not described in `docs/story.md`. Naming the killer and the dining room finale (21); dawn and the walk back to the front door (22).

## Acceptance checks
Must:
- [ ] Unit: `resolveEnding` table test covering every combination.
- [ ] Unit: the clock maps elapsed time to hours correctly and reports dawn at `DAWN_MINUTES`.
- [ ] Playwright (`?seed=42`, mocks): title, then prologue, the door locks behind the player (screenshot); E on the front door is refused.
- [ ] Playwright: a scripted run of Act 1 with key presses reaches the midnight chime and Act 2.
- [ ] Playwright: after Act 1, the thought "There must be a candle somewhere here." shows at the dead end (screenshot).
- [ ] Playwright: screenshots of all four endings via `&ending=`, the possessed one showing its line.
Should:
- [ ] Manual: Act 1 takes about 3 minutes and Act 2 15 to 25 minutes on a first play.
- [ ] The title screen shows whether Ollama and Piper were found.

## Test plan
Vitest: ending resolution, clock. Playwright with mock LLM and TTS: prologue, Act 1 scripted run, the candle thought, ending screenshots. Manual: full playthroughs on Thursday and Friday evening.

## Open questions
- Settled 29 October 2026: the trapped ending is only the wrong name at dawn (22). The patriarch is never among the names offered (21 offers the characters with secrets).

## Decisions
- Amended on 29 October 2026 with the user's new design: the accusation at the ofrenda moved to the spirits (21) and to the patriarch at dawn (22); the dining room is revealed by the exit key (21), not by enough clues; dawn no longer always traps the player (22); being caught by La Sombra, not a wrong accusation, is the possessed ending; the candle and matchbox wait at the Act 1 dead end (18). Approved by the user on 30 October 2026.
