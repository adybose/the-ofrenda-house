# 03: Endless house generator
Status: Done
Depends on: 01, 02

## Goal
The house feels endless and keeps rearranging itself, yet the spirits' rooms are always within reach and the way out stays shut until the case is solved.

## Requirements
- THE SYSTEM SHALL model the house as a grid of cells grouped into chunks, with rooms made of cells and doors between rooms. Room kinds are filler (parlour, bedroom, nursery, bathroom, corridor), key rooms (one per spirit, from the case file's `roomKind`), the entrance wing and the dining room.
- WHEN the player's cell changes THE SYSTEM SHALL keep chunks within radius R of the player's chunk loaded and unload chunks beyond R + 1, never unloading the player's chunk.
- WHEN a chunk is generated again after being unloaded THE SYSTEM SHALL produce the same layout, as a pure function of seed, chunk coordinates and reshuffle epoch.
- THE SYSTEM SHALL generate a fixed entrance wing: an entrance hall with the front door, a portrait hall with one portrait slot per character, and a corridor that spec 14 can shift into a dead end during Act 1.
- THE SYSTEM SHALL place each unvisited key room so that it is reachable through doors from the player's room within K rooms (K = 14), at the start and after every reshuffle.
- THE SYSTEM SHALL lock some key rooms behind keys rewarded by other spirits, with an acyclic lock order and at least 2 key rooms unlocked at the start.
- WHEN a `lightning` event fires THE SYSTEM SHALL regenerate corridor and filler cells that are not in the given visible set, not in the player's room or the rooms next to it, and not pinned, then bump the reshuffle epoch, keeping every reachability guarantee.
- THE SYSTEM SHALL keep the front door sealed until `unsealFrontDoor()` is called; interacting with it before then reports `sealed`.
- WHEN `revealDiningRoom()` is called THE SYSTEM SHALL place the dining room at the end of the next corridor ahead of the player: a room 2 to 6 doors away, out of sight, ahead of the player whenever such a room exists, preferring one reached through a corridor.
- THE SYSTEM SHALL mark tall windows on some walls (for spec 06), a size class per room (small, medium, large, for spec 07 reverb) and anchor points per room (fireplace, chandelier, loose floorboards, dark corner, mirror, plus clock, portrait and ofrenda in the special rooms) for specs 12, 13 and 14.
- THE SYSTEM SHALL let other specs pin cells (spec 12 pins cells with marigold petals) so a reshuffle never changes them.
- `src/world` SHALL be pure data and logic with no three.js imports.

## Interfaces
```ts
createHouse(seed: number, caseFile: CaseFile): House
generateChunk(seed, cx, cy, epoch): Chunk                // pure; the house adds key rooms, dining room, portraits and door states on top
house.startCell: CellId                                  // entrance hall
house.update(playerCell: CellId): ChunkDiff              // { loaded: Chunk[]; unloaded: ChunkId[] }
house.reshuffle(visible: ReadonlySet<CellId>, playerCell: CellId): ChunkDiff
house.unlock(doorId: DoorId): void
house.pinCells(cells: readonly CellId[]): void
house.shiftCorridorBehind(): ChunkDiff                   // Act 1: walls up the way back to the portrait hall
house.endAct1(): void                                    // unseals the Act 1 corridor's far door into the house
house.revealDiningRoom(visible, playerCell, facing: Dir): ChunkDiff
house.unsealFrontDoor(): void
house.sealFrontDoor(): void                              // added by spec 16: the door slams and locks behind the player
house.markVisited(characterId): void                     // also done by update() when the player enters a key room
house.pathBetween(a: CellId, b: CellId, blocked?: (c: CellId) => boolean): CellId[] | null
house.roomAt(cell), house.getRoom(roomId), house.getDoor(doorId), house.doorBetween(a, b), house.loadedChunks(), house.chunkAt(cx, cy)
house.keyRooms(): KeyRoomState[]                         // { characterId, style, keyId, locked, keyHolderId?, visited, roomId?, doorId? }
house.diningRoom(): Room | undefined
house.distancesFrom(cell, maxDepth): Map<roomId, number> // doors crossed, used by tests and spec 14
Room { id, kind, style?, characterId?, size, chunkId, cells, doors, windows, anchors }
Door { id, a, b, state: 'open' | 'closed' | 'locked' | 'sealed', keyId? }
```

## Out of scope
Meshes and textures (04), collision (05), lights (06), when lightning fires (06), Shadow behaviour (12).

## Acceptance checks
Must:
- [x] The same seed, epoch and chunk coordinates always give the same chunk.
- [x] Walking a scripted 500-cell random path keeps the loaded chunk count at or below the maximum and never unloads the player's chunk.
- [x] For 1,000 seeds with 50 random reshuffles each, every unvisited key room stays reachable within K rooms once the keys already earned are counted.
- [x] For 1,000 seeds there is an order in which every locked key room can be opened.
- [x] A reshuffle never changes visible cells, pinned cells, the player's room or the rooms next to it.
- [x] The front door stays sealed until `unsealFrontDoor()`; the dining room does not exist until `revealDiningRoom()`, and then it is at the end of the next corridor.
Should:
- [x] A `?debug=map` top-down overlay; screenshot saved to `artifacts/screenshots/03-map.png`.
- [x] Generating one chunk takes under 2 ms in a Vitest benchmark.

## Test plan
Vitest: determinism, loading and unloading over a scripted walk, reachability and lock-order property tests over 1,000 seeds, reshuffle preservation, front door and dining room rules. Playwright: debug map screenshot.

## Decisions
- Grid: a cell is the walkable unit; a slot is 5×5 cells and holds one room (corridors use only a one-cell cross through the slot); a chunk is 3×3 slots. Rows south of 0 are outside, so the house is endless east, west and north. R = 1 (chunks loaded within 1, unloaded beyond 2, at most 25 loaded).
- Each chunk is a random spanning tree of its slots plus some loops, and the doors between neighbouring chunks never change, so the whole house is always connected. Up to 3 alcoves per chunk (slots with no door to another chunk, not next to each other) get exactly one door, so every chunk has dead ends for key rooms (about 2 per chunk).
- A reshuffle bumps the epoch of every chunk within 2 of the player that holds none of the protected slots (visible, pinned, the player's room and the rooms next to it, the entrance wing, the dining room). Protecting whole chunks is stricter than the requirement, which is fine.
- Key rooms sit on top of dead-end slots (one door), so placing, moving or locking one never changes how the house connects. After a reshuffle, key rooms in reshuffled chunks, or further than K, are moved to a dead end 3 to K doors from the player. Distances count every door, locked or sealed, since key rooms are dead ends and their own door is the only lock on the way.
- The patriarch has no key room (spec 02), so there are 6 or 7 key rooms. 2 or 3 are locked; each key is held by a spirit earlier in a random order, which keeps the order acyclic.
- A failed spirit still leaves its key behind (open question, proposal accepted), so a locked room never becomes unreachable. Spec 11 implements this.
- K is 14, not the 12 first planned. The entrance wing is a bottleneck (the endless house starts 3 doors from the start), and with K = 12, 35 of 200 seeds had fewer than 7 dead ends in reach at the start; with K = 14, none did. Measured over 1,000 seeds × 50 reshuffles, every key room stayed in reach.
- The 1,000-seed reach test is split over four test files so Vitest runs them in parallel (about 9 s for all unit tests).
- The entrance wing is the fixed chunk (0, 0): entrance hall with the front door on the façade, the portrait hall, and the Act 1 corridor. The corridor's far door is sealed until `endAct1()`; `shiftCorridorBehind()` walls up the door back to the portrait hall, leaving a dead end.
