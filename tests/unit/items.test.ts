import { describe, expect, it } from 'vitest';
import type { CharacterId } from '../../src/case/types';
import {
  ITEMS,
  candle,
  candleAt,
  createItems,
  hasFlame,
  inLight,
  isSanctuary,
  itemsReducer,
  useLabel,
  type ItemsAction,
  type ItemsState,
} from '../../src/items/items';

const ACT1 = 'stand:act1-corridor';
const COOK = 'cook' as CharacterId;
const COOK_STAND = 'stand:key:cook';
const SPARE = 'stand:r:3,4:0';

const run = (state: ItemsState, ...actions: ItemsAction[]) => actions.reduce(itemsReducer, state);
const use = (standId: string, matchbox = false): ItemsAction => ({ type: 'use', standId, matchbox });
const tick = (dt: number): ItemsAction => ({ type: 'tick', dt });
const strike: ItemsAction = { type: 'strikeMatch' };
/** The matchbox and the Act 1 candle in hand. */
const equipped = () => run(createItems(), use(ACT1, true), use(ACT1));

describe('picking up at the Act 1 stand', () => {
  it('takes the matchbox first, then the candle, unlit', () => {
    let s = createItems();
    expect(useLabel(s, ACT1, true)).toBe('Take the matches');
    s = itemsReducer(s, use(ACT1, true));
    expect(s.hasMatchbox).toBe(true);
    expect(s.matches).toBe(ITEMS.matches);
    expect(s.emits).toEqual([{ name: 'itemPickedUp', kind: 'matchbox', id: 'matchbox' }]);
    expect(useLabel(s, ACT1, true)).toBe('Take the candle');
    s = itemsReducer(s, use(ACT1, true));
    expect(s.hand).toBe(`candle:${ACT1}`);
    expect(candle(s, s.hand!)).toEqual({ lit: false, burnLeft: ITEMS.candleSeconds });
    expect(candleAt(s, ACT1)).toBeUndefined();
    expect(useLabel(s, ACT1, true)).toBe('Set the candle down');
  });
});

describe('the hand and the pocket', () => {
  it('puts a second unlit candle in the pocket, up to its limit', () => {
    let s = equipped();
    s = itemsReducer(s, use(COOK_STAND));
    expect(s.hand).toBe(`candle:${ACT1}`);
    expect(s.pocket).toEqual([`candle:${COOK_STAND}`]);
    for (let i = 0; i < ITEMS.pocket - 1; i++) s = itemsReducer(s, use(`stand:r:${i}:0`));
    expect(s.pocket).toHaveLength(ITEMS.pocket);
    s = itemsReducer(s, use(SPARE));
    expect(s.emits).toEqual([{ name: 'refused', reason: 'pocketFull' }]);
    expect(candleAt(s, SPARE)).toBeDefined();
  });

  it('takes a lit candle into the hand, moving an unlit held one to the pocket; refuses when the hand holds a lit one', () => {
    let s = run(createItems(), use(ACT1, true), { type: 'spiritSolved', characterId: COOK });
    s = itemsReducer(s, use(SPARE));
    expect(s.hand).toBe(`candle:${SPARE}`);
    s = itemsReducer(s, use(COOK_STAND));
    expect(s.hand).toBe(`candle:${COOK_STAND}`);
    expect(candle(s, s.hand!).lit).toBe(true);
    expect(s.pocket).toEqual([`candle:${SPARE}`]);

    let other = run(createItems(), use(ACT1, true), use(ACT1), strike, { type: 'spiritSolved', characterId: COOK });
    other = itemsReducer(other, tick(20));
    expect(useLabel(other, COOK_STAND)).toBe('Your hands are full');
    other = itemsReducer(other, use(COOK_STAND));
    expect(other.emits).toEqual([{ name: 'refused', reason: 'handsFull' }]);
  });

  it('sets the held candle down in an empty stand or over a stub, and the next pocket candle comes to hand', () => {
    let s = run(equipped(), use(SPARE));
    s = itemsReducer(s, use(ACT1));
    expect(s.emits).toEqual([{ name: 'candlePlaced', id: `candle:${ACT1}`, standId: ACT1 }]);
    expect(s.hand).toBe(`candle:${SPARE}`);
    expect(s.pocket).toEqual([]);
    expect(candleAt(s, ACT1)?.lit).toBe(false);

    // Over a stub: the spirit's candle burns down in its stand.
    let t = run(createItems(), use(ACT1, true), use(ACT1), { type: 'spiritSolved', characterId: COOK }, tick(ITEMS.candleSeconds + 1));
    expect(candleAt(t, COOK_STAND)).toEqual({ lit: false, burnLeft: 0 });
    expect(useLabel(t, COOK_STAND)).toBe('Set the candle down');
    t = itemsReducer(t, use(COOK_STAND));
    expect(candleAt(t, COOK_STAND)?.burnLeft).toBe(ITEMS.candleSeconds);
    expect(t.hand).toBeUndefined();
  });
});

