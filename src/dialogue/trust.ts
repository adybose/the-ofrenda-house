/** How a spirit feels about the stranger, from trust 0..100 (spec 10 keeps the score). */
export const TRUST_BUCKETS = ['wary', 'neutral', 'warm'] as const;
export type TrustBucket = (typeof TRUST_BUCKETS)[number];

export function trustBucket(trust: number): TrustBucket {
  return trust < 35 ? 'wary' : trust < 70 ? 'neutral' : 'warm';
}
