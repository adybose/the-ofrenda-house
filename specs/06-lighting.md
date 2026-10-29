# 06: Lighting and darkness
Status: Done
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
// src/lighting/config.ts: every tunable (ambient, fog, flashlight, lightning, candles)
LIGHTING
// src/lighting/flashlight.ts
flashlight.toggle(); flashlight.setFlicker(level: number); flashlight.kill(seconds: number)  // spec 12 "lights dying"
flashlight.on; flashlight.level; flashlight.update(dt, camera)
// src/lighting/lightning.ts
lightning.strike(opts?: { strength?: number; distanceKm?: number }); lightning.hold(level | undefined); lightning.update(dt)
// src/lighting/battery.ts (pure)
createBattery(); stepBattery(state, dt): BatteryState; toggleFlashlight(state): BatteryState   // BatteryState { level, on, exhausted }
// src/lighting/flicker.ts (pure): flashlightIntensity({ time, level, flicker, killedUntil }): number
// src/lighting/schedule.ts (pure): createLightningSchedule(rng).next(): Strike; flashLevel(strike, t)
// src/lighting/windows.ts (pure): nearestWindow(rooms, x, z, range): { x, z, outward } | undefined
// src/lighting/candles.ts: CandleLights.update(dt, player, candlePoints)
events: flashlightToggled { on }, lightning { strength, distanceKm }, batteryChanged { level }
```

## Out of scope
Thunder and other sounds (07), Shadow behaviour (12), the HUD itself (10).

## Acceptance checks
Must:
- [x] Playwright: with the flashlight on, the mean brightness of the centre of the frame is well above the corners; with it off, the whole frame is below a near-black threshold.
- [x] Playwright light lab (`?debug=lightlab`): a pillar in the beam casts a visible shadow (pixel check and screenshot).
- [x] Playwright light lab with a forced strike: window-frame shadows appear on the floor (screenshot).
- [x] Unit: battery drain, recharge and the 10% restart rule.
- [x] Unit: the lightning schedule is deterministic for a seed.
- [x] Manual: fps stays at 60 on the M1 Pro during a strike with the flashlight on.
Should:
- [x] Flicker increases when `setFlicker` is raised.
- [x] `flashlight.kill(3)` turns the light off for 3 s, then restores it.

### fps record
28 October 2026, Apple M1 Pro 16 GB, Playwright 1.64 Chromium, headed (ANGLE Metal), 1512 × 945, production build, `?seed=42&debug=fps,hooks&walk=60&lightning=5`: the real unlit game, flashlight on, running pace, a strike every 5 s (11 in the run). Ollama server running, idle, no model loaded.

| Run | Average fps | 1% low | Worst frame |
| --- | --- | --- | --- |
| First version | 116.6 | 29.8 | 400 ms |
| No light `visible` toggling, shaders precompiled | 118.9 | 58.0 | 275 ms |
| Plus rebuilds spread over frames and shadow maps pre-warmed | 119.9 | 93.7 | 50 ms |

The remaining 50 ms worst frame is chunk streaming on crossing a chunk border, as measured in spec 04.

## Test plan
Vitest: battery model, lightning scheduler, flicker, nearest window. Playwright: brightness checks with the flashlight on and off, a strike's event, and the light lab's pillar and window measurements (shadow casting on versus off, read back from a render target) with screenshots. Manual: fps during strikes.

## Decisions
- The battery recharges while the light is off (6 min to drain, 10 min to recharge from flat), rather than battery pickups (open question, proposal accepted). The signature became `stepBattery(state, dt)` plus `toggleFlashlight(state)`, with an `exhausted` flag for the 10% restart rule.
- The flashlight starts off: the story has you switch it on after the door slams. F toggles it. It is held at hand height and its aim trails the view. Intensity 110, half-angle 0.42 rad; the fog density is 0.075.
- Lightning shines only through exterior windows (those whose outside cell is empty: the façade, corridor sides, the wing), preferring the player's own room, otherwise the nearest within 12 m. The directional light's shadow camera sits 1.3 m back up the light ray from the window: far enough that the room's ceiling and the wall above the window block light, but still inside the empty space outside, so nothing beyond the window interferes. Its shadow box is ±14 m (anything outside it would be lit as if unblocked) and its map is 2048 px, rendered only during a flash.
- Window glass is its own unshadowed mesh per chunk with a basic material: night glass glows faintly in the dark and flares during a flash. That makes a chunk up to 5 meshes (the spec 04 test now allows 5).
- Each strike ends with the house reshuffling (spec 03), out of sight in the dark. Rebuilt chunks are swapped in one per frame, since they are never in view.
- Lights are never toggled with `visible`, which would recompile every material; off means intensity 0, shadow maps update only while lit, both shadow maps are drawn once at startup, and `renderer.compile` warms every shader before the first frame. This took the worst frame during strikes from 400 ms to 50 ms.
- Candles: each key room has three candles beneath its spirit's portrait, and the ofrenda has its own; the 4 nearest within 14 m get a shadowless, flickering point light.
- The spec 00 boot test now checks for near-black (mean at most 6, 99th percentile at most 40 out of 255) instead of exactly black, because the ambient light is faint rather than zero. The flashlight-off check here uses the same threshold. "Centre well above the corners" is checked as a centre mean above 25 and at least four times the brightest corner.
- `?lightning=N` forces a strike every N seconds (fps runs and manual testing). Debug hooks gained `flashlight()`, `strike()`, `holdLightning()` and `lightningInfo()`. `?debug=lightlab` is the light lab.
- Superseded in part on 29 October 2026: spec 17 replaces the battery model (starts at 60–70%, never charges above 10%, cut-outs when critical); spec 18 replaces the candles (none lit at the start; the 4 nearest standing candles plus 1 held flame give light).
