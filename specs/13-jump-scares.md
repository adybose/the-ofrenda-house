# 13: Jump scares
Status: Approved
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
scares.fire(kind: 'bat' | 'rat' | 'cat', anchor: Anchor, opts?: { force?: boolean }): void
scareScheduler(state, event, now): { state; fire?: ScareTrigger }
events: scareFired { kind, position }
```

## Out of scope
Shadow hazards (12), the Act 1 script itself (14).

## Acceptance checks
Must:
- [ ] Unit: over a simulated 10 minutes of random triggers, no two scares are closer than the cooldown, and none fire while dialogue or the journal is active.
- [ ] Unit: trigger placement is deterministic for a seed.
- [ ] Playwright (`?debug=scares&fire=bat|rat|cat`): a mid-animation screenshot of each creature.
- [ ] Playwright: firing a scare plays a stinger (audio event logged).
- [ ] A forced scare fires even during the cooldown.
Should:
- [ ] Rats run away from the flashlight beam.
- [ ] A slight camera shake on bat scares.

## Test plan
Vitest: scheduler cooldown and blocking, placement determinism. Playwright: creature screenshots and the stinger log.
