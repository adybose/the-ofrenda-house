# 19: Spirit presence
Status: Done
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
spirit.drift(from: Vector3, to: Vector3, seconds: number): Promise<void>   // driven by spirit.update(time)
```

## Out of scope
The encounter's steps (11), naming the killer (21).

## Acceptance checks
Must:
- [x] Playwright (`?seed=42&skip=act1&debug=encounter`): with the flashlight off in a key room, the spirit's screen region is clearly brighter than the background (pixel check, screenshot).
- [x] Playwright: a screenshot mid-entrance shows the spirit partly through the wall.
- [x] Playwright: the spirit's lowest point stays at least 0.25 m above the floor.
Should:
- [x] A screenshot of the spirit leaving through a wall.

## Test plan
Playwright: dark-room visibility, entrance and exit screenshots, float height from the debug handle.

## Decisions
- Supersedes spec 11's appearance decision (fading in about 2.8 m ahead of the player).
- The spirit comes out through the wall behind its portrait and drifts towards the player, stopping about 2.2 m away; the camera turns to face the portrait, so the player watches it come through. The greeting waits for it to arrive (the line is fetched meanwhile).
- It leaves through the nearest wall of its room in about 2 s, fading as it goes; its keys are laid once it has gone (spec 18).
- The halo is an additive sprite whose soft radial texture is built in code from a byte array (no canvas), tinted like the spirit, fading with it.
- It floats 0.26 to 0.38 m above the floor (it used to dip to 0.20 m).
- Proof: `tests/e2e/spirit-presence.spec.ts`. In the dark (torch off), the spirit region averages 34 out of 255 against 0 in the corners (`artifacts/screenshots/19-spirit-dark.png`). `19-spirit-entering.png` is taken while the spirit straddles its portrait's wall (its centre 0.1 to 0.25 m out, its back still in the wall), after it started beyond the room; its lowest point stayed 0.30 to 0.38 m above the floor through the entrance and greeting; `19-spirit-leaving.png` shows it sinking into the nearest wall. The spec 11 translucency check still passes (on black 40, on white 248: the halo is additive).
- Debug: `window.__encounter` gained `entrance()`, `wallOffset()`, `drift()`, `spiritLowest()` and `leaving()`.
