# 20: Inner monologue
Status: Approved
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
THOUGHTS: readonly Thought[]          // { id, trigger, when?, line, repeatEverySeconds?, followUp? }
monologueReducer(state, event, now): { state; show?: string }
// src/ui/thought.ts
monologue.think(id: string): void
events: thoughtShown { id }
```

## Out of scope
Voicing the thoughts; the events themselves (owned by 12, 14, 17, 18, 21, 22).

## Acceptance checks
Must:
- [ ] Unit: a thought shows once; a repeatable one waits for its cooldown; a condition stops it; a follow-up shows only if the player hasn't acted.
- [ ] Unit: thoughts queue and wait while an encounter or the journal is open.
- [ ] Playwright (`?seed=42&skip=act1`): picking up the candle shows its thought (screenshot), and no thought shows during an encounter.
Should:
- [ ] Every line in the table is wired once its trigger's spec is built (checked by a unit test over `THOUGHTS`).

## Test plan
Vitest: monologue rules. Playwright: a thought on screen, none during an encounter.
