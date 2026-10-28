# 03: Endless house generator
Status: Approved
Depends on: 01, 02

## Goal
The house feels endless and keeps rearranging itself, yet the spirits' rooms are always within reach and the way out stays shut until the case is solved.

## Requirements
- THE SYSTEM SHALL model the house as a grid of cells grouped into chunks, with rooms made of cells and doors between rooms. Room kinds are filler (parlour, bedroom, nursery, bathroom, corridor), key rooms (one per spirit, from the case file's `roomKind`), the entrance wing and the dining room.
- WHEN the player's cell changes THE SYSTEM SHALL keep chunks within radius R of the player's chunk loaded and unload chunks beyond R + 1, never unloading the player's chunk.
- WHEN a chunk is generated again after being unloaded THE SYSTEM SHALL produce the same layout, as a pure function of seed, chunk coordinates and reshuffle epoch.
- THE SYSTEM SHALL generate a fixed entrance wing: an entrance hall with the front door, a portrait hall with one portrait slot per character, and a corridor that spec 14 can shift into a dead end during Act 1.
- THE SYSTEM SHALL place each unvisited key room so that it is reachable through doors from the player's room within K rooms (K set in the plan, around 12), at the start and after every reshuffle.
- THE SYSTEM SHALL lock some key rooms behind keys rewarded by other spirits, with an acyclic lock order and at least 2 key rooms unlocked at the start.
- WHEN a `lightning` event fires THE SYSTEM SHALL regenerate corridor and filler cells that are not in the given visible set, not in the player's room or the rooms next to it, and not pinned, then bump the reshuffle epoch, keeping every reachability guarantee.
- THE SYSTEM SHALL keep the front door sealed until `unsealFrontDoor()` is called; interacting with it before then reports `sealed`.
- WHEN `revealDiningRoom()` is called THE SYSTEM SHALL place the dining room at the end of the next corridor ahead of the player.
- THE SYSTEM SHALL mark tall windows on some walls (for spec 06), a size class per room (small, medium, large, for spec 07 reverb) and anchor points per room (fireplace, chandelier, loose floorboards, dark corner, mirror) for specs 12 and 13.
- THE SYSTEM SHALL let other specs pin cells (spec 12 pins cells with marigold petals) so a reshuffle never changes them.
- `src/world` SHALL be pure data and logic with no three.js imports.

## Interfaces
```ts
createHouse(seed: number, caseFile: CaseFile): House
house.update(playerCell: CellId): ChunkDiff            // { loaded: Chunk[]; unloaded: ChunkId[] }
house.reshuffle(visible: ReadonlySet<CellId>, playerCell: CellId): ChunkDiff
house.unlock(doorId: DoorId): void
house.pinCells(cells: readonly CellId[]): void
house.shiftCorridorBehind(playerCell: CellId, facing: Dir): ChunkDiff   // Act 1 dead end
house.revealDiningRoom(playerCell: CellId, facing: Dir): ChunkDiff
house.unsealFrontDoor(): void
house.pathBetween(a: CellId, b: CellId, blocked?: (c: CellId) => boolean): CellId[] | null
Room { id, kind, characterId?, size, cells, doors, windows, anchors }
Door { id, a, b, state: 'open' | 'closed' | 'locked' | 'sealed', keyId? }
```

## Out of scope
Meshes and textures (04), collision (05), lights (06), when lightning fires (06), Shadow behaviour (12).

## Acceptance checks
Must:
- [ ] The same seed, epoch and chunk coordinates always give the same chunk.
- [ ] Walking a scripted 500-cell random path keeps the loaded chunk count at or below the maximum and never unloads the player's chunk.
- [ ] For 1,000 seeds with 50 random reshuffles each, every unvisited key room stays reachable within K rooms once the keys already earned are counted.
- [ ] For 1,000 seeds there is an order in which every locked key room can be opened.
- [ ] A reshuffle never changes visible cells, pinned cells, the player's room or the rooms next to it.
- [ ] The front door stays sealed until `unsealFrontDoor()`; the dining room does not exist until `revealDiningRoom()`, and then it is at the end of the next corridor.
Should:
- [ ] A `?debug=map` top-down overlay; screenshot saved to `artifacts/screenshots/03-map.png`.
- [ ] Generating one chunk takes under 2 ms in a Vitest benchmark.

## Test plan
Vitest: determinism, loading and unloading over a scripted walk, reachability and lock-order property tests over 1,000 seeds, reshuffle preservation, front door and dining room rules. Playwright: debug map screenshot.

## Open questions
- If a spirit's riddle is failed, is the key it would have given lost? If it is, the locked room can never be opened and the case may become unsolvable. Proposal: a failed spirit still leaves its key behind, so failure costs only the clue.
- The build plan says 6 key rooms, but the household has 7 or 8 characters. Proposal: one key room per spirit holding clues, which is 6 or 7 if the patriarch is only the guide (see spec 02).
