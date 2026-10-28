# 06: Lighting and darkness
Status: Approved
Depends on: 04, 05

## Goal
The house is near-black except for the flashlight's focused beam and lightning flashing through the tall windows, both casting real-time shadows.

## Requirements
- THE SYSTEM SHALL use near-black ambient light and dark exponential fog, both tunable in one config.
- THE SYSTEM SHALL attach the flashlight to the camera as a narrow spotlight with a soft penumbra and a 1024 px shadow map, trailing the view slightly so it sways.
- WHEN the player presses F THE SYSTEM SHALL toggle the flashlight and emit `flashlightToggled`.
- THE SYSTEM SHALL flicker the flashlight subtly at all times, harder when the battery is low, and when `setFlicker(level)` is called (spec 12, when the Shadow is near).
- THE SYSTEM SHALL drain the battery while the flashlight is on (about 6 minutes from full to empty) and recharge it slowly while off. At 0 the flashlight switches off and cannot be switched on until it reaches 10%. The level is published for the HUD.
- THE SYSTEM SHALL schedule lightning at seeded random intervals (about 20 to 60 s), and also on demand from story scripts. A strike is 2 or 3 bright bluish pulses over about 400 ms from a directional light through the nearest tall windows, casting window-frame shadows across the floor.
- WHEN lightning strikes THE SYSTEM SHALL emit `lightning { strength, distanceKm }` (spec 03 reshuffles from it, spec 07 delays thunder by it).
- THE SYSTEM SHALL have at most 2 shadow-casting lights at a time (flashlight and lightning). Candles in key rooms and on the ofrenda are flickering point lights without shadows, at most 4 active.
- The battery model and lightning scheduler SHALL be pure and seeded. No new dependency.

## Interfaces
```ts
flashlight.toggle(); flashlight.setFlicker(level: number); flashlight.kill(seconds: number)  // spec 12 "lights dying"
lightning.strike(opts?: { strength?: number; distanceKm?: number })
battery: stepBattery(state, on: boolean, dt): BatteryState
events: flashlightToggled { on }, lightning { strength, distanceKm }, batteryChanged { level }
```

## Out of scope
Thunder and other sounds (07), Shadow behaviour (12), the HUD itself (10).

## Acceptance checks
Must:
- [ ] Playwright: with the flashlight on, the mean brightness of the centre of the frame is well above the corners; with it off, the whole frame is below a near-black threshold.
- [ ] Playwright light lab (`?debug=lightlab`): a pillar in the beam casts a visible shadow (pixel check and screenshot).
- [ ] Playwright light lab with a forced strike: window-frame shadows appear on the floor (screenshot).
- [ ] Unit: battery drain, recharge and the 10% restart rule.
- [ ] Unit: the lightning schedule is deterministic for a seed.
- [ ] Manual: fps stays at 60 on the M1 Pro during a strike with the flashlight on.
Should:
- [ ] Flicker increases when `setFlicker` is raised.
- [ ] `flashlight.kill(3)` turns the light off for 3 s, then restores it.

## Test plan
Vitest: battery model, lightning scheduler. Playwright: brightness checks and light-lab screenshots. Manual: fps during a strike.

## Open questions
- The story only says "a draining battery". Proposal: recharge while off, as above, rather than battery pickups.
