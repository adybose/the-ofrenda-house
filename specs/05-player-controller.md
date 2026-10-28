# 05: Player controller
Status: Approved
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
stepPlayer(state: PlayerState, input: InputState, dt: number, walls: CollisionMap): PlayerState
registerInteractable(i: { id; position; kind: 'door' | 'object' | 'spirit' | 'portrait'; label; onInteract }): () => void
setControlsEnabled(enabled: boolean): void
events: playerCellChanged, footstep { surface, running }, interact { id }, doorLocked, doorSealed, doorOpened
```

## Out of scope
F for the flashlight (06), Q for petals (12), J for the journal (10), 1 to 4 for choices (10).

## Acceptance checks
Must:
- [ ] Unit: the player cannot pass through a wall at walk or run speed for any frame time up to 100 ms, and slides along a wall when walking into it at an angle.
- [ ] Unit: turning rate and walk and run speeds match the configured constants.
- [ ] Playwright: holding ArrowUp for 1 s moves the camera forward and ArrowLeft turns it; before and after screenshots saved.
- [ ] Playwright: E on a nearby unlocked door opens it; on a locked door emits `doorLocked`.
- [ ] Playwright: with controls disabled, arrow keys do not move the camera.
Should:
- [ ] Page Up and Page Down change pitch within the clamp.
- [ ] The "E" prompt appears only when an interactable is in range and in view.

## Test plan
Vitest: `stepPlayer` collision and speed tests, interaction target selection. Playwright: movement, turning, doors, disabled controls.
