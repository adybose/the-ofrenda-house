# 26: La Sombra's grasp
Status: Done
Depends on: 12, 18, 24, 25

## Goal
Walking into La Sombra by candlelight is deadly: a gust blows the candles out and it lunges to possess the player, who has a moment to light up again. The player learns to keep away from it.

## Requirements
- WHILE the player's only light is flame (a candle in hand, a burning match, or candles standing in the room) with the torch off, and they are not in a sanctuary, WHEN they walk towards La Sombra within 2.5 m (closing at 0.5 m/s or more), or stand within 1.2 m of it, THE SYSTEM SHALL blow out every one of those flames with a gust, and La Sombra SHALL lunge at the player and seize them.
- The gust SHALL never put out the torch. With the torch on, La Sombra threatens and flees as before (12, 24).
- By candlelight alone La Sombra SHALL hold its ground while it threatens, rather than flee, so a player who walks at it reaches it.
- WHEN La Sombra comes within 1 m of a player in the dark THE SYSTEM SHALL seize them in the same way (this replaces spec 12's instant catch).
- WHILE La Sombra holds the player THE SYSTEM SHALL give them 1.5 s: switching the torch on or striking a match (which lights a held candle) SHALL throw it off; it laughs, threatens and withdraws. Otherwise the player is caught and possessed (12, 14).
- The seizure SHALL be frightening: a whoosh of wind, the stinger, a line in its voice, the figure right in front of the eyes, fear at its height.
- The gust and seize rules SHALL be pure and unit-tested. No new dependency.

## Interfaces
```ts
// src/spirits/shadow.ts (pure)
GRASP = { reach, approach, tooClose, grace, lunge, hold }
blowsOut({ distance, approach, flameOnly, inLight }): boolean
ShadowMode 'grasping'; ShadowEmit 'gust' | 'grab' | 'repelled'
tick event: + flameOnly, approach
// src/items
ItemsAction { type: 'gust'; standIds }; items.gust(standIds); items.flameOnly(torchLit, cell)
// events
shadowGrasped { gust: boolean }; shadowRepelled {}
// src/audio/synths.ts
gust
```

## Out of scope
New endings; the torch's battery; changing La Sombra's speeds, spawns or hazards.

## Acceptance checks
Must:
- [x] Unit: the gust comes when the player closes in on it within 2.5 m, or stands within 1.2 m, by flame alone; never with the torch on, or in the dark.
- [x] Unit: a seizure is thrown off by light within 1.5 s, and ends in capture after it; a dark chase within 1 m seizes rather than catches at once.
- [x] Unit: the gust puts out the held candle, the match and the room's standing candles, and nothing else.
- [x] Playwright: walking at La Sombra by candlelight, the candle is blown out and it seizes the player (screenshot); striking a match throws it off.
- [x] Playwright: switching the torch on throws it off.
- [x] Playwright: doing nothing, the player is possessed.
- [x] Playwright: with the torch on, walking at it brings no gust.
Should:
- [ ] The user plays it and judges the distances and the 1.5 s.

## Test plan
Vitest: `blowsOut`, the grasping transitions, the items gust. Playwright: `tests/e2e/sombra-grasp.spec.ts` (match, torch, possessed, torch-on), and spec 12's dark catch still possesses.

## Decisions
- Asked for by the user on 31 October 2026: "the player actively avoids walking directly into" La Sombra. They chose that the gust never kills the torch, and that the dark catch gets the same grace.
- Amends 12 (the catch now has a 1.5 s grace) and 18 (a gust blows candles out). The story bible's La Sombra paragraph says so too.
- It holds the player 0.8 m from the eyes, stooping 0.75 m so its eyes meet theirs: at 0.55 m its eye glow filled the view like a mask.
- Proof: `tests/unit/shadow.test.ts` (`blowsOut`, the gust from threatening and hunting, the grace, a dark chase seizing) and `tests/unit/items.test.ts` (the gust); `tests/e2e/sombra-grasp.spec.ts`: walking at it by candlelight, the candle went out and it held the player 0.80 m away (`artifacts/screenshots/26-grasp.png`), and a struck match drove it off; the torch drove it off; doing nothing, the player was possessed 1.5 s after the seizure; with the torch on there was no gust. Spec 12's dark catch now seizes first, then possesses. The `gust` sound renders without clipping.
