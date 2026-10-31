# 12: The Shadow and hazards
Status: Done
Depends on: 03, 06, 11, 17, 18

## Goal
La Sombra hunts the player through the house, growing bolder with every failed riddle and every hour. Light keeps it at bay: it threatens a player who has light and leaves them alone, but chases a player it finds in the dark, and being caught means possession.

## Requirements
- THE SYSTEM SHALL draw La Sombra as a tall faceless silhouette, darker than the surrounding dark, with noisy edges; the flashlight does not light it, and it shows mostly as a shape against the beam, candlelight and lightning.
- THE SYSTEM SHALL keep a threat level from 0 to 5 that starts at 0 in Act 2, rises by 1 for each `riddleFailed`, each wrong name (`accused` with `correct: false`, spec 21) and each in-game hour, and never falls. Threat sets how often it hunts, its speed, how often hazards happen and how often it whispers.
- THE SYSTEM SHALL move the Shadow through states: dormant → stalking (whispers through the walls, placed in 3D) → hunting (pathfinding towards the player, heartbeat rising) → on sight, **confronting** if the player is in light (spec 18's `inLight`), or **chasing** if they are in the dark → withdrawn or lost (back to stalking).
- WHILE confronting THE SYSTEM SHALL stop the Shadow 3 to 5 m from the player, speak a threat in the Shadow voice, then withdraw out of sight and leave the player alone for 30 to 60 s.
- WHILE chasing THE SYSTEM SHALL close in on the player, taunting. WHEN the player regains light (the flashlight comes on, a match is struck, a candle is lit or the player reaches a lit room) THE SYSTEM SHALL switch to confronting. WHEN the player gets more than 15 m away, or out of its sight for 4 s, THE SYSTEM SHALL switch to lost.
- WHEN the Shadow comes within 1 m of a player who is in the dark THE SYSTEM SHALL emit `caughtByShadow`; spec 14 plays the possessed ending, and until then the screen fades to black with "You lost. You were possessed by the spirit of La Sombra."
- THE SYSTEM SHALL never let the Shadow enter a sanctuary (spec 18's `isSanctuary`: a solved spirit's room whose candle burns); it may enter that room once the candle has burnt out or been carried away.
- WHEN the Shadow appears THE SYSTEM SHALL place it at least 8 m from the player and out of view.
- THE SYSTEM SHALL pathfind over the house's walkable cells with A*, repathing about every 0.5 s. Locked doors and sanctuary cells block it; it can open closed doors.
- WHILE threat is below 3 THE SYSTEM SHALL keep the Shadow slower than the player's run speed, so escape is always possible.
- THE SYSTEM SHALL trigger hazards, at most one at a time with a cooldown, each signalled by a creak about 0.5 s before: a chandelier or mirror crashing 2 to 4 m ahead on the player's path (never on the player), a door slamming shut and locking for about 20 s, and the flashlight dying for 2 to 4 s. Hazards scare and block; they never harm.
- WHILE an encounter, the journal, Act 1, the finale or dawn is active THE SYSTEM SHALL not hunt, confront, chase or trigger hazards.
- THE SYSTEM SHALL drive `audio.setTension` and `flashlight.setFlicker` from the Shadow's distance, and fetch taunts, threats and whispers from `/api/shadow/taunt`, spoken with the Shadow voice (09), falling back to `SHADOW_TAUNTS`.
- Pathfinding, threat, spawn and catch rules SHALL be pure and unit-tested. No new dependency.

## Interfaces
```ts
// src/spirits/shadow.ts (pure)
shadowReducer(state: ShadowState, event: ShadowEvent): ShadowState   // events: enable | tick { dt, sees, distance, inLight, suppressed } | riddleFailed | wrongName | hourPassed | force (debug)
speedFor(threat, mode): number; canCatch(distance, inLight): boolean
outOfView(candidate, player): boolean; chooseSpawn(candidates, player, pick: number): SpawnCandidate | undefined
findPath(house, from, to, blocked): CellId[] | null
// src/world/house.ts
house.holdShut(doorId, shut: boolean): boolean   // a slammed door jams (locked without a key) and is released
events: shadowStateChanged { state }, hazard { kind: 'crash' | 'door' | 'torch', position }, caughtByShadow
```

## Out of scope
Bats, rats and cats (13), ending screens (14), light sources and sanctuaries themselves (17, 18).

## Acceptance checks
Must:
- [x] Unit: A* paths avoid sanctuary cells and locked doors, and pass through a solved room once its candle is gone.
- [x] Unit: the Shadow confronts, never chases or catches, a player in light; a chase switches to confronting when the player regains light, and to lost beyond 15 m or 4 s out of sight.
- [x] Unit: threat rises on `riddleFailed`, a wrong name and each hour, and never falls.
- [x] Property test: spawn positions are always at least 8 m away and out of view.
- [x] Unit: below threat 3 the Shadow is slower than the run speed.
- [x] Playwright debug scene (`?debug=shadow`): in the dark, the distance to the player shrinks over 3 s; striking a match makes it stop and withdraw; with the player in a sanctuary it stops at the door; being caught shows the placeholder with its line (screenshots).
- [x] Playwright: a chandelier hazard lands ahead of the player, not on them (screenshot).
Should:
- [ ] Simulation: a bot fleeing in the dark at run speed at threat 2 escapes in at least 90% of 200 seeded chases.
- [x] Hazards and whispers stop during encounters and the journal.

## Test plan
Vitest: pathfinding, threat, spawn property test, confront and catch rules, flee simulation. Playwright: debug Shadow scene, a match in a chase, a sanctuary, the caught placeholder, the chandelier hazard.

## Decisions
- Rewritten on 29 October 2026 at the user's request: light, not marigold petals, is the refuge. Petals (Q, `petals.scatter`, `petals.remaining`, pinning petal cells) are cut, along with the open question about how many the player has. At dawn, petals mark the way home instead (22).
- The rewrite was approved by the user on 30 October 2026.
- Until spec 14's clock exists, an in-game hour is 240 s of Act 2 (`HOUR_SECONDS`, a 24-minute night). The Shadow is enabled when Act 2 starts: for now `?skip=act1`; spec 14 enables it at the midnight chime and suppresses it during Act 1, the finale and dawn.
- It sees the player in the same room, or in a room next to it through an open door, within 14 m.
- Its lines (threats when confronting, taunts in a chase) are spoken in the Shadow voice and shown as a caption, "La Sombra: …", so they read without speech.
- A crashed chandelier or mirror leaves a collision box for 25 s: it blocks the way, as the requirement says, and never lands on the player (at least 2 m ahead along the view, on open floor).
- Debug: `?debug=shadow` installs `window.__shadow` (state, distance, cell, `summon(metres, mode)`, `setThreat`, `hazard(kind)`).
- Proof: `tests/unit/shadow.test.ts` (13 tests: modes, threat, speeds, a 500-layout spawn property test, paths around sanctuaries and through jammed doors, hazards held off) and `tests/e2e/shadow.spec.ts`: in the dark it closed from 8.9 m to 2.3 m in 3 s; after a struck match it came no nearer than 5.5 m, spoke (captioned) and withdrew (`artifacts/screenshots/12-confront.png`, the faceless figure in the torch beam down the corridor); with the player in a solved, candle-lit room it never set foot inside (`12-sanctuary.png`); in the dark at 2.5 m it caught the player (`12-caught.png`); a crash landed 3.0 m straight ahead (`12-chandelier.png`).
- Not done (Should): the flee simulation over 200 seeded chases. Escape below threat 3 rests on the speeds (at most 2.36 m/s against the player's 2.52, unit-tested) and the 15 m and 4 s rules.
- The confront distance: it stops when within about 4.5 m (measured 5.5 m in the test, as it was further off when the match was struck); it never closes in on a player who has light.
- Amended by spec 25: hazards every 28 s ÷ (1 + 0.3 × threat), the first after 35 s; the crash brings down the chandelier ahead in view before trying a painting.
