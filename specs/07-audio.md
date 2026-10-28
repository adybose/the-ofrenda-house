# 07: Audio engine
Status: Approved
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
audio.unlock(): Promise<void>
audio.play(name: SoundName, opts?: { position?: Vec3; gain?: number; param?: number }): void
audio.setTension(level: number); audio.setRoomSize(size: 'small' | 'medium' | 'large')
audio.voiceBus: AudioNode; audio.renderOffline(name, seconds): Promise<Float32Array>   // tests
thunderDelay(distanceKm: number): number
```

## Out of scope
Spirit speech (09), when scares fire (13), when the Shadow hunts (12).

## Acceptance checks
Must:
- [ ] Playwright: every named sound renders in an OfflineAudioContext with non-silent output, no NaN and a peak at or below 1.0.
- [ ] Playwright: the AudioContext is not running before the first click and is running after it.
- [ ] Unit: thunder delay grows with distance and stays within the clamp.
- [ ] Unit: the impulse response generator is deterministic and gives longer tails for larger rooms.
- [ ] Manual listening checklist in this spec, ticked: rain, wind, thunder, creak, slam, lock, footsteps, heartbeat, stingers, whispers, bat, rat, cat, clock.
Should:
- [ ] The number of concurrent one-shots never exceeds the cap during a 60 s stress test.
- [ ] Ambience ducks while the voice bus is active.

## Test plan
Vitest: thunder delay, impulse responses. Playwright: offline renders of each sound, context unlock. Manual: listening checklist with headphones.
