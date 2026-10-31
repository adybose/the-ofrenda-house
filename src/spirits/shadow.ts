import { createRng } from '../core/rng';
import type { House } from '../world/house';
import type { CellId } from '../world/types';

/**
 * La Sombra (spec 12), as a pure reducer: when it stalks, hunts, confronts, chases, withdraws or
 * catches, and how bold it is. Each transition lists what it emits; the controller moves the figure,
 * speaks and plays sounds. Light decides everything: a player in light is threatened and left alone,
 * a player in the dark is chased.
 */
export const SHADOW = {
  maxThreat: 5,
  /** Seconds of stalking before it hunts, by threat. */
  stalkSeconds: [90, 70, 55, 40, 30, 20],
  /** Seconds between whispers through the walls while it stalks, by threat. */
  whisperSeconds: [25, 22, 18, 15, 12, 10],
  /** A hunt that never finds the player gives up after this long. */
  huntGiveUp: 60,
  /** It stops this far from a player in light, says its piece, and stays this long. */
  confrontDistance: 4,
  confrontSeconds: 3,
  /** Then it leaves the player alone for this long. */
  withdrawSeconds: [30, 60] as const,
  /** A chase is lost beyond this distance, or after this long out of sight. */
  loseDistance: 15,
  loseUnseen: 4,
  /** After losing the player it lurks this long before stalking again. */
  lostSeconds: 8,
  /** It catches a player in the dark within this distance. */
  catchDistance: 1,
  /** A chase taunt this often. */
  tauntSeconds: 7,
  /** Until spec 14's clock: Act 2 seconds per in-game hour (a 24-minute night). */
  hourSeconds: 240,
} as const;

/** The player's run speed (spec 05: walk 1.4 m/s × 1.8). */
export const RUN_SPEED = 2.52;

/**
 * Spec 25: how often it steps out ahead of the player at a door or corner. By candle or match light
 * alone (the torch off) it is bolder, and also tries every `candleEvery` seconds as they walk.
 */
export const AMBUSH = { chance: 0.3, perThreat: 0.05, gap: 30, candleChance: 0.65, candleGap: 18, candleEvery: 15 } as const;

export function ambushOdds(threat: number, byCandle: boolean): { chance: number; gap: number } {
  return byCandle ? { chance: AMBUSH.candleChance, gap: AMBUSH.candleGap } : { chance: AMBUSH.chance + AMBUSH.perThreat * threat, gap: AMBUSH.gap };
}

export type ShadowMode = 'dormant' | 'stalking' | 'hunting' | 'confronting' | 'chasing' | 'withdrawn' | 'lost' | 'caught';

/** Modes in which the figure is in the house, moving. */
export const PRESENT: ReadonlySet<ShadowMode> = new Set(['hunting', 'confronting', 'chasing']);

export type ShadowEmit = 'appear' | 'ambush' | 'vanish' | 'whisper' | 'laugh' | 'threaten' | 'taunt' | 'darkLine' | 'caught';

export interface ShadowState {
  mode: ShadowMode;
  threat: number;
  /** Seconds in the current mode. */
  modeTime: number;
  /** Stalking: when the next whisper is due. */
  nextWhisper: number;
  /** Chasing: when the next taunt is due. */
  nextTaunt: number;
  /** Withdrawn: how long it stays away. */
  away: number;
  /** Chasing: seconds out of sight. */
  unseen: number;
  seed: number;
  draws: number;
  emits: readonly ShadowEmit[];
}

export type ShadowEvent =
  | { type: 'enable' }
  | { type: 'tick'; dt: number; sees: boolean; distance: number; inLight: boolean; suppressed: boolean }
  | { type: 'riddleFailed' }
  | { type: 'wrongName' }
  | { type: 'hourPassed' }
  /** Debug: put it in a mode at once. */
  | { type: 'force'; mode: ShadowMode }
  /** Spec 24: the player's light has gone out, and stayed out; it comes for them. */
  | { type: 'attract' }
  /** Spec 24: it steps out in front of the player (a door they opened, a corner they turned). */
  | { type: 'ambush' };

export function createShadow(seed: number, threat = 0): ShadowState {
  return { mode: 'dormant', threat, modeTime: 0, nextWhisper: 0, nextTaunt: 0, away: 0, unseen: 0, seed, draws: 0, emits: [] };
}

/** Metres a second: always slower than the player's run while threat is below 3. */
export function speedFor(threat: number, mode: ShadowMode): number {
  if (mode === 'chasing') return threat < 3 ? 2.2 + 0.08 * threat : 2.6 + 0.15 * (threat - 3);
  if (mode === 'hunting') return 1.2 + 0.15 * threat;
  return 0;
}

/** It can only catch a player who is in the dark. */
export function canCatch(distance: number, inLight: boolean): boolean {
  return !inLight && distance <= SHADOW.catchDistance;
}

