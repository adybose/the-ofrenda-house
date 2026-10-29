import type { CharacterId } from '../case/types';
import { standId } from '../world/stands';

/**
 * Candles, matches and keys (spec 18), as a pure reducer: what each stand holds, what the player
 * carries, what is lit and how long it has left. Each transition lists what it emits; the
 * controller draws the result and passes the emits on to the event bus.
 */
export const ITEMS = {
  /** A whole candle burns this long. No candle lasts the night. */
  candleSeconds: 480,
  /** A match burns this long. */
  matchSeconds: 15,
  /** Matches in the box. */
  matches: 8,
  /** Unlit candles the pocket holds, besides the one in hand. */
  pocket: 4,
} as const;

export interface Candle {
  lit: boolean;
  /** Seconds of wax left; 0 is a stub that can't be lit. */
  burnLeft: number;
}

export type Refusal = 'handsFull' | 'pocketFull';

export type ItemsEmit =
  | { name: 'itemPickedUp'; kind: 'candle' | 'matchbox' | 'key'; id: string }
  | { name: 'matchStruck'; left: number }
  | { name: 'candleLit'; id: string }
  | { name: 'candleOut'; id: string; reason: 'burnt' | 'blown' }
  | { name: 'candlePlaced'; id: string; standId: string }
  | { name: 'keyPickedUp'; keyId: string }
  | { name: 'refused'; reason: Refusal };

export interface ItemsState {
  /** What each stand the player has changed holds: a candle id, or null. Untouched stands hold their own new candle. */
  stands: Readonly<Record<string, string | null>>;
  /** Every candle that has been touched, lit or moved. */
  candles: Readonly<Record<string, Candle>>;
  hand?: string;
  pocket: readonly string[];
  hasMatchbox: boolean;
  matches: number;
  /** Seconds the burning match has left; 0 when none burns. */
  matchLeft: number;
  /** Keys lying on each stand's table. */
  tableKeys: Readonly<Record<string, readonly string[]>>;
  /** Spirits set at peace: their rooms are sanctuaries while their candle burns. */
  solved: readonly CharacterId[];
  /** What the last transition emitted. */
  emits: readonly ItemsEmit[];
}

export type ItemsAction =
  /** E on a stand; `matchbox` when the matchbox is there (the Act 1 stand). */
  | { type: 'use'; standId: string; matchbox?: boolean }
  | { type: 'strikeMatch' }
  | { type: 'blowOut' }
  | { type: 'tick'; dt: number }
  | { type: 'spiritSolved'; characterId: CharacterId }
  | { type: 'keysLeft'; standId: string; keyIds: readonly string[] };

const newCandle = (): Candle => ({ lit: false, burnLeft: ITEMS.candleSeconds });
const ownCandle = (stand: string) => `candle:${stand}`;

export function createItems(options: { matches?: number } = {}): ItemsState {
  return { stands: {}, candles: {}, pocket: [], hasMatchbox: false, matches: options.matches ?? ITEMS.matches, matchLeft: 0, tableKeys: {}, solved: [], emits: [] };
}

/** The candle id on a stand, if any. */
export function candleIdAt(state: ItemsState, stand: string): string | undefined {
  return stand in state.stands ? (state.stands[stand] ?? undefined) : ownCandle(stand);
}

export function candle(state: ItemsState, id: string): Candle {
  return state.candles[id] ?? newCandle();
}

/** The candle on a stand, if any. */
export function candleAt(state: ItemsState, stand: string): Candle | undefined {
  const id = candleIdAt(state, stand);
  return id ? candle(state, id) : undefined;
}

/** A burning match or a lit candle in hand: something to light a candle with. */
export function hasFlame(state: ItemsState): boolean {
  return state.matchLeft > 0 || (state.hand !== undefined && candle(state, state.hand).lit);
}

const heldLit = (state: ItemsState) => state.hand !== undefined && candle(state, state.hand).lit;

/** What E on this stand would do, for the prompt; undefined when it would do nothing. */
export function useLabel(state: ItemsState, stand: string, matchbox = false): string | undefined {
  if (matchbox && !state.hasMatchbox) return 'Take the matches';
  if (state.tableKeys[stand]?.length) return 'Take the key';
  const here = candleAt(state, stand);
  if (here && here.burnLeft > 0) {
    if (!here.lit && hasFlame(state)) return 'Light the candle';
    if (here.lit && heldLit(state)) return 'Your hands are full';
    return 'Take the candle';
  }
  return state.hand ? 'Set the candle down' : undefined;
}

