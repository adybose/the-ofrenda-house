# 21: Naming the killer
Status: Done
Depends on: 02, 07, 08, 11, 18, 19

## Goal
Once the player holds enough clues, each spirit they set at peace asks who the killer is, laughs whatever the answer, and leaves a key: to the way out if they were right, otherwise to another locked room.

## Requirements
- THE SYSTEM SHALL count the player as holding **enough clues** when the case solver (spec 02) leaves one suspect for the clue cards held, or when at least 4 riddles have been solved (tunable), whichever comes first.
- WHEN a riddle is solved and the player holds enough clues and hasn't yet named the killer THE SYSTEM SHALL, after the reward, have the spirit ask who did it (spec 08 writes the line; fallback "Tell me, stranger… who did this to us?"), offering the 3 or 4 characters with secrets (the killer is always one of them, spec 02).
- WHEN the player answers THE SYSTEM SHALL play a loud, echoing ghostly laugh (a new procedural `laugh` sound in spec 07's engine), then the spirit leaves through the wall (19) and a key is laid beside its candle (18):
  - the right name → the **exit key**;
  - a wrong name → the key to a spirit room still locked whose key hasn't been given yet, if any; otherwise no key;
  - each wrong name also raises La Sombra's threat by 1 (12).
- WHEN the player picks up the exit key THE SYSTEM SHALL reveal the dining room at the end of the next corridor (spec 03's `revealDiningRoom`), its door locked by the exit key.
- WHEN the player enters the dining room with the exit key THE SYSTEM SHALL play the finale: the ofrenda, a candle and portrait for each of the dead, the patriarch beside it, and the garden door standing open, then the **true** ending if `toldTheTruth` (10), otherwise the **escape** ending (14).
- The threshold, the options and the key rule SHALL be pure and unit-tested. No new dependency.

## Interfaces
```ts
enoughClues(caseFile: CaseFile, heldFactIds: readonly string[], solvedCount: number): boolean
accusationOptions(caseFile: CaseFile): CharacterId[]          // the characters with secrets
accusationKey(input: { correct: boolean; locked: readonly KeyRoomState[]; given: ReadonlySet<string> }): string | undefined
EXIT_KEY  // 'key:exit'
events: accused { characterId, accusedId, correct }, exitKeyAwarded, spiritLaughed { characterId }, ending { kind: 'true' | 'escape' }
house.revealDiningRoom(visible, playerCell, facing, lockedBy?: string)   // its doors locked by the exit key
```

## Out of scope
Dawn and the patriarch's last question (22), the ending screens themselves (14).

## Acceptance checks
Must:
- [x] Unit: `enoughClues` for the single-suspect case and the riddle count.
- [x] Unit over 1,000 seeds: the options are 3 or 4 and always include the killer.
- [x] Unit: right → the exit key; wrong → the next locked room's key not yet given; none left → no key.
- [x] Playwright (mock LLM, `&clues=all`): a wrong name leaves a room key; a right name leaves the exit key, the dining room appears, and entering it gives the ending (screenshots).
- [x] Playwright: the `laugh` sound plays after the answer (audio event logged).
Should:
- [ ] The laugh is checked by ear on the soundboard (`?debug=soundboard`).

## Test plan
Vitest: threshold, options, key rule. Playwright with the mock LLM: wrong and right answers, the dining room, the finale.

## Decisions
- Supersedes the accusation at the ofrenda (spec 14) and the dining room appearing once the clues are enough (spec 14): the exit key now reveals it.
- The killer's own spirit asks the question like any other; it looks no different (spec 11).
- Cut for time: the question is hand-written (a few versions by trust, "Tell me, stranger… who did this to us?"), not written by the model; a new model step would need server prompt, schema and validation changes. The patriarch's finale lines are fixed text too.
- Cut for time: the finale's ofrenda is the existing one (candles and marigolds), without a portrait for each of the dead.
- The laugh shows as the spirit's line ("Ha… ha ha ha ha!") while the `laugh` synth plays; `spiritLaughed` is emitted so tests see it with sound muted.
- The ending is a placeholder screen (title and the story's words) until spec 14's ending screens.
- Debug: `&clues=all` counts every clue as held, so the question comes at the first solved riddle.
- A spirit's own keys count as handed out before the answer's key is chosen, so it never lays the same key twice; any key already given is never laid again.
- The dining room's doors (all but a spirit's room opening off it) are locked by the exit key (`house.revealDiningRoom(..., EXIT_KEY)`), revealed facing the way the player looks when they pick the key up.
- Proof: `tests/unit/accusation.test.ts` (1,000 seeds for the options); `tests/e2e/accusation.spec.ts`: a wrong name logged `accused` (`correct: false`) and `spiritLaughed`, and left a locked room's key (`artifacts/screenshots/21-question.png`); the right name left the key to the way out, picking it up revealed the locked dining room, the key opened it, and walking in played the finale (`21-finale.png`) and the ending matching `toldTheTruth` (`21-ending.png`). The `laugh` renders offline with a peak of 0.81, audible for 2.8 s with its echo (spectral flatness 0.024: a voice, not noise).
- Not yet checked: the Should, the laugh by ear on `?debug=soundboard`.