describe('matches', () => {
  it('strikes until none are left, one at a time, and not without the box', () => {
    expect(itemsReducer(createItems(), strike).matchLeft).toBe(0);
    let s = run(createItems(), use(ACT1, true));
    for (let i = ITEMS.matches - 1; i >= 0; i--) {
      s = itemsReducer(s, strike);
      expect(s.emits).toEqual([{ name: 'matchStruck', left: i }]);
      expect(hasFlame(s)).toBe(true);
      // A second strike while one burns does nothing.
      expect(itemsReducer(s, strike).matches).toBe(i);
      s = itemsReducer(s, tick(ITEMS.matchSeconds));
      expect(hasFlame(s)).toBe(false);
    }
    expect(itemsReducer(s, strike).matchLeft).toBe(0);
  });

  it('lights the held candle when it is unlit', () => {
    const s = itemsReducer(equipped(), strike);
    expect(s.emits).toEqual([
      { name: 'matchStruck', left: ITEMS.matches - 1 },
      { name: 'candleLit', id: `candle:${ACT1}` },
    ]);
    expect(candle(s, s.hand!).lit).toBe(true);
  });
});

describe('lighting', () => {
  it('lights a standing candle with a burning match, or with a lit candle once the matches are gone', () => {
    let s = run(createItems({ matches: 1 }), use(ACT1, true));
    s = itemsReducer(s, strike);
    expect(useLabel(s, SPARE)).toBe('Light the candle');
    s = itemsReducer(s, use(SPARE));
    expect(s.emits).toEqual([{ name: 'candleLit', id: `candle:${SPARE}` }]);
    expect(candleAt(s, SPARE)?.lit).toBe(true);

    // Out of matches: take the lit one, and light another from it.
    s = run(s, tick(ITEMS.matchSeconds), use(SPARE));
    expect(s.matches).toBe(0);
    expect(useLabel(s, COOK_STAND)).toBe('Light the candle');
    s = itemsReducer(s, use(COOK_STAND));
    expect(candleAt(s, COOK_STAND)?.lit).toBe(true);
  });

  it('takes an unlit candle when there is no flame', () => {
    expect(useLabel(createItems(), SPARE)).toBe('Take the candle');
  });
});

describe('burning', () => {
  it('blowing out keeps what is left; a candle burns to a stub that cannot be lit', () => {
    let s = run(equipped(), strike, tick(100), { type: 'blowOut' });
    expect(s.emits).toEqual([{ name: 'candleOut', id: `candle:${ACT1}`, reason: 'blown' }]);
    expect(candle(s, s.hand!)).toEqual({ lit: false, burnLeft: ITEMS.candleSeconds - 100 });
    s = itemsReducer(s, tick(1000));
    expect(candle(s, s.hand!).burnLeft).toBe(ITEMS.candleSeconds - 100);

    const solved = run(createItems(), { type: 'spiritSolved', characterId: COOK }, tick(ITEMS.candleSeconds));
    expect(solved.emits).toEqual([{ name: 'candleOut', id: `candle:${COOK_STAND}`, reason: 'burnt' }]);
    const relit = run(solved, use(ACT1, true), strike, use(COOK_STAND));
    expect(candleAt(relit, COOK_STAND)).toEqual({ lit: false, burnLeft: 0 });
  });

  it('drops a burnt-out candle in hand and brings the next one out of the pocket', () => {
    let s = run(equipped(), use(SPARE), strike);
    s = itemsReducer(s, tick(ITEMS.candleSeconds));
    expect(s.hand).toBe(`candle:${SPARE}`);
    expect(s.pocket).toEqual([]);
    expect(candle(s, s.hand!).lit).toBe(false);
  });
});

