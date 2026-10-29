# 10: Dialogue and journal UI
Status: Done
Depends on: 08

## Goal
The player reads spirit lines as typewriter text, answers by clicking or pressing 1 to 4 without ever typing, and keeps every clue card in a journal opened with J.

## Requirements
- THE SYSTEM SHALL draw the UI as an HTML and CSS overlay on the canvas, in period style, using only system serif fonts. No UI framework and no web fonts.
- WHEN a line is shown THE SYSTEM SHALL show the speaker's name and type the text out at about 40 characters per second, or over the speech duration when spec 09 provides one. A click or Space shows the rest of the line at once.
- WHEN choices are offered THE SYSTEM SHALL show 3 or 4 numbered options, selectable by click or keys 1 to 4, and only once the line has finished typing.
- WHILE dialogue or the journal is open THE SYSTEM SHALL disable movement controls.
- THE SYSTEM SHALL own the who-are-you replies: a pool of replies tagged `honest`, `evasive` or `lie`, each with a trust change. Each spirit offers 3 or 4, drawn with a seeded stream, always including at least one honest reply. Examples from the story: "A traveller lost in the storm" (honest), "Your family, I think" (honest, the largest trust gain), "None of your business" (evasive).
- THE SYSTEM SHALL track trust per spirit (0 to 100, starting at 50, clamped) and bucket it as wary, neutral or warm for spec 08's prompts. It SHALL also record whether the player has ever chosen a `lie` reply (`toldTheTruth`, for spec 14).
- WHEN a clue card is awarded THE SYSTEM SHALL show it briefly on screen and add it to the journal.
- WHEN the player presses J THE SYSTEM SHALL open or close the journal and pause the game world while it is open. The journal shows the clue cards grouped by kind (motive, means, opportunity, alibi), each with the spirit's name and portrait; the household members met so far; the keys held; and the time left.
- THE SYSTEM SHALL provide HUD slots for the interact prompt, battery, petals and the candle clock, for specs 05, 06, 12 and 14 to fill.
- Text SHALL be readable at 1080p with high contrast.
- Trust maths and reply drawing SHALL be pure and unit-tested. No new dependency.

## Interfaces
```ts
dialogue.say(opts: { speaker: string; line: string; voice?: VoiceSpec }): Promise<void>
dialogue.choose(options: { id: string; text: string }[]): Promise<string>
replies.draw(rng: Rng, characterId: CharacterId): Reply[]   // Reply { id, text, category, trustDelta }
trust.apply(state, characterId, reply): TrustState; trust.bucket(value): 'wary' | 'neutral' | 'warm'
journal.addClue(card: ClueCard); journal.addKey(keyId); hud.set(slot, value)
dialogue.close(); journal.meet(characterId); journal.setTimeLeft(text)   // ClueCard { factId, kind, holderId, text }
```

## Out of scope
When dialogue happens and what follows a choice (11), endings (14).

## Acceptance checks
Must:
- [x] Playwright debug page (`?debug=dialogue`, mock lines): the text appears progressively (two screenshots a moment apart).
- [x] Playwright: pressing 2 picks the second option; clicking an option picks it; number keys pressed mid-typewriter are ignored.
- [x] Playwright: with `/api/tts` answering 503, the line still appears in full.
- [x] Playwright: arrow keys do not move the camera while dialogue is open.
- [x] Unit: trust changes, clamping, buckets, and `toldTheTruth` turning false after any `lie` reply.
- [x] Unit: every drawn reply set has 3 or 4 replies with at least one honest reply, deterministic for a seed.
- [x] Playwright: J opens and closes the journal with cards grouped by kind; screenshot saved.
Should:
- [x] The player can mark a clue card as doubted in the journal.
- [x] The clue card toast does not cover the choices.

## Test plan
Vitest: trust maths, reply drawing. Playwright: debug dialogue page, key and click choices, TTS-off fallback, journal screenshot.

## Decisions
- `toldTheTruth` (the open question, settled by the user on 29 October 2026): true unless the player ever chooses a `lie` reply. Evasive replies are allowed.
- Advancing (the user's choice): a line stays until the player clicks or presses Space. The first press while it types shows the rest, the next moves on, and a ▸ shows when it is done. `say()` resolves when the player moves on, or when a choice under it is made. `choose()` shows its options under the current line once it has finished typing: to ask a question, call `say` without awaiting it, then `choose`.
- Interface additions: `dialogue.close()` (spec 11 ends conversations), `journal.meet(characterId)` (the household met so far) and `journal.setTimeLeft(text)` (spec 14 fills the time). A `ClueCard` is `{ factId, kind, holderId, text }`, made from a case-file fact, so the card always shows the case file's own words.
- Built: pure `src/dialogue/replies.ts` (10 replies: 4 honest, 3 evasive, 3 lies that cost trust because the spirits sense them; "Your family, I think." +20 is the largest gain) and `src/dialogue/trust.ts` (`TrustState`, `applyReply`, `trust`); `src/ui/typewriter.ts` (40 characters a second, or spread over the speech); the overlay in `src/ui/` (`theme.ts` with system serif fonts only, `dialogue-box.ts`, `journal.ts`, `hud.ts`, `clue-card.ts`). Saying a voiced line waits up to 1.5 s for its speech, then types over the speech's duration, or at 40 a second if speech failed or was slow.
- The journal pauses the world (player, doors, arrival, lightning, candles); the frame is still drawn behind it. The clue toast sits at the top of the screen, clear of the choices, and is hidden while the journal is open. The battery HUD slot is filled now from spec 06's `batteryChanged`; petals and clock wait for specs 12 and 14.
- `?debug=dialogue` plays a demo conversation with each spirit in turn (greeting, who-are-you, a debug line with trust and `toldTheTruth`, the spirit's clue and key); `&demo=0` leaves it to the test handle `window.__dialogue`. Screenshots: `artifacts/screenshots/dialogue-typing-1.png`, `-2.png`, `dialogue-choices.png`, `dialogue-clue-toast.png`, `journal.png`.
