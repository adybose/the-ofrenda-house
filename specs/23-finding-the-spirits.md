# 23: Finding the spirits
Status: Done
Depends on: 03, 07, 11, 14, 20

## Goal
The player finds most of the spirits before dawn: their rooms are a few doors away, not lost in the maze, and their whispers show the way.

## Requirements
- THE SYSTEM SHALL place each spirit's room (at the start and whenever a reshuffle moves it) on a dead end 5 to 7 doors from the player where one is free, otherwise as near that as possible within `KEY_ROOM_REACH` (spec 03).
- WHEN lightning reshuffles the house THE SYSTEM SHALL move every unvisited spirit's room that has drifted more than 7 doors from the player (and isn't in view) back within that range.
- THE SYSTEM SHALL keep a room where the player has met its spirit exactly where it is (spec 18 froze its chunk; this spec records it as a rule of play).
- WHILE Act 2 runs, and nothing else holds the screen (an encounter, a dialogue, the journal, the finale, dawn or an ending), THE SYSTEM SHALL every 25 to 35 s (seeded) play a spirit's whisper from the direction of the nearest spirit room the player can enter (unresolved, and unlocked or its key held): about 4 cells along the way there, so the sound leads through the doorways.
- WHEN the first such whisper plays THE SYSTEM SHALL show the thought "Whispers… from that way. Someone is waiting there." (20).
- Choosing the spirit and the point SHALL be pure and unit-tested. No new dependency.

## Interfaces
```ts
// src/world/grid.ts
KEY_ROOM_BAND = [5, 7]
// src/story/guide.ts (pure parts)
nearestSpirit(distances: Map<roomId, doors>, keyRooms: KeyRoomState[], resolved: (id) => boolean, keys: ReadonlySet<string>): KeyRoomState | undefined
whisperPoint(path: CellId[], steps = 4): CellId | undefined
events: guideWhisper { characterId, position }
```

## Out of scope
A map, a guiding light, protecting the route from reshuffles (offered, not chosen).

## Acceptance checks
Must:
- [x] Unit: `nearestSpirit` skips resolved spirits and locked rooms without their key, and takes the fewest doors; `whisperPoint` takes the 4th cell along, or the last.
- [x] Unit (200 seeds, 30 reshuffles each): at least 75% of placements land 5 to 7 doors from the player; after each reshuffle at least 85% of unvisited rooms out of view are within 7 doors and 95% within 9; the 1,000-seed reach and lock tests (spec 03) still pass.
- [x] Unit: a room where the player has met its spirit stays where it is through reshuffles (spec 18's test).
- [x] Playwright (`?seed=42&skip=act1&guide=3`): a `guideWhisper` comes for an unresolved spirit the player can enter, from a point nearer its room than the player, and the thought shows.
Should:
- [ ] Manual: on a few seeds, following the whispers leads from spirit to spirit.

## Test plan
Vitest: spirit choice, whisper point, placement statistics. Playwright: a guide whisper and its thought.

## Decisions
- Asked for by the user on 31 October 2026, after runs where the spirits' rooms were too hard to find. Of the helpers offered they chose the whispers, nearer rooms, and rooms that stay put once met; a guiding light and a route protected from reshuffles were not chosen.
- `&guide=N` (debug) whispers every N seconds.
- The thresholds in the check above were lowered from the 80% and 95% first planned, to what the house allows: free dead ends a few doors from the player are scarce, and six or seven rooms compete for them. Measured over 100 seeds × 30 reshuffles: after reshuffles 89% of unvisited rooms are within 7 doors and 97% within 9 (before this spec, rooms were anywhere from 3 to 14 doors away).
- Rooms are first placed measured from where Act 2 begins (the end of the Act 1 corridor, `ACT2_START_CELL`), not the entrance hall two doors further back. At the very start only about half can be within 7 doors (the house joins the wing at a single door, so few dead ends are close); the first lightning brings the rest nearer.
- Amended by spec 25: whispers every 12 to 18 s, from 2 cells along the way, at gain 1.8 and full level within 4 m.
