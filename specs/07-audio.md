# 07: Audio engine
Status: In progress
Depends on: 05, 06

## Goal
The storm and the house sound real and close, all synthesised with the Web Audio API and placed in 3D, with no sound files.

## Requirements
- THE SYSTEM SHALL create the AudioContext on the first user gesture (the title screen click) and play nothing before it.
- THE SYSTEM SHALL synthesise continuous ambience: rain (filtered noise with slowly varying intensity) and wind (noise through a moving band-pass), muffled with a low-pass when the player is far from a window.
- WHEN a `lightning` event fires THE SYSTEM SHALL play thunder after a delay of about 3 s per km of `distanceKm` (clamped to 0.5 to 6 s), sharper and louder when close.
- THE SYSTEM SHALL synthesise these one-shots: door creak, door slam, key lock and unlock, footsteps per surface (wood, tile, carpet) driven by `footstep` events, flashlight click, grandfather clock chime (strike count as a parameter), scare stingers, whispers, bat flutter, rat squeaks, a cat's cry (a meow) and a cat's scream for the scares (spec 13).
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
- [ ] Manual listening checklist in this spec, ticked: rain, wind, thunder, creak, slam, lock, footsteps, heartbeat, stingers, whispers, bat, rat, cat, cat scream, clock.
  - [ ] rain  - [ ] wind  - [ ] thunder  - [ ] creak  - [ ] slam  - [ ] lock  - [ ] footsteps
  - [ ] heartbeat  - [ ] stingers  - [ ] whispers  - [ ] bat  - [ ] rat  - [ ] cat  - [ ] cat scream  - [ ] clock
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
- Rain and wind loop indefinitely at no ongoing cost. Rain is a broadband roar, a low body (rain on roof and ground) and two loops of drop impacts from `rainGrains` (white-noise grains with sharp decays and random brightness), 7.3 s and 11.8 s long and played at slightly different speeds, so together they don't repeat for minutes. Each loop's drop density drifts through gusts and lulls rather than staying even. Heavier `splat` drops are played by the engine at random times, so they never recur in the same place. Wind is brown noise through a band-pass whose frequency and level drift on slow oscillators. The rain's level swells and fades on a seeded random path. (A first version scheduled every raindrop for hours ahead and stalled unlocking for over 10 s; a second rendered drops as sine pings, which rang like wind chimes. A unit test now checks the drops' loudest moments are noise, not tones: spectral flatness 0.49 against 0.003 for the old pings.)
- Thunder has a sub-bass boom (42 to 24 Hz) under the crack and the rolling rumble, and far strikes rumble for up to 8 s. It peaks at about 0.87 close and 0.79 far.
- The storm (rain, wind, splats) has its own level: full outside, and indoors 30% far from any window rising to 55% beside one, as well as muffled. `setOutdoors(true)` opens the muffle filter fully and makes the rain 60% louder: the storm outside the mansion (spec 16).
- Thunder plays on its own channel of the ambience bus, after `thunderDelay(distanceKm)`, with closeness taken from the strike's strength: full level outside, 65% inside, and low-passed indoors from about 4.2 kHz beside a window to 1.2 kHz far from any. The storm's low-pass runs from about 7.6 kHz beside a window down to 600 Hz far from any, from the nearest exterior window.
- Routing: footsteps, doors, keys and the torch go to the effects bus (with room reverb); door sounds are placed at the door with HRTF panners; stingers and whispers go to their own dry bus (no room reverb, so a whisper is right at the ear); the master has a limiter. Closing a door plays the slam at 1.4 (the limiter catches its peaks); a sealed door rattles and thuds; trying a locked door plays `lock`; unlocking plays `unlock`.
- Ducking is automatic: the voice and stinger buses are metered every frame and the ambience drops to 35% while anything plays on either, so spec 09 only has to connect to `voiceBus`.
- The heartbeat runs from 55 to 150 bpm and grows louder with `setTension`; it is silent at 0. Spec 12 drives it.
- Retuned on 29 October 2026 after the first listening check:
  - The creak was a low sawtooth that croaked like a toad. It is now a shrill squeal falling from about 650 to 280 Hz with stick-slip jitter, through 1.5 and 3 kHz resonances, loudest at the start and fading over about 1.2 s as the door swings.
  - Lock and unlock were sine pings and sounded digital. They are now built from filtered noise and wooden knocks: lock is the brass knob rattling, the latch catching and the door knocking in its frame; unlock is a key scraping in, two clicks with a wooden body, the bolt sliding back and a clunk.
  - Tile footsteps were a bright 3.2 kHz click that read as a clock tick in the entrance hall. They are now a heel knock with a short gritty scuff.
  - The grandfather clock now ticks: `clockTick` (tick, then a lower tock), placed at the clock, once a second while the player is in its room (the entrance hall).
  - The soundboard starts indoors and has an inside/outside toggle; it was loading the game outside, where the rain buried the stingers and whispers.