describe('spirits', () => {
  it('lights nothing at the start', () => {
    const s = createItems();
    for (const stand of [ACT1, COOK_STAND, SPARE]) expect(candleAt(s, stand)).toEqual({ lit: false, burnLeft: ITEMS.candleSeconds });
  });

  it('lights a solved spirit’s candle by itself; an empty stand stays dark', () => {
    const s = itemsReducer(createItems(), { type: 'spiritSolved', characterId: COOK });
    expect(s.emits).toEqual([{ name: 'candleLit', id: `candle:${COOK_STAND}` }]);
    expect(candleAt(s, COOK_STAND)?.lit).toBe(true);

    const taken = run(createItems(), use(COOK_STAND), { type: 'spiritSolved', characterId: COOK });
    expect(candleAt(taken, COOK_STAND)).toBeUndefined();
    expect(taken.emits).toEqual([]);
    expect(taken.solved).toEqual([COOK]);
  });

  it('lays keys on the table only when told, and E takes them before the candle', () => {
    let s = createItems();
    expect(useLabel(s, COOK_STAND)).toBe('Take the candle');
    s = itemsReducer(s, { type: 'keysLeft', standId: COOK_STAND, keyIds: ['key:gardener'] });
    expect(useLabel(s, COOK_STAND)).toBe('Take the key');
    s = itemsReducer(s, use(COOK_STAND));
    expect(s.emits).toEqual([{ name: 'keyPickedUp', keyId: 'key:gardener' }]);
    expect(s.hand).toBeUndefined();
    expect(useLabel(s, COOK_STAND)).toBe('Take the candle');
  });
});

describe('light and sanctuaries', () => {
  const dark = { flashlightLit: false, roomStandIds: [] as string[] };

  it('counts the torch, a match, a lit candle in hand and a lit candle in the room as light', () => {
    const s = equipped();
    expect(inLight(s, dark)).toBe(false);
    expect(inLight(s, { ...dark, flashlightLit: true })).toBe(true);
    const match = run(createItems(), use(ACT1, true), strike);
    expect(inLight(match, dark)).toBe(true);
    expect(inLight(itemsReducer(match, tick(ITEMS.matchSeconds)), dark)).toBe(false);
    const held = run(s, strike, tick(ITEMS.matchSeconds));
    expect(inLight(held, dark)).toBe(true);
    const room = itemsReducer(createItems(), { type: 'spiritSolved', characterId: COOK });
    expect(inLight(room, { ...dark, roomStandIds: [COOK_STAND] })).toBe(true);
    expect(inLight(room, { ...dark, roomStandIds: [SPARE] })).toBe(false);
  });

  it('makes a solved room a sanctuary while its candle burns, and not once it is taken or burnt out', () => {
    const lit = itemsReducer(createItems(), { type: 'spiritSolved', characterId: COOK });
    expect(isSanctuary(lit, 'key:cook')).toBe(true);
    expect(isSanctuary(lit, 'key:gardener')).toBe(false);
    expect(isSanctuary(lit, 'r:1,1:0')).toBe(false);
    expect(isSanctuary(itemsReducer(lit, use(COOK_STAND)), 'key:cook')).toBe(false);
    expect(isSanctuary(itemsReducer(lit, tick(ITEMS.candleSeconds)), 'key:cook')).toBe(false);
    // Lit but not solved is light, not a sanctuary.
    const unsolved = run(createItems(), use(ACT1, true), strike, use(COOK_STAND));
    expect(candleAt(unsolved, COOK_STAND)?.lit).toBe(true);
    expect(isSanctuary(unsolved, 'key:cook')).toBe(false);
  });
});
