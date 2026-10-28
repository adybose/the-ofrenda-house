# 04: Rendering and procedural materials
Status: Done
Depends on: 03

## Goal
The house looks like a decaying 1931 mansion in a dark, grainy, lo-fi PS1-era style, made entirely from code, and it holds 60 fps.

## Requirements
- WHEN a chunk loads THE SYSTEM SHALL build meshes for its floors, walls, ceilings, doors, door frames, tall windows and simple furniture per room kind; WHEN a chunk unloads THE SYSTEM SHALL dispose its geometry and any materials or textures it alone uses.
- THE SYSTEM SHALL generate every texture in code (wallpaper patterns such as damask and stripes, floorboards, tiles, plaster with cracks and damp stains, doors, picture frames) at low resolution (64 to 128 px) with nearest-neighbour filtering. Generators write into an RGBA byte array from a seeded stream, so they can be unit-tested in Node; textures are cached and shared.
- THE SYSTEM SHALL generate a portrait for each character from their traits (role, age, clothing colours, personality as expression), plus these variants: an empty frame (Act 1), the killer smiling (possessed ending), the painter's last painting of baby Elena (true ending) and the player's own face (possessed ending).
- THE SYSTEM SHALL provide a prop kit built from primitives: chandelier, grandfather clock, fireplace, mirror, ofrenda table, candles and marigold petals.
- THE SYSTEM SHALL render the scene to a low-resolution target (around 360 px tall) upscaled with nearest filtering, then apply one full-screen pass for colour reduction with dithering, film grain and a vignette. No post-processing library.
- THE SYSTEM SHALL merge static geometry per chunk to keep draw calls low.
- WHEN the URL has `?debug=fullbright` THE SYSTEM SHALL add a flat debug light (until spec 06 lands, and for screenshots afterwards); WHEN it has `?debug=fps` THE SYSTEM SHALL show a frame-time overlay.
- No new dependency.

## Interfaces
- `buildChunkMesh(chunk: Chunk, textures: TextureCache): THREE.Group` and `disposeChunkMesh(group)`; `setDoorOpen(group, doorId, amount)` swings a door from 0 (closed) to 1 (open) for spec 05.
- `createTextureCache(seed, caseFile): TextureCache` holds the surface atlas, the portrait atlas and their two materials, shared by every chunk. `uv(kind)` and `portraitUv(characterId | 'smile' | 'empty' | 'elena' | 'player')` give atlas rectangles.
- `generateTexture(kind: TextureKind, rng: Rng): { width; height; data: Uint8ClampedArray }`.
- `generatePortrait(character: Character, variant: PortraitVariant, rng: Rng): PixelImage`, with variants `normal`, `empty`, `smile`, `elena` and `player`.
- `props.*` factories (for example `props.chandelier(textures)`), used by specs 12, 13 and 14: chandelier, grandfatherClock, fireplace, mirror, ofrendaTable, candle, marigoldPetals.
- `src/world/units.ts`: `CELL_SIZE` (1.5 m), `ROOM_HEIGHT`, `EYE_HEIGHT`, `cellCentre(cell)`, `worldToCell(x, z)`. World x is east, z is south (north is -z), y is up.
- `src/world/furniture.ts`: `furnishRoom(room, seed): Furniture[]`, pure, so collision (05) uses the same footprints the renderer draws.
- `createPostPipeline()` and `WorldView` (applies a `ChunkDiff` to the scene).
- Debug flags: `?debug=fullbright`, `?debug=fps` (overlay), `&walk=60` (scripted walk, result in `body[data-fps-result]`), `?debug=portraits` (portrait sheet). Any debug flag installs `window.__ofrenda` for tests.

## Out of scope
Real lighting and shadows (06), player movement (05; use a debug camera on a scripted path), ghost and Shadow shaders (11, 12).

## Acceptance checks
Must:
- [x] Playwright screenshots with `?seed=42&debug=fullbright` of a filler room, a key room and a corridor, saved to `artifacts/screenshots/04-*.png`.
- [x] Texture and portrait generators give identical pixels for the same seed and different pixels for different characters (hash test).
- [x] After walking away from a chunk and back, `renderer.info.memory` geometry and texture counts return to the baseline (read through a debug hook in Playwright).
- [x] Manual: average fps at least 60 and 1% low at least 50 over a 60 s scripted walk on the M1 Pro with Ollama running, recorded in this spec.
Should:
- [x] At most 150 draw calls per frame in a typical room.
- [x] A screenshot sheet of all portrait variants for seed 42.

### fps record
28 October 2026, Apple M1 Pro 16 GB, Playwright 1.64 Chromium, headed (ANGLE Metal), 1512 × 945 window, production build, `?seed=42&debug=fps,fullbright&walk=60`. Ollama server running, but idle with no model loaded, so there was no inference load on the GPU.

| Run | Average fps | 1% low | Worst frame | Distance | Chunks crossed | Max draw calls |
| --- | --- | --- | --- | --- | --- | --- |
| Walking pace (1.4 m/s) | 119.8 | 83.4 | n/a | 84 m | 3 | 31 |
| Running pace (2.5 m/s) | 120.0 | 101.5 | 25 ms | 149 m | 4 | 37 |

120 fps is the display's refresh cap. Re-measure with `gemma3:4b` generating alongside once spec 08 lands, and again with real lights and shadows in spec 06.

## Test plan
Vitest: texture and portrait determinism. Playwright: room screenshots, portrait sheet, memory baseline after unload. Manual: fps overlay on the M1 Pro.

## Decisions
- A cell is 1.5 m (corridors are one cell wide). Ceilings are 2.8, 3.1 or 3.6 m by room size class. Wall faces sit 10 cm inside each room; at convex corners they reach the inset corner so no gaps open.
- Every surface texture lives in one 512 × 640 atlas, and each wall or floor quad covers exactly one cell and maps to one tile, so no texture wrapping is needed. One `MeshLambertMaterial` (vertex colours for per-room tint and fake corner shading) draws all static geometry, so each chunk is one static mesh, plus portraits, instanced doors and instanced chandeliers: at most 4 draw calls per chunk. Doors and chandeliers are instanced so specs 05 and 12 can move them.
- Portraits live in a second, per-run atlas: the household on one row, then the killer's smile, the patriarch's empty frame, baby Elena and the stranger's portrait. Each key room shows its spirit's portrait.
- Furniture placement is pure data in `src/world` (against walls, never on doorways, anchors or windows), so spec 05 can collide with it.
- The scene renders to a 360 px-tall target with nearest filtering; one shader pass applies gamma, film grain, a 4 × 4 Bayer dither into 32 levels per channel, and a vignette. Grain fades to nothing on pure black, so unlit space stays exactly black (the spec 00 boot test still sees an all-black frame until spec 06 adds light).
- `?debug=fullbright` adds an ambient and a hemisphere light. Without it the house is unlit and black, as spec 06 expects.
