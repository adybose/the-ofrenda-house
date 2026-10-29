# 22: Dawn
Status: Done
Depends on: 03, 14, 21

## Goal
A player who survives until dawn without escaping faces the patriarch's last question: name the killer and walk back out through the front door, or be trapped forever.

## Requirements
- WHEN the clock reaches 6 am (spec 14) and the player hasn't escaped THE SYSTEM SHALL end the night: La Sombra fades, scares and hazards stop, and grey dawn light comes through the windows.
- THE SYSTEM SHALL then bring the patriarch to stand before the player and ask who the killer is, with the same options as spec 21. This is the last chance.
- WHEN the player names the killer THE SYSTEM SHALL have the patriarch laugh and say "Well done, you found the killer. You are free now." (fixed text), then:
  - stop the house reshuffling for the rest of the run;
  - take down the Act 1 wall raised by `shiftCorridorBehind` and unseal the front door;
  - strew marigold petals along the shortest path from the player to the front door;
  - show the thought "The front door. I have to find my way back." (20).
- WHEN the player opens the front door THE SYSTEM SHALL play the **true** ending if `toldTheTruth`, otherwise the **escape** ending (14).
- WHEN the player names anyone else THE SYSTEM SHALL have the patriarch laugh and say "Too bad, now you join the others who came before you." (fixed text), then play the **trapped** ending (14).
- The outcome and the path home SHALL be pure and unit-tested. No new dependency.

## Interfaces
```ts
dawnOutcome(accusedId: CharacterId, killerId: CharacterId): 'free' | 'trapped'
pathHome(house: House, from: CellId): CellId[]           // the cells to strew petals on, ending at the hall's cell inside the front door ('7,0'); [] if none
house.freeze(): void                                      // no more reshuffles
house.reopenAct1Corridor(): ChunkDiff                     // takes down the wall from shiftCorridorBehind
events: dawn (spec 14's clock), dawnAnswered { accusedId, correct }
```

## Out of scope
The clock itself and the ending screens (14), naming the killer before dawn (21).

## Acceptance checks
Must:
- [x] Unit: `dawnOutcome` for the right and a wrong name.
- [x] Property test over 200 seeds with 50 reshuffles each: once the Act 1 wall is down, `pathHome` reaches the front door from any loaded cell.
- [x] Unit: after `freeze()`, lightning no longer reshuffles the house.
- [x] Playwright (`?seed=42&skip=act1&clock=05:59`): dawn, the right name, the petals along the way, the front door opens and the ending shows (screenshots).
- [x] Playwright: dawn and a wrong name give the trapped ending (screenshot).

## Test plan
Vitest: outcome, path home, freeze. Playwright with the mock LLM: both answers at dawn.

## Decisions
- Supersedes spec 14's rule that dawn always gives the trapped ending.
- Marigold petals are no longer a refuge (spec 12); at dawn they mark the way home.
- The patriarch's question waits for any encounter, dialogue or the journal to close. A player who already named the killer to a spirit (21) but hasn't left is simply set free at dawn.
- The grey dawn light is the house's ambient light rising over 3 s, rather than light through each window: simpler, and it reads the same.
- The way home is A* through the doors (`house.pathBetween`); the house is frozen at dawn, so the petals stay true.
- Proof: `tests/unit/dawn.test.ts` (the outcome; 200 seeds × 50 reshuffles, five starting cells each, every path reaching the front door through doors that open; nothing moves once frozen) and `tests/e2e/dawn.spec.ts`: at 6:00 the patriarch asked, the right name freed the player, the back door to the portrait hall was there again, the front door unsealed, petals lay along the way home (`artifacts/screenshots/22-petals.png`), and opening the front door gave the ending matching `toldTheTruth` (`22-free.png`); a wrong name gave the trapped ending (`22-trapped.png`).
- Scares stop for good at dawn as well as La Sombra and the hazards; thoughts carry on.
- Under heavy load on the test machine (load average about 12), a few thought and story checks timed out in a full parallel run; with two workers all 77 browser tests pass.
