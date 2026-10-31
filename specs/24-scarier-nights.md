# 24: Scarier nights
Status: Done
Depends on: 07, 12, 13, 14, 19

## Goal
The scares land: a movie stinger, bats and a chandelier crashing down as the player opens a door, La Sombra stepping out in front of them and drawn by their darkness, cats that glare and scream, a patriarch who comes out of his own portrait at them, and a heart that races and shows it.

## Requirements
- THE SYSTEM SHALL keep the player's fear (0 to 1): it jumps with each scare, hazard, sight of La Sombra, a chase (which holds it high), being caught, the patriarch's reveal and a cat's scream, and eases off over about 10 s. Fear alone drives the heartbeat (07), which SHALL be clearly audible, and the HUD SHALL show a red heart beside the torch pulsing at the heart rate, with the rate in bpm (68 to 160).
- THE SYSTEM SHALL play a movie-style stinger: a sudden, high, screeching dissonant string cluster with a bright scrape at the attack and a low boom under it.
- Bats SHALL be black.
- WHEN the player opens a closed door THE SYSTEM SHALL sometimes (about 30%, within spec 13's cooldown and blocking) set off a scare from the room beyond: 1 to 3 bats flying at the player with their calls (in a room with a chandelier, half the time also bringing it down 2 to 3 m ahead of the player, in view and never on them), or rats running at them. A door already open sets nothing off.
- La Sombra's falling-object hazard (12) SHALL drop no more chandeliers: it SHALL bring a painting down off the wall the player is facing, 1.2 to 3 m ahead, and only then.
- WHEN the player opens a door, or turns a corner in a corridor, THE SYSTEM SHALL sometimes (about 15% plus 5% per threat, at most once a minute) bring La Sombra out 4 to 6 m ahead of them. If they have light it laughs and flees, saying a line; if not, it charges.
- WHEN the player's light goes out THE SYSTEM SHALL draw La Sombra to them 5 to 10 s later, unless the light comes back first, with a line about their darkness or fear.
- La Sombra SHALL be taller and more ominous, with glowing dark-red eyes and a dark-red rim that show in total darkness; its voice SHALL be louder; its lines SHALL vary (never repeating one of the last five of a kind).
- THE SYSTEM SHALL seat a cat with glowing eyes on a piece of furniture in about one ordinary room in seven, meowing now and then while the player is near. WHEN the player opens that room's door, or comes within 1.5 m, the cat SHALL scream, leap down and bolt, knocking a vase off to shatter, or else bringing a small picture down off the wall.
- Act 1: THE SYSTEM SHALL bring the patriarch out through the wall behind his portrait (now empty) to about 1 m in front of the player before he speaks; after Act 1 he SHALL stay in the Act 1 corridor and, whenever the player comes back into it, turn to them and say one of several lines (at most every 30 s).
- Fear, the door scares, La Sombra's rules, its lines, the cats' placement and where a painting can fall SHALL be pure and unit-tested. No new dependency.

## Interfaces
```ts
// src/story/fear.ts (pure)
createFear(); fearReducer(state, { type: 'spike', amount } | { type: 'floor', level } | { type: 'tick', dt }); bpm(level)
// src/scares/door-scares.ts (pure)
doorScare(room: Room, rng: Rng, force?): 'bats' | 'batsChandelier' | 'rats' | undefined
paintingSpot(room: Room, player: { x, z, yaw }): { x, z, side } | undefined
// src/scares/cats.ts (pure)
placeCats(room: Room, furniture: Furniture[], seed, all?): CatSeat[]
// src/spirits/lines.ts (pure)
DARK_LINES, FLEE_LINES, PATRIARCH_LINES; pickLine(list, recent, rng)
// src/spirits/shadow.ts: events attract; emits laugh, darkLine
events: doorOpened { doorId, byPlayer? }, shadowLaughed, vaseShattered, patriarchSpoke { line }, fear { bpm }
```

## Out of scope
New creatures or rooms; the ending screens.

## Acceptance checks
Must:
- [x] Unit: fear spikes, holds and eases off; bpm 68 to 160.
- [x] Unit: door scares only for a door the player opened from closed, a chandelier only where one hangs, about 30% of the time, deterministic.
- [x] Unit: La Sombra laughs when it confronts; darkness draws it from stalking, withdrawn or lost, not when dormant, caught or held off.
- [x] Unit: lines never repeat within the last five; cats only on furniture tops, about one room in seven; a painting only on a wall ahead within 1.2 to 3 m.
- [x] Playwright: after a scare the HUD heart reads over 110 bpm and pulses faster (screenshot).
- [x] Playwright: opening a door into a room with a chandelier (forced) sets off bats and brings the chandelier down 2 to 3 m ahead, in view (screenshot).
- [x] Playwright: La Sombra at a door (forced): with light it laughs, speaks and flees; in the dark it charges (screenshot of its eyes in the dark).
- [x] Playwright: switching the torch off draws La Sombra within 12 s with a darkness line.
- [x] Playwright: a cat on furniture with glowing eyes (screenshot); opening its door makes it scream and a vase shatter.
- [x] Playwright: the patriarch comes out from behind his portrait to within 1.3 m of the player; after midnight, coming back into the corridor, he speaks.
- [x] Every sound still renders without clipping, the stinger brighter than before.
Should:
- [ ] The user listens to the stinger, heartbeat, scream, shatter and La Sombra's voice and finds them right.

## Test plan
Vitest: fear, door scares, painting spots, La Sombra's rules, lines, cats. Playwright: the heart, a door scare, La Sombra at a door and drawn by darkness, cats, the patriarch, audio renders.

## Decisions
- Asked for by the user on 31 October 2026, after finding the scares weak.
- Debug: `&doorscare=bats|batsChandelier|rats` forces a door scare, `&sombra=door` brings La Sombra at the next door, `&cats=all` seats a cat wherever one fits.
- La Sombra's voice is driven twice as hard into a soft limiter (tanh), not simply doubled, which clipped (peak 1.76): it is now peak 0.96, RMS 0.26.
- A chandelier brought down by bats is the room's own: its hanging instance is taken down and it falls from where it hung, in front of the player as they open the door (2 to 5 m ahead).
- Each cat, painting and dropped chandelier builds its own geometry, freed when it goes (the render test caught a leak when cats' rooms unloaded and reloaded).
- Proof: unit tests `fear`, `door-scares` (with painting spots), `shadow` (laugh, attract, ambush), `lines`, `cats`; `tests/e2e/scarier.spec.ts`: the heart (`artifacts/screenshots/24-heart.png`), bats and the chandelier through a door (`24-door-bats.png`, `24-door-chandelier.png`), La Sombra at a door in the light, laughing and fleeing (`24-sombra-door.png`), and in the dark, charging with its eyes burning (`24-sombra-eyes.png`), drawn by darkness with a line, the cat's eyes (`24-cat-eyes.png`) and its scream and shattered vase; `tests/e2e/story.spec.ts`: the patriarch out of his portrait to a step away (`24-patriarch.png`) and speaking again in his corridor; `tests/e2e/shadow.spec.ts`: a painting falling ahead (`12-painting.png`); `tests/e2e/audio.spec.ts`: the stinger's brightness (2.1 kHz) and every sound under 1.
- Not yet checked (Should): the user listening to the stinger, heartbeat, scream, shatter and La Sombra's voice.
