# 05: Player controller
Status: Done
Depends on: 04

## Goal
The player walks the house in first person with the controls from `docs/story.md`, never passes through walls, and can open doors and talk to spirits with E.

## Requirements
- WHILE Up or Down is held THE SYSTEM SHALL walk forward or backward; WHILE Left or Right is held THE SYSTEM SHALL turn at a fixed rate.
- WHILE Shift is held THE SYSTEM SHALL move at run speed (about 1.8 times walk speed).
- WHEN the canvas is clicked THE SYSTEM SHALL request pointer lock; WHILE locked, mouse movement SHALL turn and look up and down. Page Up and Page Down SHALL also look up and down. Pitch is clamped to about ±80°.
- THE SYSTEM SHALL collide the player (a circle of about 0.3 m) against walls and closed doors, sliding along walls, and SHALL never tunnel through a wall at run speed, even with a 100 ms frame (movement is sub-stepped).
- WHEN the player presses E THE SYSTEM SHALL interact with the nearest registered interactable within 1.5 m and within 45° of the view centre; a small "E" prompt shows when one is in range.
- WHEN E is used on a door THE SYSTEM SHALL open or close it with a swing animation if unlocked, unlock it if the player holds its key, or emit `doorLocked` (or `doorSealed` for the front door).
- WHEN the player's cell changes THE SYSTEM SHALL emit `playerCellChanged` (spec 03 loads chunks from it).
- WHILE walking THE SYSTEM SHALL bob the camera slightly and emit `footstep` events with the surface type.
- WHEN `setControlsEnabled(false)` is called (dialogue, journal, cutscenes) THE SYSTEM SHALL ignore movement input.
- Movement and collision SHALL be a pure function, unit-testable without three.js. No new dependency.

## Interfaces
```ts
// src/player/movement.ts (pure)
stepPlayer(state: PlayerState, input: InputState, dt: number, walls: CollisionMap): PlayerState
PLAYER  // radius 0.3, walk 1.4 m/s, run × 1.8, turn 2.2 rad/s, pitch ±80°, 5 cm sub-steps
// src/world/collision.ts (pure): walls, door jambs, closed door panels and furniture as boxes
createCollisionMap(house, seed): CollisionMap
// src/player/interaction.ts
interactions.register({ id, x, z, kind: 'door' | 'object' | 'spirit' | 'portrait', label, onInteract }): () => void
pickInteractable(viewer, items)  // nearest within 1.5 m and 45°
// src/player/controller.ts
player.setControlsEnabled(enabled: boolean); player.teleport(x, z, yaw); player.state()
// src/player/doors.ts: registers every loaded door, handles E, animates the swing
house.setDoorOpen(doorId, open): boolean   // added to spec 03's house
footstepSurface(room, cell): 'wood' | 'tile' | 'carpet' | 'stone'   // src/world/surfaces.ts
events: playerCellChanged { cell }, footstep { surface, running }, interact { id },
        doorOpened, doorClosed, doorUnlocked, doorLocked, doorSealed { doorId }
```

## Out of scope
F for the flashlight (06), Q for petals (12), J for the journal (10), 1 to 4 for choices (10).

## Acceptance checks
Must:
- [x] Unit: the player cannot pass through a wall at walk or run speed for any frame time up to 100 ms, and slides along a wall when walking into it at an angle.
- [x] Unit: turning rate and walk and run speeds match the configured constants.
- [x] Playwright: holding ArrowUp for 1 s moves the camera forward and ArrowLeft turns it; before and after screenshots saved.
- [x] Playwright: E on a nearby unlocked door opens it; on a locked door emits `doorLocked`.
- [x] Playwright: with controls disabled, arrow keys do not move the camera.
Should:
- [x] Page Up and Page Down change pitch within the clamp.
- [x] The "E" prompt appears only when an interactable is in range and in view.

## Test plan
Vitest: `stepPlayer` collision and speed tests, interaction target selection. Playwright: movement, turning, doors, disabled controls.

## Decisions
- Collision is circle against boxes: each cell side that leads out of the room is a 20 cm wall slab on the boundary; doorways keep jambs either side of the 1 m opening, plus a panel across it unless the door is open. Closed doors block; E opens them. Furniture uses the same footprints the renderer draws. Movement is split into 5 cm steps (radius 0.3 m), so no frame up to 100 ms can skip a wall.
- Door states change at once in the house (so collision clears straight away); the panel then swings over 0.6 s.
- Locked doors open with E only if the player holds their key (`keys` set in main; spec 11 hands keys out). The front door and the Act 1 exit report `doorSealed`.
- Footsteps fire every 0.75 m walking or 1.0 m running, only for distance actually covered, with the surface from the room's floor (rugs count as carpet). Spec 07 plays them.
- The room surface tables moved from `src/render/chunk-mesh.ts` to `src/world/surfaces.ts`, so footsteps and rendering agree.
- `?skip=act1` starts at the end of the Act 1 corridor with the exit unsealed (closed, opened with E). Spec 14 takes this flag over.
- Debug hooks gained `player()`, `setControlsEnabled`, `standFacingDoor`, `prompt()`, `events()` and `giveKey` for Playwright.
