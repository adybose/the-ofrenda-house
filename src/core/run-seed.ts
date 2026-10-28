import { hashSeed } from './rng';

/**
 * Reads the run seed from `?seed=`. A whole number up to 2^32 - 1 is used as
 * it is (so `?seed=42` matches `createRng(42)` in tests); any other text is
 * hashed. With no seed, a fresh one is chosen.
 */
export function readRunSeed(url: URL): { seed: number; fromUrl: boolean } {
  const param = url.searchParams.get('seed')?.trim();
  if (param) {
    const seed = /^\d+$/.test(param) && Number(param) <= 0xffffffff ? Number(param) : hashSeed(param);
    return { seed, fromUrl: true };
  }
  // eslint-disable-next-line no-restricted-properties -- the one place a fresh run seed is chosen
  return { seed: Math.floor(Math.random() * 0x100000000), fromUrl: false };
}
