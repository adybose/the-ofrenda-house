# 25: Scare tuning
Status: Approved
Depends on: 07, 12, 13, 23, 24

## Goal
After playing spec 24: a heavy piano stinger, a film score that swells with fear, a heartbeat you can hear, bats in your face and chandeliers coming down far more often, La Sombra stepping out of the candlelight, and whispers loud and frequent enough to follow to the spirits.

## Requirements
- THE SYSTEM SHALL play a movie-style stinger: both hands slamming a low, dissonant piano cluster (hammered, slightly inharmonic piano notes) with a softer rebound hit just after, ringing for about 4 s. This replaces spec 24's string stinger.
- THE SYSTEM SHALL play suspense music driven by the player's fear (24): a low detuned drone that fades in above fear 0.1, a high tremolo string cluster above 0.45, and low pulse hits every 2.2 s from 0.55, easing in and out with fear, so it swells with every jump scare and fades as fear eases.
- The heartbeat SHALL be clearly audible as it rises: it plays on the stinger bus (the storm ducks under it) at gain 0.9 + 1.2 × fear.
- WHEN the player opens a closed door THE SYSTEM SHALL set off a door scare about 55% of the time (was 30%), on its own 12 s cooldown rather than spec 13's 25 s; in a room with a chandelier, about 70% of these SHALL bring the chandelier down.
- Bats from a door scare SHALL fly straight at the player's face, to within about 0.6 m of the camera, then veer up over their head.
- La Sombra's falling-object hazard (12, 24) SHALL first try to drop the chandelier of the room ahead, 2 to 5.5 m ahead and in view, and otherwise a painting on the wall ahead (24). Hazards SHALL come every 28 s ÷ (1 + 0.3 × threat) (was 45), the first after 35 s (was 60).
- La Sombra's ambush (24) SHALL come at a door or corridor corner about 30% plus 5% per threat of the time, at most every 30 s. WHILE the player's only light is a candle or match in hand (torch off), the chance SHALL be 65%, at most every 18 s, and it SHALL also be tried every 15 s as they walk, without a door or corner.
- Guide whispers (23) SHALL come every 12 to 18 s (was 25 to 35), from 2 cells along the way (was 4), at gain 1.8, full level within 4 m.
- The score levels, door-scare odds and ambush odds SHALL be pure and unit-tested. No new dependency.

## Interfaces
```ts
// src/audio/score.ts (pure)
scoreLevels(fear): { drone: number; strings: number; pulse: boolean }
SCORE.pulseEvery
// src/audio/engine.ts
PlayOptions.refDistance?: number; audioLevels().score: { drone, strings }
// src/scares/door-scares.ts (pure)
DOOR_SCARE_CHANCE = 0.55; DOOR_SCARE_COOLDOWN = 12; CHANDELIER_SHARE = 0.7
// src/spirits/shadow-controller.ts
ambushOdds(threat, byCandle): { chance, gap }   // pure, exported
// src/items: items.holdsFlame()
```

## Out of scope
New creatures, rooms or spirits; changing the fear model itself.

## Acceptance checks
Must:
- [ ] Unit: score levels are 0 when calm, rise with fear, the strings and pulse come in only above their thresholds, never above their caps.
- [ ] Unit: door scares about 55% of the time, a chandelier about 70% of those where one hangs; deterministic.
- [ ] Unit: ambush odds 30% + 5% per threat with a 30 s gap; 65% with an 18 s gap by candlelight.
- [ ] Playwright: the stinger is heavy (over 40% of its energy below 150 Hz) and loudest at the attack; every sound still renders without clipping.
- [ ] Playwright: after a scare the score's drone rises above 0.02.
- [ ] Playwright: a forced door scare brings a bat within 0.6 m of the camera.
- [ ] Playwright: La Sombra's crash hazard, facing a room's chandelier, brings it down.
- [ ] Playwright: with `&guide=3`, a whisper sounds within 4 m of the player.
- [ ] Playwright: holding a lit candle with the torch off (`&sombra=candle`), La Sombra steps out within 20 s.
Should:
- [ ] The user listens to the piano stinger, the score and the heartbeat, and plays to judge how often the scares come.

## Test plan
Vitest: score levels, door-scare odds, ambush odds. Playwright: audio renders, the score after a scare, a bat in the face, La Sombra's chandelier, a near whisper, La Sombra by candlelight.

## Decisions
- Asked for by the user on 31 October 2026, after playing spec 24.
- Amends 07 (the heartbeat), 12 (hazard timing and the chandelier), 13 (door scares' cooldown), 23 (whisper timing, distance and loudness) and 24 (the stinger, door-scare odds, ambush odds).
- Debug: `&sombra=candle` makes the next candlelit check bring La Sombra out.
