import type { CharacterId } from '../case/types';
import type { Reply } from './replies';

/** How a spirit feels about the stranger, from trust 0..100 (spec 10 keeps the score). */
export const TRUST_BUCKETS = ['wary', 'neutral', 'warm'] as const;
export type TrustBucket = (typeof TRUST_BUCKETS)[number];

export function trustBucket(trust: number): TrustBucket {
  return trust < 35 ? 'wary' : trust < 70 ? 'neutral' : 'warm';
}

/** Trust is 0..100 per spirit, starting at 50; and whether the stranger has ever lied to one. */
export interface TrustState {
  trust: Partial<Record<CharacterId, number>>;
  /** False for good once any `lie` reply is chosen; evasive replies don't count (spec 14's true ending). */
  toldTheTruth: boolean;
}

export const STARTING_TRUST = 50;

export function initialTrust(): TrustState {
  return { trust: {}, toldTheTruth: true };
}

/** The state after answering one spirit: its trust moves by the reply's change, clamped to 0..100. */
export function applyReply(state: TrustState, characterId: CharacterId, reply: Reply): TrustState {
  const before = state.trust[characterId] ?? STARTING_TRUST;
  return {
    trust: { ...state.trust, [characterId]: Math.max(0, Math.min(100, before + reply.trustDelta)) },
    toldTheTruth: state.toldTheTruth && reply.category !== 'lie',
  };
}

/** Spec 10's interface: `trust.apply`, `trust.bucket`. */
export const trust = { initial: initialTrust, apply: applyReply, bucket: trustBucket };
