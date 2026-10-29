# 20: Inner monologue
Status: Done
Depends on: 10, 17, 18

## Goal
The stranger thinks aloud in short lines on screen about what they have understood and what to do next, so the player always has a hint.

## Requirements
- THE SYSTEM SHALL show a thought as italic text, low and centred, typed quickly; it stays about 4 s, then fades.
- THE SYSTEM SHALL queue thoughts, never block controls, and hold them while an encounter, the journal or an ending is showing.
- THE SYSTEM SHALL use hand-written lines, never model output, so the hints are always right. Thoughts are not spoken.
- THE SYSTEM SHALL decide thoughts with pure rules: a table of trigger, condition and line; each line once per run unless it is marked repeatable with a cooldown; and follow-up hints when the player hasn't acted within a set time.
- THE SYSTEM SHALL let story scripts show a thought directly (`monologue.think(id)`).
- THE SYSTEM SHALL include at least these thoughts; each is wired by the spec that owns its trigger:

| Trigger | Thought |
| --- | --- |
| The patriarch's last Act 1 line (14) | "There must be a candle somewhere here." |
| 20 s later, without the candle | "Something on that stand, in the corner…" |
| Seeing the candle and matchbox | "A candle, and matches. Might come in handy." |
| Battery below 30% (17) | "The battery's going. I should save it." |
| Battery critical (17) | "Come on… not now." |
| The flashlight dies in the dark, with matches (17, 18) | "Matches. I have matches." |
| The last match struck (18) | "That was my last match. Only a lit candle can light another now." |
| A riddle solved (11, 18) | "Its candle lit by itself. La Sombra won't come in while it burns." |
| A key laid by the candle (18) | "Something glints by the candle." |
| A key picked up (18) | "The key to [name]'s [room]." |
| A riddle failed (11) | "Silence. Whatever it knew is lost." |
| Carrying a candle out of a sanctuary (18) | "Without its candle, this room is dark again." |
| A locked door without its key | "Locked. Someone in this house has the key." |
| The held candle nearly burnt down (18) | "This candle won't last much longer." |
| La Sombra seen while in light (12) | "It won't come near the light." |
| Chased in the dark (12) | "Light. I need light!" |
| A wrong name with no locked rooms left (21) | "Nothing… I'll have to last until dawn." |
| The exit key picked up (21) | "This one's different. The way out." |
| Dawn, and set free (22) | "The front door. I have to find my way back." |

- The rules SHALL be pure and unit-tested. No new dependency.

## Interfaces
```ts
// src/story/monologue.ts (pure)
THOUGHTS: readonly Thought[]          // { id, on: trigger, when?(ctx, vars), line, repeatEvery?, followUp?: { id, after, unless(ctx) } }
monologueReducer(state, event): state  // events: trigger { trigger, ctx, now, vars? } | think { id, now } | tick { ctx, now, blocked }; state.show: { id, text } when a thought is due
// src/ui/thought.ts
monologue.think(id: string): void
events: thoughtShown { id }
```

## Out of scope
Voicing the thoughts; the events themselves (owned by 12, 14, 17, 18, 21, 22).

## Acceptance checks
Must:
- [x] Unit: a thought shows once; a repeatable one waits for its cooldown; a condition stops it; a follow-up shows only if the player hasn't acted.
- [x] Unit: thoughts queue and wait while an encounter or the journal is open.
- [x] Playwright (`?seed=42&skip=act1`): standing by the candle and matchbox shows its thought (screenshot), and no thought shows during an encounter.
Should:
- [ ] Every line in the table is wired once its trigger's spec is built (checked by a unit test over `THOUGHTS`).

## Test plan
Vitest: monologue rules. Playwright: a thought on screen, none during an encounter.

## Decisions
- The rules see a small context each frame (`MonologueContext`: battery, matches, candles held, whether the player is by the matchbox, whether they are in light); thoughts with `on: 'tick'` are checked against it every frame, the rest fire on game events.
- The check above changed from "picking up the candle" to "standing by the candle and matchbox": the table has no thought for picking the candle up; seeing it is the one that fires there.
- A thought sits low and centred, below La Sombra's caption, and shows one at a time, 4.5 s apart.
- `accused` gained `key` (the key the answer left, if any), so "Nothing… I'll have to last until dawn." fires when a wrong name leaves none.
- Until spec 14 scripts Act 1, `?skip=act1` (which starts at the dead end) thinks "There must be a candle somewhere here." at the start.
- A thought already on screen is cleared at once when an encounter, the journal, a dialogue, the finale or an ending takes the screen (the test caught one lingering into an encounter).
- The thought sits 24% from the bottom, above the E prompt; La Sombra's caption moved up to 32%.
- Proof: `tests/unit/monologue.test.ts` (7 tests); `tests/e2e/thoughts.spec.ts`: at the dead end "There must be a candle somewhere here.", then by the stand "A candle, and matches. Might come in handy." (`artifacts/screenshots/20-thought.png`); no thought visible or logged while an encounter ran, and afterwards "Its candle lit by itself…".
- Not done (Should): the test that every line is wired waits for spec 22, whose dawn thought has no trigger yet; every other line is wired to its event in `src/story/thoughts.ts`.
