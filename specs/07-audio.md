# 07: Audio engine
Status: In progress
Depends on: 05, 06

## Goal
The storm and the house sound real and close, all synthesised with the Web Audio API and placed in 3D, with no sound files.

## Requirements
- THE SYSTEM SHALL create the AudioContext on the first user gesture (the title screen click) and play nothing before it.
- THE SYSTEM SHALL synthesise continuous ambience: rain (filtered noise with slowly varying intensity) and wind (noise through a moving band-pass), muffled with a low-pass when the player is far from a window.
- WHEN a `lightning` event fires THE SYSTEM SHALL play thunder after a delay of about 3 s per km of `distanceKm` (clamped to 0.5 to 6 s), sharper and louder when close.
- THE SYSTEM SHALL synthesise these one-shots: door creak, door slam, key lock and unlock, footsteps per surface (wood, tile, carpet) driven by `footstep` events, flashlight click, grandfather clock chime (strike count as a parameter), scare stingers, whispers, bat flutter, rat squeaks and a cat scream.
- THE SYSTEM SHALL play a heartbeat whose rate and volume follow `setTension(0..1)` (driven by spec 12).
- THE SYSTEM SHALL place world sounds with HRTF panners, with the listener following the camera.
- THE SYSTEM SHALL apply convolution reverb from procedurally generated impulse responses for small, medium and large rooms, crossfading when the player changes room.
- THE SYSTEM SHALL mix through ambience, effects, stinger and voice buses into a master bus, ducking ambience while a voice plays (spec 09 uses the voice bus).
- THE SYSTEM SHALL cap concurrent one-shots (about 32), reusing the oldest.
- WHEN the URL has `?mute=1` THE SYSTEM SHALL keep the master gain at 0 (for automated tests).
- No new dependency.

## Interfaces
```ts
// src/audio/engine.ts
audio.unlock(): Promise<void>; audio.state   // 'none' until the first gesture
audio.play(name: SoundName, opts?: { position?: Vec3; gain?: number; param?: number; delay?: number }): void
audio.setTension(level: number); audio.setRoomSize(size: 'small' | 'medium' | 'large')
audio.setWindowDistance(metres: number); audio.setOutdoors(on: boolean); audio.setListener(position, forward); audio.update()   // once a frame
audio.voiceBus: AudioNode; audio.renderOffline(name, seconds, param?): Promise<Float32Array>   // tests
// src/audio/synths.ts: SYNTHS, SOUND_NAMES, SoundName
// rain, wind, thunder (param: closeness 0..1), creak, slam, lock, unlock, footstepWood, footstepTile,
// footstepCarpet, footstepStone, flashlightClick, clock (param: strikes), stinger, whisper, bat, rat, cat,
// heartbeat (param: strength)
// src/audio/game-audio.ts: connectGameAudio(audio, house) wires game events to sounds
thunderDelay(distanceKm: number): number          // src/audio/thunder.ts (pure)
generateImpulse(size, sampleRate, rng)            // src/audio/impulse.ts (pure)
whiteNoise / pinkNoise / brownNoise(rng, length), rainGrains(rng, rate, seconds)  // src/audio/noise.ts (pure)
OneShotPool(cap)                                  // src/audio/pool.ts (pure)
```

## Out of scope
Spirit speech (09), when scares fire (13), when the Shadow hunts (12).

## Acceptance checks
Must:
- [x] Playwright: every named sound renders in an OfflineAudioContext with non-silent output, no NaN and a peak at or below 1.0.
- [x] Playwright: the AudioContext is not running before the first click and is running after it.
- [x] Unit: thunder delay grows with distance and stays within the clamp.
- [x] Unit: the impulse response generator is deterministic and gives longer tails for larger rooms.
- [ ] Manual listening checklist in this spec, ticked: rain, wind, thunder, creak, slam, lock, footsteps, heartbeat, stingers, whispers, bat, rat, cat, clock.
  - [ ] rain  - [ ] wind  - [ ] thunder  - [ ] creak  - [ ] slam  - [ ] lock  - [ ] footsteps
  - [ ] heartbeat  - [ ] stingers  - [ ] whispers  - [ ] bat  - [ ] rat  - [ ] cat  - [ ] clock
Should:
- [x] The number of concurrent one-shots never exceeds the cap during a 60 s stress test.
- [x] Ambience ducks while the voice bus is active.

## Test plan
Vitest: thunder delay, impulse responses. Playwright: offline renders of each sound, context unlock. Manual: listening checklist with headphones.

## Listening
`npm run dev`, headphones on, then:
- `/?debug=soundboard`: click anywhere to start the rain and wind, then a button per sound (thunder overhead and far, the clock striking 1 and 6), a tension slider for the heartbeat, room size for the reverb, distance from a window for the muffling, and left or right to hear the 3D placement.
- `/?seed=42&skip=act1&lightning=10`: the real thing. Click to start audio, F for the torch, E to open the exit, and walk: footsteps change on tile, carpet and stone, doors creak and slam, and thunder follows each flash after its distance delay.

## Decisions
- Merged into main on 29 October 2026 ahead of the listening check, at the user's request, so spec 16 could follow. The status stays In progress until the checklist is ticked.
- Nothing audio exists until the first click or key press (`connectGameAudio` listens for it); spec 14's title-screen click will be that gesture.
- Rain and wind loop indefinitely at no ongoing cost. Rain is three noise layers: a broadband roar, a low body (rain on roof and ground) and an 8 s loop of drop impacts from `rainGrains` (white-noise grains with sharp decays and random brightness, plus heavier splats). Wind is brown noise through a band-pass whose frequency and level drift on slow oscillators. The rain's level swells and fades on a seeded random path. (A first version scheduled every raindrop for hours ahead and stalled unlocking for over 10 s; a second rendered drops as sine pings, which rang like wind chimes. A unit test now checks the drops' loudest moments are noise, not tones: spectral flatness 0.49 against 0.003 for the old pings.)
- Thunder has a sub-bass boom (42 to 24 Hz) under the crack and the rolling rumble, and far strikes rumble for up to 8 s.
- `setOutdoors(true)` opens the muffle filter fully and makes the rain 60% louder: the storm outside the mansion (spec 16).
- Thunder plays on the ambience bus (so it is muffled deep inside the house), after `thunderDelay(distanceKm)`, with closeness taken from the strike's strength. The muffling low-pass runs from about 7.6 kHz beside a window down to 600 Hz far from any, from the nearest exterior window.
- Routing: footsteps, doors, keys and the torch go to the effects bus (with room reverb); door sounds are placed at the door with HRTF panners; stingers go to their own dry bus; the master has a limiter. Closing a door plays the slam at half level; a sealed door rattles and thuds; trying a locked door plays `lock`; unlocking plays `unlock`.
- Ducking is automatic: the voice bus is metered every frame and the ambience drops to 35% while anything plays on it, so spec 09 only has to connect to `voiceBus`.
- The heartbeat runs from 55 to 150 bpm and grows louder with `setTension`; it is silent at 0. Spec 12 drives it.
- Levels were checked from offline renders: every sound peaks between 0.1 and 0.7 on its own (carpet footsteps and the bat flutter are deliberately soft).
- Debug: `?debug=soundboard`; hooks gained `soundNames`, `renderSound`, `audioState`, `ambienceGain`, `masterGain`, `testVoice` and `setTension`.
