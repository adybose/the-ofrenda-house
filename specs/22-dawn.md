# 22: Dawn
Status: Approved
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
pathHome(house: House, from: CellId): CellId[]           // the cells to strew petals on, ending at the front door
house.freeze(): void                                      // no more reshuffles
house.reopenAct1Corridor(): void                          // takes down the wall from shiftCorridorBehind
events: dawn, dawnAnswered { accusedId, correct }
```

## Out of scope
The clock itself and the ending screens (14), naming the killer before dawn (21).

## Acceptance checks
Must:
- [ ] Unit: `dawnOutcome` for the right and a wrong name.
- [ ] Property test over 200 seeds with 50 reshuffles each: once the Act 1 wall is down, `pathHome` reaches the front door from any loaded cell.
- [ ] Unit: after `freeze()`, lightning no longer reshuffles the house.
- [ ] Playwright (`?seed=42&skip=act1&clock=05:59`): dawn, the right name, the petals along the way, the front door opens and the ending shows (screenshots).
- [ ] Playwright: dawn and a wrong name give the trapped ending (screenshot).

## Test plan
Vitest: outcome, path home, freeze. Playwright with the mock LLM: both answers at dawn.

## Decisions
- Supersedes spec 14's rule that dawn always gives the trapped ending.
- Marigold petals are no longer a refuge (spec 12); at dawn they mark the way home.
