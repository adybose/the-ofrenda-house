import { describe, expect, it } from 'vitest';
import { THOUGHTS, THOUGHT_SECONDS, createMonologue, monologueReducer, type MonologueContext, type MonologueEvent, type MonologueState, type Trigger } from '../../src/story/monologue';

const CTX: MonologueContext = { battery: 0.65, critical: false, hasMatchbox: false, matches: 8, hasCandle: false, heldLit: false, heldBurnLeft: 0, nearMatchbox: false, inLight: false };

/** Runs events and collects every thought shown, with its time. */
function play(events: MonologueEvent[], state: MonologueState = createMonologue()) {
  const shown: { id: string; text: string; at: number }[] = [];
  let s = state;
  for (const e of events) {
    s = monologueReducer(s, e);
    if (s.show) shown.push({ ...s.show, at: e.now });
  }
  return { state: s, shown };
}
const trigger = (t: Trigger, now: number, ctx: Partial<MonologueContext> = {}, vars = {}): MonologueEvent => ({ type: 'trigger', trigger: t, ctx: { ...CTX, ...ctx }, now, vars });
/** A tick every half second from `from` to `to`. */
const ticks = (from: number, to: number, ctx: Partial<MonologueContext> = {}, blocked = false): MonologueEvent[] =>
  Array.from({ length: Math.round((to - from) * 2) + 1 }, (_, i) => ({ type: 'tick', ctx: { ...CTX, ...ctx }, now: from + i / 2, blocked }));

describe('thoughts', () => {
  it('show once, unless they may repeat after a cooldown', () => {
    const once = play([trigger('solved', 0), ...ticks(0, 5), trigger('solved', 10), ...ticks(10, 20)]);
    expect(once.shown.map((s) => s.id)).toEqual(['solved']);
    const repeat = play([trigger('doorLocked', 0), ...ticks(0, 5), trigger('doorLocked', 30), ...ticks(30, 35), trigger('doorLocked', 70), ...ticks(70, 75)]);
    expect(repeat.shown.map((s) => s.at)).toEqual([0, 70]);
  });

  it('only when their condition holds', () => {
    expect(play([trigger('matchStruck', 0, { hasMatchbox: true, matches: 3 }), ...ticks(0, 5)]).shown).toEqual([]);
    expect(play([trigger('matchStruck', 0, { hasMatchbox: true, matches: 0 }), ...ticks(0, 5)]).shown.map((s) => s.id)).toEqual(['lastMatch']);
    const critical = play([trigger('battery', 0, { battery: 0.08, critical: true }), ...ticks(0, 10)]);
    expect(critical.shown.map((s) => s.id)).toEqual(['batteryCritical']);
    expect(play([trigger('torchDied', 0, { hasMatchbox: true, matches: 2, inLight: true }), ...ticks(0, 5)]).shown).toEqual([]);
  });

  it('nudge again later only if the player has not acted', () => {
    const idle = play([{ type: 'think', id: 'findCandle', now: 0 }, ...ticks(0, 30)]);
    expect(idle.shown.map((s) => s.id)).toEqual(['findCandle', 'findCandleAgain']);
    expect(idle.shown[1]!.at).toBeGreaterThanOrEqual(20);
    const acted = play([{ type: 'think', id: 'findCandle', now: 0 }, ...ticks(0, 10), ...ticks(10.5, 30, { hasMatchbox: true, hasCandle: true })]);
    expect(acted.shown.map((s) => s.id)).toEqual(['findCandle']);
  });

  it('show one at a time, and wait while something else holds the screen', () => {
    const queued = play([trigger('solved', 0), trigger('keyLaid', 0), ...ticks(0, 12)]);
    expect(queued.shown.map((s) => s.id)).toEqual(['solved', 'keyLaid']);
    expect(queued.shown[1]!.at - queued.shown[0]!.at).toBe(THOUGHT_SECONDS);
    const held = play([trigger('solved', 0), ...ticks(0, 8, {}, true), ...ticks(8.5, 10)]);
    expect(held.shown).toEqual([{ id: 'solved', text: expect.any(String), at: 8.5 }]);
  });

  it('check conditions every frame for tick thoughts', () => {
    const near = play([...ticks(0, 2), ...ticks(2.5, 6, { nearMatchbox: true })]);
    expect(near.shown).toEqual([{ id: 'seeCandle', text: 'A candle, and matches. Might come in handy.', at: 2.5 }]);
    const low = play(ticks(0, 3, { hasCandle: true, heldLit: true, heldBurnLeft: 50 }));
    expect(low.shown.map((s) => s.id)).toEqual(['candleLow']);
    // Not while something else holds the screen: a script's thought, thought then, comes first.
    const held = play([...ticks(0, 3, { nearMatchbox: true }, true), { type: 'think', id: 'findCandle', now: 3.2 }, ...ticks(3.5, 12, { nearMatchbox: true })]);
    expect(held.shown.map((s) => s.id)).toEqual(['findCandle', 'seeCandle']);
  });

  it('fill in the key’s room, and know the key to the way out', () => {
    const room = play([trigger('keyTaken', 0, {}, { name: 'Rosa', room: 'kitchen' }), ...ticks(0, 1)]);
    expect(room.shown[0]!.text).toBe("The key to Rosa's kitchen.");
    const exit = play([trigger('keyTaken', 0, {}, { exit: true }), ...ticks(0, 1)]);
    expect(exit.shown.map((s) => s.id)).toEqual(['exitKey']);
    const none = play([trigger('wrongName', 0, {}, { key: undefined }), ...ticks(0, 1)]);
    expect(none.shown.map((s) => s.id)).toEqual(['lastUntilDawn']);
    expect(play([trigger('wrongName', 0, {}, { key: 'key:cook' }), ...ticks(0, 1)]).shown).toEqual([]);
  });

  it('are all hand-written, unique, and short', () => {
    expect(new Set(THOUGHTS.map((t) => t.id)).size).toBe(THOUGHTS.length);
    for (const t of THOUGHTS) {
      const text = typeof t.line === 'string' ? t.line : t.line({ name: 'Rosa', room: 'kitchen' });
      expect(text.split(/\s+/).length, t.id).toBeLessThanOrEqual(14);
    }
  });
});
