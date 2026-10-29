# 19: Spirit presence
Status: Approved
Depends on: 11

## Goal
A spirit glows faintly in the dark, floats above the floor, and comes and goes through the walls.

## Requirements
- THE SYSTEM SHALL draw a soft halo around each spirit (an additive glow billboard) so it is faintly visible in total darkness, with the flashlight off. The halo lights nothing and uses no light.
- THE SYSTEM SHALL float each spirit 0.25 to 0.4 m above the floor, bobbing slowly.
- WHEN an encounter starts THE SYSTEM SHALL bring the spirit in through the wall behind its portrait and drift it to about 2 m in front of the player, the wall hiding whatever part of it is still inside.
- WHEN an encounter ends THE SYSTEM SHALL take the spirit out through the nearest wall, fading.
- THE SYSTEM SHALL keep the encounter's timing (spec 11): the greeting starts once the spirit has arrived.
- No new dependency.

## Interfaces
```ts
spirit.setHalo(level: number)
spirit.drift(from: Vector3, to: Vector3, seconds: number): Promise<void>
```

## Out of scope
The encounter's steps (11), naming the killer (21).

## Acceptance checks
Must:
- [ ] Playwright (`?seed=42&skip=act1&debug=encounter`): with the flashlight off in a key room, the spirit's screen region is clearly brighter than the background (pixel check, screenshot).
- [ ] Playwright: a screenshot mid-entrance shows the spirit partly through the wall.
- [ ] Playwright: the spirit's lowest point stays at least 0.25 m above the floor.
Should:
- [ ] A screenshot of the spirit leaving through a wall.

## Test plan
Playwright: dark-room visibility, entrance and exit screenshots, float height from the debug handle.

## Decisions
- Supersedes spec 11's appearance decision (fading in about 2.8 m ahead of the player).
