# 04: Rendering and procedural materials
Status: Approved
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
- `buildChunkMesh(chunk: Chunk, textures: TextureCache): THREE.Group` and `disposeChunkMesh(group)`.
- `generateTexture(kind: TextureKind, rng: Rng): { width; height; data: Uint8ClampedArray }`.
- `generatePortrait(character: Character, variant: PortraitVariant, rng: Rng): PixelImage`.
- `props.*` factories (for example `props.chandelier()`), used by specs 12, 13 and 14.

## Out of scope
Real lighting and shadows (06), player movement (05; use a debug camera on a scripted path), ghost and Shadow shaders (11, 12).

## Acceptance checks
Must:
- [ ] Playwright screenshots with `?seed=42&debug=fullbright` of a filler room, a key room and a corridor, saved to `artifacts/screenshots/04-*.png`.
- [ ] Texture and portrait generators give identical pixels for the same seed and different pixels for different characters (hash test).
- [ ] After walking away from a chunk and back, `renderer.info.memory` geometry and texture counts return to the baseline (read through a debug hook in Playwright).
- [ ] Manual: average fps at least 60 and 1% low at least 50 over a 60 s scripted walk on the M1 Pro with Ollama running, recorded in this spec.
Should:
- [ ] At most 150 draw calls per frame in a typical room.
- [ ] A screenshot sheet of all portrait variants for seed 42.

## Test plan
Vitest: texture and portrait determinism. Playwright: room screenshots, portrait sheet, memory baseline after unload. Manual: fps overlay on the M1 Pro.