export function shadowReducer(state: ShadowState, event: ShadowEvent): ShadowState {
  const next = (changes: Partial<ShadowState>, emits: ShadowEmit[] = []): ShadowState => ({ ...state, ...changes, emits });
  const enter = (mode: ShadowMode, emits: ShadowEmit[] = [], changes: Partial<ShadowState> = {}) =>
    next({ mode, modeTime: 0, unseen: 0, ...changes }, emits);
  const bolder = () => next({ threat: Math.min(SHADOW.maxThreat, state.threat + 1) });
  const stalk = (emits: ShadowEmit[] = []) => enter('stalking', emits, { nextWhisper: SHADOW.whisperSeconds[state.threat]! });

  switch (event.type) {
    case 'enable':
      return state.mode === 'dormant' ? stalk() : next({});
    case 'riddleFailed':
    case 'wrongName':
    case 'hourPassed':
      return bolder();
    case 'attract':
    case 'ambush':
      // From the shadows only: not asleep, not already here, not done.
      if (state.mode !== 'stalking' && state.mode !== 'withdrawn' && state.mode !== 'lost') return next({});
      return enter('hunting', event.type === 'attract' ? ['appear', 'darkLine'] : ['ambush']);
    case 'force': {
      const emits: ShadowEmit[] = PRESENT.has(event.mode) && !PRESENT.has(state.mode) ? ['appear'] : [];
      return enter(event.mode, emits, { nextTaunt: SHADOW.tauntSeconds, nextWhisper: SHADOW.whisperSeconds[state.threat]! });
    }
    case 'tick':
      break;
  }

  const { dt, sees, distance, inLight, suppressed } = event;
  const time = state.modeTime + dt;
  if (state.mode === 'dormant' || state.mode === 'caught') return next({});
  // Encounters, the journal and the like: it slips away and keeps quiet.
  if (suppressed) return PRESENT.has(state.mode) ? stalk(['vanish']) : next({});

  switch (state.mode) {
    case 'stalking': {
      if (time >= SHADOW.stalkSeconds[state.threat]!) return enter('hunting', ['appear']);
      if (time >= state.nextWhisper) return next({ modeTime: time, nextWhisper: state.nextWhisper + SHADOW.whisperSeconds[state.threat]! }, ['whisper']);
      return next({ modeTime: time });
    }
    case 'hunting':
      if (sees) return inLight ? enter('confronting', ['laugh', 'threaten']) : enter('chasing', ['taunt'], { nextTaunt: SHADOW.tauntSeconds });
      if (time >= SHADOW.huntGiveUp) return stalk(['vanish']);
      return next({ modeTime: time });
    case 'confronting': {
      if (time < SHADOW.confrontSeconds) return next({ modeTime: time });
      const [min, max] = SHADOW.withdrawSeconds;
      const away = min + createRng(state.seed).fork(`withdraw:${state.draws}`).float() * (max - min);
      return enter('withdrawn', ['vanish'], { away, draws: state.draws + 1 });
    }
    case 'withdrawn':
      return time >= state.away ? stalk() : next({ modeTime: time });
    case 'lost':
      return time >= SHADOW.lostSeconds ? stalk() : next({ modeTime: time });
    case 'chasing': {
      if (inLight) return enter('confronting', ['laugh', 'threaten']);
      if (canCatch(distance, inLight)) return enter('caught', ['caught']);
      const unseen = sees ? 0 : state.unseen + dt;
      if (distance > SHADOW.loseDistance || unseen >= SHADOW.loseUnseen) return enter('lost', ['vanish']);
      if (time >= state.nextTaunt) return next({ modeTime: time, unseen, nextTaunt: state.nextTaunt + SHADOW.tauntSeconds }, ['taunt']);
      return next({ modeTime: time, unseen });
    }
  }
  return next({});
}

/** A cell where it could appear. `doors`: doors between its room and the player's (0 for the same room). */
export interface SpawnCandidate {
  cell: CellId;
  x: number;
  z: number;
  roomId: string;
  doors: number;
}

export interface Viewer {
  x: number;
  z: number;
  /** 0 faces north (-z); positive turns left. */
  yaw: number;
  roomId: string;
}

/** Out of the player's sight: another room, and either well off to the side or behind, or two doors away. */
export function outOfView(c: SpawnCandidate, player: Viewer): boolean {
  if (c.roomId === player.roomId) return false;
  if (c.doors >= 2) return true;
  const fx = -Math.sin(player.yaw);
  const fz = -Math.cos(player.yaw);
  const dx = c.x - player.x;
  const dz = c.z - player.z;
  const d = Math.hypot(dx, dz) || 1;
  return (dx * fx + dz * fz) / d < Math.cos((60 * Math.PI) / 180);
}

/** Where it appears: at least `minDistance` away and out of view. `pick` (0..1) chooses among them. */
export function chooseSpawn(candidates: readonly SpawnCandidate[], player: Viewer, pick: number, minDistance = 8): SpawnCandidate | undefined {
  const fit = candidates.filter((c) => Math.hypot(c.x - player.x, c.z - player.z) >= minDistance && outOfView(c, player));
  return fit.length ? fit[Math.min(fit.length - 1, Math.floor(pick * fit.length))] : undefined;
}

/** A* over the house's cells, through doors that aren't locked or sealed, avoiding `blocked` cells. */
export function findPath(house: House, from: CellId, to: CellId, blocked?: (cell: CellId) => boolean): CellId[] | null {
  return house.pathBetween(from, to, blocked);
}
