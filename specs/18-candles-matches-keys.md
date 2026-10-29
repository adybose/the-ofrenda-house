# 18: Candles, matches and keys
Status: Approved
Depends on: 03, 05, 06, 10, 11, 17

## Goal
The player finds a candle and a box of matches where the patriarch leaves them, lights their way with matches and candles that burn out, sees each solved spirit's candle light itself, and collects the keys spirits leave beside their candles.

## Requirements
- THE SYSTEM SHALL place, as anchors (spec 03, pure):
  - in every key room, a small table in front of the spirit's portrait with a candle in its stand, **unlit**;
  - at the Act 1 corridor's dead end, an unlit candle in a stand and a matchbox beside it;
  - in about 1 in 6 filler rooms (seeded), a spare unlit candle in a stand.
- THE SYSTEM SHALL no longer light any candle at the start: the three floor candles in key rooms and spec 11's extra candle are removed.
- THE SYSTEM SHALL keep items in a pure reducer: each candle's place (a stand, the player's hand or pocket), whether it is lit, and its burn time left (about 8 minutes, tunable; no candle lasts the night); the matches left (8 in the box); a burning match (about 15 s); and keys lying on tables.
- WHEN the player presses E on a candle, the matchbox or a key THE SYSTEM SHALL pick it up. The hand holds one candle, lit or unlit, and a pocket up to 4 unlit candles: an unlit candle goes to the hand if it is empty, otherwise to the pocket; a lit candle goes to the hand, moving an unlit held candle to the pocket, or is refused ("Your hands are full") if the hand holds a lit one.
- WHEN the player presses E on an empty stand while holding a candle THE SYSTEM SHALL set the candle in it, lit or not.
- WHEN the player presses M THE SYSTEM SHALL strike a match if any are left, giving a small warm light for about 15 s; if the held candle is unlit, the match lights it.
- WHEN the player presses E on an unlit candle while holding a flame (a burning match or a lit candle) THE SYSTEM SHALL light it. Once the matches are gone, a lit candle is the only way to light another.
- WHEN the player presses B THE SYSTEM SHALL blow out the held candle, keeping what is left of it.
- WHEN a candle burns down THE SYSTEM SHALL leave a stub that cannot be lit. WHEN the held candle burns out or is set down THE SYSTEM SHALL bring the next pocket candle to hand.
- WHEN a spirit's riddle is solved THE SYSTEM SHALL light the candle in that spirit's stand by itself, if the stand holds one.
- WHEN a spirit leaves THE SYSTEM SHALL lay its keys on its table beside the candle: its own lock-plan key (spec 03) whether it was solved or fell silent, so a locked room never becomes unreachable, and any key from naming the killer (spec 21). WHEN the player picks up a key THE SYSTEM SHALL add it to the keys held and to the journal.
- THE SYSTEM SHALL answer, for spec 12: whether the player is in light (the flashlight is lit, a match burns, the player holds a lit candle, or the player's room has a lit candle in a stand), and whether a room is a sanctuary (a solved spirit's room whose stand holds a lit candle).
- THE SYSTEM SHALL keep a solved or visited key room in the house after a reshuffle, placing it again within reach like an unvisited one, with its candle and keys as they were; and pin the cells of a filler room whose candle the player has touched.
- THE SYSTEM SHALL draw the table, stand, candle (shrinking as it burns, with a flickering flame), stub, matchbox and brass key, and show the held candle or match at the bottom right of the view with its own shadowless point light. At most the 4 nearest standing candles and 1 held flame give light.
- THE SYSTEM SHALL fill the HUD with the matches left, the candles carried with the held candle's burn left, and the keys held, replacing the petals slot.
- The items reducer and the light and sanctuary queries SHALL be pure and unit-tested. No new dependency.

## Interfaces
```ts
// src/items/items.ts (pure)
itemsReducer(state: ItemsState, action: ItemsAction): ItemsState
// actions: pickUp { id } | place { standId } | strikeMatch | lightCandle { id } | blowOut | tick { dt }
//          | spiritSolved { characterId } | keysLeft { characterId, keyIds }
inLight(state, player: { roomId; flashlightLit: boolean }): boolean
isSanctuary(state, roomId, resolved: ReadonlyMap<CharacterId, 'reward' | 'silence'>): boolean
ITEMS  // candleSeconds 480, matchSeconds 15, matches 8, pocket 4
// src/world: AnchorKind gains 'candleTable' | 'candleStand' | 'matchbox' | 'spareCandle'
events: itemPickedUp { kind, id }, matchStruck { left }, candleLit { id }, candleOut { id, reason: 'burnt' | 'blown' },
        keyPickedUp { keyId }   // keyAwarded { keyId } now means "laid on the table"
```

## Out of scope
La Sombra's behaviour (12), naming the killer and the exit key (21), the thoughts (20), Act 1's script (14).

## Acceptance checks
Must:
- [ ] Unit: picking up, the hand and pocket rules, setting down, striking matches until none are left, lighting from a match and from a lit candle, blowing out, burning down to a stub.
- [ ] Unit: no candle is lit at the start; solving a spirit lights its stand's candle; an empty stand stays dark.
- [ ] Unit: a silent key holder still leaves its key; keys appear only after the spirit has left.
- [ ] Unit: `inLight` and `isSanctuary` for every source of light, and a sanctuary is lost when its candle is taken or burns out.
- [ ] Property test (spec 03's harness): solved and visited key rooms stay in the house and in reach after 50 reshuffles.
- [ ] Playwright (`?seed=42&skip=act1&debug=items`): pick up the candle and matchbox at the dead end, strike a match, light the candle (screenshots).
- [ ] Playwright (mock LLM): after a solved encounter, the table's candle is lit and the key lies beside it (screenshot); E takes the key and it is in the journal.
Should:
- [ ] Playwright: carrying the candle out of a sanctuary clears `isSanctuary`.

## Test plan
Vitest: items reducer, light and sanctuary queries, anchor placement, the reach property test. Playwright with the mock LLM and TTS off: pick-ups, a match, lighting, a solved room's candle and key.

## Decisions
- Supersedes spec 06's candle decision (three candles burning beneath each portrait), spec 11's extra candle left after a reward, and spec 11's keys going straight into the pocket on a reward.
- Implements spec 03's decision that a failed spirit still leaves its key, which spec 11 did not.
- Fixes a gap in spec 03: a visited key room in a rebuilt chunk was dropped and never placed again.
- Debug: `?debug=items` installs `window.__items`; `&matches=N` sets the matches in the box.