export function itemsReducer(state: ItemsState, action: ItemsAction): ItemsState {
  const next = (changes: Partial<ItemsState>, emits: ItemsEmit[] = []): ItemsState => ({ ...state, ...changes, emits });
  const unchanged = () => (state.emits.length ? { ...state, emits: [] } : state);
  const withCandle = (id: string, changes: Partial<Candle>) => ({ ...state.candles, [id]: { ...candle(state, id), ...changes } });

  switch (action.type) {
    case 'use': {
      const stand = action.standId;
      if (action.matchbox && !state.hasMatchbox) {
        return next({ hasMatchbox: true }, [{ name: 'itemPickedUp', kind: 'matchbox', id: 'matchbox' }]);
      }
      const keys = state.tableKeys[stand] ?? [];
      if (keys.length) {
        return next({ tableKeys: { ...state.tableKeys, [stand]: [] } }, keys.map((keyId): ItemsEmit => ({ name: 'keyPickedUp', keyId })));
      }
      const id = candleIdAt(state, stand);
      const here = id ? candle(state, id) : undefined;
      if (id && here && here.burnLeft > 0) {
        if (!here.lit && hasFlame(state)) return next({ candles: withCandle(id, { lit: true }) }, [{ name: 'candleLit', id }]);
        const taken = { stands: { ...state.stands, [stand]: null }, candles: withCandle(id, {}) };
        const picked: ItemsEmit = { name: 'itemPickedUp', kind: 'candle', id };
        if (!state.hand) return next({ ...taken, hand: id }, [picked]);
        if (here.lit) {
          // A lit candle goes to the hand; an unlit one held moves to the pocket.
          if (heldLit(state)) return next({}, [{ name: 'refused', reason: 'handsFull' }]);
          if (state.pocket.length >= ITEMS.pocket) return next({}, [{ name: 'refused', reason: 'pocketFull' }]);
          return next({ ...taken, hand: id, pocket: [...state.pocket, state.hand] }, [picked]);
        }
        if (state.pocket.length >= ITEMS.pocket) return next({}, [{ name: 'refused', reason: 'pocketFull' }]);
        return next({ ...taken, pocket: [...state.pocket, id] }, [picked]);
      }
      // An empty stand, or a stub: set the held candle down in it.
      if (!state.hand) return unchanged();
      const [hand, ...pocket] = state.pocket;
      return next({ stands: { ...state.stands, [stand]: state.hand }, hand, pocket }, [{ name: 'candlePlaced', id: state.hand, standId: stand }]);
    }

    case 'strikeMatch': {
      if (!state.hasMatchbox || state.matches === 0 || state.matchLeft > 0) return unchanged();
      const matches = state.matches - 1;
      const emits: ItemsEmit[] = [{ name: 'matchStruck', left: matches }];
      const held = state.hand ? candle(state, state.hand) : undefined;
      if (state.hand && held && !held.lit && held.burnLeft > 0) {
        emits.push({ name: 'candleLit', id: state.hand });
        return next({ matches, matchLeft: ITEMS.matchSeconds, candles: withCandle(state.hand, { lit: true }) }, emits);
      }
      return next({ matches, matchLeft: ITEMS.matchSeconds }, emits);
    }

    case 'blowOut':
      if (!heldLit(state)) return unchanged();
      return next({ candles: withCandle(state.hand!, { lit: false }) }, [{ name: 'candleOut', id: state.hand!, reason: 'blown' }]);

    case 'tick': {
      const emits: ItemsEmit[] = [];
      const candles: Record<string, Candle> = { ...state.candles };
      let { hand, pocket } = state;
      for (const [id, c] of Object.entries(state.candles)) {
        if (!c.lit) continue;
        const burnLeft = Math.max(0, c.burnLeft - action.dt);
        candles[id] = burnLeft > 0 ? { lit: true, burnLeft } : { lit: false, burnLeft: 0 };
        if (burnLeft > 0) continue;
        emits.push({ name: 'candleOut', id, reason: 'burnt' });
        // A stub in hand is dropped, and the next candle comes out of the pocket.
        if (id === hand) [hand, ...pocket] = pocket;
      }
      const matchLeft = Math.max(0, state.matchLeft - action.dt);
      if (!emits.length && matchLeft === state.matchLeft && !Object.values(state.candles).some((c) => c.lit)) return unchanged();
      return next({ candles, hand, pocket, matchLeft }, emits);
    }

    case 'spiritSolved': {
      const solved = state.solved.includes(action.characterId) ? state.solved : [...state.solved, action.characterId];
      const id = candleIdAt(state, standId(`key:${action.characterId}`));
      const here = id ? candle(state, id) : undefined;
      if (!id || !here || here.lit || here.burnLeft === 0) return next({ solved });
      return next({ solved, candles: withCandle(id, { lit: true }) }, [{ name: 'candleLit', id }]);
    }

    case 'keysLeft':
      if (!action.keyIds.length) return unchanged();
      return next({ tableKeys: { ...state.tableKeys, [action.standId]: [...(state.tableKeys[action.standId] ?? []), ...action.keyIds] } });
  }
}

/**
 * Whether the player has light right now: the torch, a burning match, a lit candle in hand, or a
 * lit candle standing in the room (spec 12 chases only a player in the dark).
 */
export function inLight(state: ItemsState, where: { flashlightLit: boolean; roomStandIds: readonly string[] }): boolean {
  if (where.flashlightLit || hasFlame(state)) return true;
  return where.roomStandIds.some((stand) => candleAt(state, stand)?.lit === true);
}

/** A solved spirit's room whose candle burns: La Sombra never enters it (spec 12). */
export function isSanctuary(state: ItemsState, roomId: string): boolean {
  if (!roomId.startsWith('key:')) return false;
  const characterId = roomId.slice(4) as CharacterId;
  return state.solved.includes(characterId) && candleAt(state, standId(roomId))?.lit === true;
}

/** The HUD's candle line: the held candle and the spares, or undefined when carrying none. */
export function candleSummary(state: ItemsState): string | undefined {
  if (!state.hand) return undefined;
  const held = candle(state, state.hand);
  const minutes = Math.max(1, Math.ceil(held.burnLeft / 60));
  const spares = state.pocket.length ? ` · ${state.pocket.length} spare` : '';
  return `Candle: ${held.lit ? 'lit' : 'unlit'}, ${minutes} min${spares}`;
}
