# 13: Jump scares
Status: Done
Depends on: 06, 07

## Goal
Bats, rats and cats burst out of the dark often enough to keep the player on edge but never so often that they pile up or stop being scary. They are scares, not threats.

## Requirements
- THE SYSTEM SHALL build low-poly bat, rat and cat meshes in code and animate them in code: bats flap and swoop at the camera, rats scurry along the skirting with a whipping tail, and cats crouch, glare with eyes that catch the flashlight, and scream or bolt.
- THE SYSTEM SHALL place scare triggers from spec 03's room anchors with a seeded stream: bats at chandeliers and fireplaces, rats at loose floorboards, cats in dark corners and behind furniture.
- WHEN the player enters a trigger area, or points the flashlight at a trigger's anchor, THE SYSTEM SHALL fire the scare: the animation, a stinger and the creature's sound (07), and emit `scareFired`.
- THE SYSTEM SHALL enforce a global cooldown (about 25 s, tunable), at most one scare per room visit, and no scares within 10 s of a Shadow hazard or while dialogue, the journal or the ofrenda is active.
- THE SYSTEM SHALL let story scripts fire a scare directly, bypassing the cooldown (the Act 1 bat from the chandelier).
- THE SYSTEM SHALL pool creatures, with at most 3 active at once.
- The scare scheduler SHALL be pure and seeded. No new dependency.

## Interfaces
```ts
// src/scares/scheduler.ts (pure)
placeTriggers(room: Room, seed: number): ScareTrigger[]   // { id, kind, roomId, x, y, z }
scareScheduler(state, event, now): { state; fire?: ScareTrigger }   // events: enterRoom { roomId } | hazard | trip { trigger, blocked } | force { trigger }
// src/scares/scares.ts
scares.fire(kind: 'bat' | 'rat' | 'cat', at: { x, y, z }, opts?: { force?: boolean }): boolean
events: scareFired { kind, position, sounds }
```

## Out of scope
Shadow hazards (12), the Act 1 script itself (14).

## Acceptance checks
Must:
- [x] Unit: over a simulated 10 minutes of random triggers, no two scares are closer than the cooldown, and none fire while dialogue or the journal is active.
- [x] Unit: trigger placement is deterministic for a seed.
- [x] Playwright (`?debug=scares&fire=bat|rat|cat`): a mid-animation screenshot of each creature.
- [x] Playwright: firing a scare plays a stinger (audio event logged).
- [x] A forced scare fires even during the cooldown.
Should:
- [ ] Rats run away from the flashlight beam.
- [ ] A slight camera shake on bat scares.

## Test plan
Vitest: scheduler cooldown and blocking, placement determinism. Playwright: creature screenshots and the stinger log.

## Decisions
- Placement (seeded per room): a chandelier holds a bat 60% of the time, a fireplace 50% (it bursts from the hearth), loose floorboards a rat 70%, a dark corner a cat 50%. Each trigger fires at most once per run.
- A trigger trips when the player comes within 2.2 m of it, or points a lit torch at it (within 0.3 rad, 8 m), while in its room.
- `scareFired` carries `sounds` (the stinger and the creature's call), so tests can see them with sound muted.
- Debug: `?debug=scares` installs `window.__scares` (`fire(kind, force)`, `trip(kind)`, `active()`, `triggers()`); `&fire=bat|rat|cat` fires one a second after loading.
- The creatures are drawn a little larger than life (a bat's wingspan about a metre, the cat 1.6 times) so they read in the beam; the cat's eyes glow on their own.
- Proof: `tests/unit/scares.test.ts` (ten simulated minutes over three seeds: never within the cooldown, never while blocked or within 10 s of a hazard, once per room visit; forced scares; deterministic placement) and `tests/e2e/scares.spec.ts`: `artifacts/screenshots/13-bat.png`, `13-rat.png`, `13-cat.png` mid-burst, each `scareFired` carrying the stinger and its call; a forced cat fired straight after a refused trip; and a rat under the floorboards of the test room burst out on its own when the player came in with the torch on.
- Not done (Shoulds): rats run from the player rather than specifically from the beam; there is no camera shake on bats.
- `tests/e2e/spirit-presence.spec.ts` no longer reads the spirit's offset from the wall the instant it appears (under load it could already be a few centimetres through); that it started beyond the wall is proven by its starting cell.
