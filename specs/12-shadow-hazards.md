# 12: The Shadow and hazards
Status: Approved
Depends on: 03, 06, 11

## Goal
La Sombra hunts the player through the house, growing bolder with every failed riddle, and marigold petals are the only safe ground. Being caught means possession.

## Requirements
- THE SYSTEM SHALL draw La Sombra as a tall faceless silhouette, darker than the surrounding dark, with noisy edges; the flashlight does not light it, and it shows mostly as a shape against the beam and lightning.
- THE SYSTEM SHALL keep a threat level from 0 to 5 that starts at 0 in Act 2, rises by 1 for each `riddleFailed` and by 1 each in-game hour, and never falls. Threat sets how often it hunts, its speed, how often hazards happen and how often it whispers.
- THE SYSTEM SHALL move the Shadow through states: dormant → stalking (whispers through the walls, placed in 3D) → hunting (pathfinding towards the player, heartbeat rising) → chasing (in sight, taunts) → lost (back to stalking).
- WHEN the Shadow appears THE SYSTEM SHALL place it at least 8 m from the player and out of view.
- THE SYSTEM SHALL pathfind over the house's walkable cells with A*, repathing about every 0.5 s. Locked doors and petal cells block it; it can open closed doors.
- WHILE threat is below 3 THE SYSTEM SHALL keep the Shadow slower than the player's run speed, so escape is always possible.
- WHEN the player presses Q THE SYSTEM SHALL scatter marigold petals on the player's cell, if any handfuls remain, and pin that cell (spec 03). The Shadow never enters a petal cell and cannot catch a player standing on one. Petals last for the whole run.
- THE SYSTEM SHALL trigger hazards, at most one at a time with a cooldown, each signalled by a creak about 0.5 s before: a chandelier or mirror crashing 2 to 4 m ahead on the player's path (never on the player), a door slamming shut and locking for about 20 s, and the flashlight dying for 2 to 4 s. Hazards scare and block; they never harm.
- WHEN the Shadow comes within 1 m of a player who is not on petals THE SYSTEM SHALL emit `caughtByShadow` (spec 14 plays the possessed ending; until then, a fade to black).
- WHILE an encounter, the journal, Act 1 or the ofrenda is active THE SYSTEM SHALL not hunt, chase or trigger hazards.
- THE SYSTEM SHALL drive `audio.setTension` and `flashlight.setFlicker` from the Shadow's distance, and fetch taunts and whispers from `/api/shadow/taunt`, spoken with the Shadow voice (09).
- Pathfinding, threat and spawn rules SHALL be pure and unit-tested. No new dependency.

## Interfaces
```ts
shadowReducer(state: ShadowState, event: ShadowEvent): ShadowState
findPath(house, from, to, blocked): CellId[] | null
petals.scatter(cell): boolean; petals.remaining(): number
events: shadowStateChanged { state }, hazard { kind, position }, caughtByShadow
```

## Out of scope
Bats, rats and cats (13), ending screens (14).

## Acceptance checks
Must:
- [ ] Unit: A* paths avoid petal cells and locked doors; the Shadow cannot catch a player on petals.
- [ ] Unit: threat rises on `riddleFailed` and each hour, and never falls.
- [ ] Property test: spawn positions are always at least 8 m away and out of view.
- [ ] Unit: below threat 3 the Shadow is slower than the run speed.
- [ ] Playwright debug scene (`?debug=shadow`): the distance to the player shrinks over 3 s; with the player on petals the Shadow stops at the edge; being caught shows the placeholder (screenshots).
- [ ] Playwright: a chandelier hazard lands ahead of the player, not on them (screenshot).
Should:
- [ ] Simulation: a bot fleeing at run speed at threat 2 escapes in at least 90% of 200 seeded chases.
- [ ] Hazards and whispers stop during encounters and the journal.

## Test plan
Vitest: pathfinding, threat, spawn property test, catch rules, flee simulation. Playwright: debug Shadow scene, petals, caught placeholder, chandelier hazard.

## Open questions
- The story doesn't say how many petals the player has. Proposal: 6 handfuls at the start of Act 2, plus 1 for each spirit rewarded.
