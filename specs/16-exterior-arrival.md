# 16: Exterior and arrival
Status: Done
Depends on: 03, 04, 05, 06, 07

## Goal
The game opens outside: a decaying mansion on its hill under a dim, rain-lashed night sky, thunder rolling and heavy rain all around. The player walks up the path; as they reach the door it creaks open by itself; once they step inside it slams and locks behind them, lightning flashes, and the outside is gone.

## Requirements
- WHEN the game starts THE SYSTEM SHALL place the player on the path just inside the gate, facing the mansion, with the whole exterior in view (unless `?skip=prologue` or `?skip=act1`, which start inside as before).
- THE SYSTEM SHALL build the exterior from code: a three-storey centre block with a columned porch over the real front door, two-storey east and west wings, a corner tower, slate roofs and chimneys, rows of tall windows (dark glass, frames, shutters, some crooked or boarded up, two upstairs windows faintly lit), and the grounds: mud, a gravel path, an iron fence and gate, dead trees, leaning gravestones, and the player's dead car on the road outside the gate.
- The exterior SHALL cover every interior chunk that can be loaded while outside, so no interior room shows from outside.
- THE SYSTEM SHALL show a dim (not black) night sky of drifting storm clouds with a faint moon glow, rain streaks falling around the player, a dim blue moonlight and blue-black fog outside.
- WHILE outside, lightning SHALL light the sky and the grounds from above (the mansion and trees casting shadows) and the window glass SHALL flare; the first strike comes about 4 s after the start.
- WHILE outside, THE SYSTEM SHALL play the storm unmuffled and heavy (`audio.setOutdoors(true)`).
- WHILE outside, the player SHALL stay inside the fence and SHALL only pass the façade through the front doorway.
- WHEN the player comes within 2.5 m of the front door THE SYSTEM SHALL swing it open by itself (with its creak).
- WHEN the player is 1.5 m inside THE SYSTEM SHALL slam the door shut and seal it (slam, then the lock turning), strike lightning a second later, remove the exterior, sky, rain and outdoor lighting, return the audio indoors, and resume normal chunk loading.
- The exterior layout and its colliders SHALL be pure data, unit-testable. No new dependency.

## Interfaces
```ts
// src/world/exterior.ts (pure)
exteriorLayout(seed): ExteriorLayout   // blocks, porch, trees, graves, fence, gate, car, path, colliders, start, door
exteriorCollision(layout): CollisionMap; composeCollision(...maps): CollisionMap
// src/render/exterior-mesh.ts, src/render/sky.ts, src/render/rain.ts
createExteriorScene(scene, textures, layout): { update(time, camera, flash), dispose() }
// src/story/arrival.ts
arrival.stage: 'outside' | 'doorOpen' | 'inside'; arrival.update(dt, playerX, playerZ)
// additions: house.sealFrontDoor(); doors.force(doorId, open); lightning outdoor mode and onFlash; audio.setOutdoors
events: arrivalStage { stage }
```

## Out of scope
Captions, the title screen and Act 1 (spec 14). Interior rooms (03, 04).

## Acceptance checks
Must:
- [x] Unit: the exterior covers x −22.5 to 45 along the façade; the start is inside the yard on the path, facing the door; the layout is deterministic.
- [x] Unit: on random walks the player never leaves the yard, and never passes the façade while the door is sealed; with the door open, walking to it leads inside through the doorway.
- [x] Playwright: the game starts outside (stage `outside`) with a dim, not black, sky above a darker ground; screenshot `16-exterior.png`.
- [x] Playwright: within 2.5 m of the door it opens by itself (`doorOpened` without pressing E); 1.5 m inside it is sealed, the stage is `inside` and the exterior is gone; screenshot `16-inside.png`.
- [x] Playwright: a strike outside brightens the sky and grounds; screenshot `16-exterior-lightning.png`.
- [x] Manual: fps at least 60 on the M1 Pro standing in the storm outside with strikes every 5 s, recorded here.
Should:
- [x] The spec 00 boot check reflects the new first frame (a dim exterior, not near-black).

## Test plan
Vitest: layout coverage, start, determinism, collision walks. Playwright: start, door opening and slamming, lightning outside, screenshots. Manual: fps outside.

### fps record
28 October 2026, Apple M1 Pro 16 GB, Playwright 1.64 Chromium, headed (ANGLE Metal), 1512 × 945, production build, `?seed=42&debug=hooks&lightning=5&mute=1`: outside in the storm, torch on, turning and walking for 60 s, 12 strikes. Ollama server running, idle.

The Mac was on battery at 16%, and Chromium caps animation at 30 fps on low battery (even a blank page ran at exactly 30), so the 60 fps target can't be seen directly. Measured instead with the frame-rate limit and vsync off, which shows how fast the game can actually render:

| Where | Average fps | 1% low |
| --- | --- | --- |
| Outside in the storm | 728 | 192 |
| Inside, running, strikes every 5 s (for comparison) | 705 | 154 |

Recording every frame from page start with normal vsync, the only slow frame is one of 150 ms, 0.2 s into loading (inside or out), before the game is shown. Uncapped runs add a single ~900 ms frame about 1.9 s after load; it never appears with vsync on, so it's an artifact of running without it. Re-measure on mains power with vsync on before release.

## Decisions
- This spec was added to the plan mid-build at the user's request ("start outside the house, the whole exterior visible, a dim stormy sky, heavy rain and thunder"). It takes the outdoor half of spec 14's prologue; spec 14 keeps the title, captions and Act 1.
- The mansion is a shell centred on the real front door (x 11.25 m): a three-storey centre block, two wings (x −25 to 47), a tower and a porch. Its outer face stands 15 cm in front of the interior's façade walls, with a doorway hole, so the house's own instanced front door is the one that swings. Big surfaces are tiled 1.5 × 3 m, since atlas tiles don't wrap. Four atlas tiles were added: slate, mud, gravel and bark.
- While outside, only the entrance wing chunk is built (seen through the doorway), and chunk loading waits until the door has slammed, so no interior room can show beyond the shell. After the slam the shell, sky, rain and outdoor lights are disposed (its walls would otherwise cut through interior rooms).
- The gate is shut behind the player, on the fence line; the yard is closed by the fence on three sides and the façade, with a gap only at the doorway.
- Outdoor light: a dim blue hemisphere and a faint moon, blue-black fog (0.012), a cloud-shader sky inside the camera's 60 m far plane, and one candle-lit upstairs window. Lightning outside comes from the sky behind the house (shadow box ±45 m), so the mansion stands black against the flash and the trees throw shadows towards the player; the sky, rain and every pane brighten with it. The first strike is 4 s in.
- Starting outside replaced the old start in the entrance hall: `?skip=prologue` keeps the old start, and the room-viewing tests (specs 04 and 06) now use it. The boot test now expects a dim exterior, not near-black.
- Startup: shaders are compiled with `compileAsync` and one warm-up frame (drawing both shadow maps) is rendered while still loading.
