# 21: Naming the killer
Status: Approved
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
events: accused { characterId, accusedId, correct }, exitKeyAwarded
```

## Out of scope
Dawn and the patriarch's last question (22), the ending screens themselves (14).

## Acceptance checks
Must:
- [ ] Unit: `enoughClues` for the single-suspect case and the riddle count.
- [ ] Unit over 1,000 seeds: the options are 3 or 4 and always include the killer.
- [ ] Unit: right → the exit key; wrong → the next locked room's key not yet given; none left → no key.
- [ ] Playwright (mock LLM, `&clues=all`): a wrong name leaves a room key; a right name leaves the exit key, the dining room appears, and entering it gives the ending (screenshots).
- [ ] Playwright: the `laugh` sound plays after the answer (audio event logged).
Should:
- [ ] The laugh is checked by ear on the soundboard (`?debug=soundboard`).

## Test plan
Vitest: threshold, options, key rule. Playwright with the mock LLM: wrong and right answers, the dining room, the finale.

## Decisions
- Supersedes the accusation at the ofrenda (spec 14) and the dining room appearing once the clues are enough (spec 14): the exit key now reveals it.
- The killer's own spirit asks the question like any other; it looks no different (spec 11).