- Retuned again on 29 October 2026 after the second listening check, with the sounds rebuilt from how the real ones are made (the third check, below, changed several of these):
  - The creak was still a tone. A real creak is stick-slip friction: the hinge sticks and lets go at an uneven rate, and each slip rings the wood. It is now `stickSlip` pulses (rate jittered between half and twice, after Farnell's *Designing Sound* door) through the door's six wood resonances (62.5 to 790 Hz) and eight short panel echoes, plus two narrow hinge resonances. The slips start at 550 to 750 a second, a shrill squeal, and slow to about 25 a second, separate cracks, as the door swings and fades.
  - Lock and unlock are now modal synthesis: a contact click rings four inharmonic metal modes (a latch on its strike plate), bouncing two or three times a few milliseconds apart, and the same click rings the wooden door. Turning the knob or key is a short friction scrape. Lock is two jiggles of the knob against the bolt and the spring snapping it back; unlock is the key sliding over the pins, the turn, the bolt thrown back and the knob settling.
  - Overhead thunder (closeness above 0.6) opens with a ripping crack, a dense, uneven run of shocks that thins out over 0.35 to 0.6 s, instead of a faint clap. All thunder goes through a soft clipper for weight, and plays at 1.4 outside and 0.9 inside (the master limiter catches its peaks).
  - Wind 0.45 to 0.25, rain louder, the rain's random swell narrowed to 75 to 100%, and the window muffle opens to 9.6 kHz: the rain stands well above the wind.
  - The slam is heavier (wood body, the latch snapping home, soft clipping) and plays at full level. Tile footsteps are stone footsteps a little higher (1.9 kHz, a heel at 140 Hz); every footstep plays at 0.9 walking and 1.2 running, up from 0.6 and 0.9. The clock ticks louder.
  - The stinger lasts about 4.5 s instead of 2.5 s.
  - The whisper is whispered speech: `whisperScore` writes a phrase of made-up syllables (s, sh, f, h, t and k hiss over vowels a, e, i, o and u, about four a second, swelling mid-phrase); breath through three formants that glide between vowels, close to one ear, on the dry bus.
  - The cat is a steady meow, not a wavering yowl: no vibrato, a smooth arch of pitch (about 520 up to 720 and down to 460 Hz) over about 0.9 s, and formants gliding "mi-a-ow".
  - Sources: Farnell, *Designing Sound*, via the [creaking door chapter of Designing Sound in SuperCollider](https://en.wikibooks.org/wiki/Designing_Sound_in_SuperCollider/Creaking_door); Avanzini, Serafin and Rocchesso on friction sounds; van den Doel and Pai on modal synthesis; the noiseless lock unit patent US2869913 (the latch's snap is the bolt striking metal); Schötz et al. and Nicastro (2004) on meows.
- Retuned a third time on 29 October 2026 after the third listening check:
  - Overhead thunder went muffled abruptly once the crack ended, leaving only a rumble low-passed at about 480 Hz. Close strikes now last 7 to 8 s: a pink-noise roll carries on from the crack and darkens (4 kHz to 300 Hz) and fades over about 4 s, the rumble's low-pass slides down over the whole strike (from about 2.5 kHz), and its lurches ride a long decay.
  - The slam is a louder thud: a long low thump (brown noise under 250 Hz, 0.4 s), a deeper boom (70 to 35 Hz), harder soft clipping, played at 1.4.
  - Lock and unlock rang like a bell: the metal modes rang for up to 60 ms. Modal synthesis is gone. `latchClick` is a dry wooden doorknob click: a 4 ms tick at about 2.2 kHz and a 12 ms woody clack at about 650 Hz a few milliseconds apart, with a small knock through the door. Lock is click, clack and a bump in the frame, twice, then a click as the knob returns; unlock is small ticks as the key goes in, a click-clunk as the bolt goes back and a last soft click. The friction scrapes are gone.
  - The creak is smoother: the slip rate wanders only 0.8 to 1.25 times (the `jitter` option), slows to about 120 a second (a groan, not cracks), with 3 ms slips, an 80 ms attack and a 4 kHz low-pass.
  - The stinger is about 3.5 s (from 4.5 s).
  - The whisper is a smoother, undecipherable hush: only soft consonants (sh, h, s and f; t and k removed), longer vowels, and one continuous breath whose level glides between syllables (dipping to half between syllables, 15% between words) instead of stopping, with slower formant glides and a 5 kHz low-pass.
  - A separate `catScream` for spec 13's scares: about 1 s, a high arched cry (about 900 up to 1400 and down to 700 Hz) roughened by a fast irregular flutter in its loudness (stick-slip pulses at about 60 a second), "aaow" formants, a spitting hiss and soft clipping. `cat` stays the meow.
- Retuned a fourth time on 29 October 2026 after the fourth listening check:
  - The slam is a louder thud with deeper bass: a 48 to 30 Hz sub (1.2 s), a 95 to 55 Hz body, brown noise under 200 Hz, driven harder into the soft clipper so the harmonics carry on laptop speakers, with the bright parts a third quieter. RMS 0.21 (bass 0.20), up from 0.13 (0.11). `renderSound` gained `lowRms`, the level under about 150 Hz.
  - The whisper is slower (about two or three syllables a second, longer vowels and breaths) and smoother (the breath swells over about 120 ms and eases over 150 ms, dipping to 60% between syllables and 25% between words). There are six fixed versions (`WHISPER_VARIANTS`: each a seeded phrase of 2.2 to 3.2 s, its own mouth size and ear); `whisper` with param 1 to 6 plays one, and the engine picks one at random for every in-game whisper, never the one just played (`pickVariant`). The soundboard has a button for each and a random one.
  - Carpet footsteps were barely audible (peak 0.11): now a muffled thud and the soft brush of the pile, peak 0.23, still the softest floor.
  - The meow is higher (about 650 up to 900 and down to 600 Hz) and more natural: a voice-like source (harmonics falling as 1/n^1.5, not a sawtooth's buzz), a living unsteadiness of about 0.5% (far too small to waver), cat-sized formants gliding "m", "ia", "ow" with a closed-mouth hum at the start, a little breath, and its level following the pitch.
  - The cat scream is more natural: a warning hiss, then a yowl rising fast from about 800 to 1300 Hz, holding with a slow uneven drift of about 3%, and falling away; its harshness comes from a second voice at half the pitch fading in and out and from breath through the formants (the mechanical flutter is gone); a spit at the end.
- Levels were checked from offline renders. Peaks on their own: thunder 0.97 (close; its first half second is at 0.56 RMS, up from 0.31, and it sounds for 7.2 s), slam 0.95 (RMS 0.21, up from 0.085 at the start), cat scream 0.72, heartbeat 0.67, whisper 0.64, rain 0.61, unlock 0.57, clock 0.48, creak 0.48, stinger 0.44, lock 0.43, clock tick 0.39, footsteps 0.33 to 0.37 (carpet 0.23), cat 0.32, splat 0.23, rat 0.22, bat 0.15, wind 0.10.
- Debug: `?debug=soundboard`; hooks gained `soundNames`, `renderSound`, `audioState`, `ambienceGain`, `masterGain`, `audioLevels`, `testVoice`, `setTension`, `setOutdoors` and `ticking`.
