# 17: Torch battery
Status: Approved
Depends on: 06

## Goal
The flashlight starts the night only two-thirds charged and only runs down: it dims and flickers more as it fades, cuts out without warning when nearly flat, and comes back weak and flickering, so light becomes something the player has to manage.

## Requirements
- WHEN a run starts THE SYSTEM SHALL set the battery to a seeded level between 60% and 70%.
- WHILE the flashlight is on THE SYSTEM SHALL drain the battery (a full battery would last about 10 minutes, tunable).
- THE SYSTEM SHALL never charge the battery above 10% (the floor). WHILE the flashlight is off and the level is below 10% THE SYSTEM SHALL let it recover to 10% (from 5% in about 40 s).
- THE SYSTEM SHALL dim the beam as the level falls: full intensity at 50% or more, about 35% of it at 10%.
- THE SYSTEM SHALL flicker the beam periodically at every level, more often as the level falls, and constantly below 10%. `setFlicker` (spec 12) adds to this.
- WHILE the level is below 10% (critical) THE SYSTEM SHALL cut the beam out suddenly, for 1.5 to 4 s, every 8 to 20 s, from a seeded stream.
- WHEN the level reaches 5% THE SYSTEM SHALL switch the flashlight off; it cannot be switched on again until the battery has recovered to 10%.
- THE SYSTEM SHALL publish whether the flashlight is giving light right now (`flashlight.lit`: on, and not cut out or killed by a hazard), for spec 12.
- THE SYSTEM SHALL show the battery bar in red while the level is critical.
- The battery, cut-out schedule and flicker SHALL stay pure and seeded. No new dependency.

## Interfaces
```ts
// src/lighting/battery.ts (pure)
BATTERY  // startMin 0.6, startMax 0.7, drainSeconds 600, floor 0.1, offLevel 0.05, recoverSeconds 40
createBattery(rng: Rng): BatteryState; stepBattery(state, dt): BatteryState; toggleFlashlight(state): BatteryState
createCutOuts(rng: Rng).next(level): { at: number; seconds: number } | undefined   // only when critical
// src/lighting/flicker.ts (pure): flashlightIntensity({ time, level, flicker, killedUntil, cutUntil }): number
flashlight.lit   // boolean
events: batteryChanged { level, critical }, flashlightCutOut { seconds }
```

## Out of scope
Matches and candles (18), La Sombra (12), the monologue's battery thoughts (20).

## Acceptance checks
Must:
- [ ] Unit: the starting level is between 60% and 70% and deterministic for a seed.
- [ ] Unit: once below 10%, the level never rises above 10%; above 10%, it never rises at all.
- [ ] Unit: the flashlight switches off at 5% and cannot be switched on again until 10%.
- [ ] Unit: cut-outs happen only below 10%, last 1.5 to 4 s, and are deterministic for a seed.
- [ ] Unit: intensity falls as the level falls, and the flicker rate rises.
- [ ] Playwright: screenshots at 65% and at 8% (dimmer, measured as the centre's mean brightness); with `&battery=0.08`, `flashlight.lit` goes false during a cut-out.
Should:
- [ ] The battery bar is red when critical (screenshot).

## Test plan
Vitest: battery, cut-out schedule, flicker. Playwright: brightness at two levels, a cut-out at 8%, the red bar.

## Decisions
- Supersedes spec 06's battery decision (starts full, recharges to full in 10 minutes while off, 6 minutes to drain, restart at 10% after running flat).
