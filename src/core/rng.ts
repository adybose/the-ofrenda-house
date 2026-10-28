export type Seed = number | string;

export interface Rng {
  /** The unsigned 32-bit seed this stream was built from. */
  readonly seed: number;
  /** A float in [0, 1). */
  float(): number;
  /** An integer between min and max, both included. */
  int(min: number, max: number): number;
  /** True with probability p. */
  chance(p: number): boolean;
  pick<T>(items: readonly T[]): T;
  weighted<T>(items: readonly { value: T; weight: number }[]): T;
  /** A shuffled copy; the input is left alone. */
  shuffle<T>(items: readonly T[]): T[];
  /** An independent stream derived only from this stream's seed and the label. */
  fork(label: string): Rng;
}

/** Standard fork labels, so each system draws from its own stream. */
export const STREAMS = {
  case: 'case',
  house: 'house',
  render: 'render',
  lighting: 'lighting',
  scares: 'scares',
  voices: 'voices',
  shadow: 'shadow',
  dialogue: 'dialogue',
} as const;

const UINT32_MAX = 0xffffffff;

/** FNV-1a over UTF-16 code units, then the murmur3 finaliser to spread the bits. */
function hashString(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}

/** Unsigned 32-bit integers are kept as they are; anything else is hashed. */
export function hashSeed(seed: Seed): number {
  if (typeof seed === 'number' && Number.isInteger(seed) && seed >= 0 && seed <= UINT32_MAX) return seed;
  return hashString(String(seed));
}

/** splitmix32, used only to expand one 32-bit seed into the sfc32 state. */
function splitmix32(seed: number): () => number {
  let state = seed | 0;
  return () => {
    state = (state + 0x9e3779b9) | 0;
    let t = state ^ (state >>> 16);
    t = Math.imul(t, 0x21f0aaad);
    t ^= t >>> 15;
    t = Math.imul(t, 0x735a2d97);
    t ^= t >>> 15;
    return t >>> 0;
  };
}

/** sfc32: small, fast, and identical on every JavaScript engine. */
function sfc32(seed: number): () => number {
  const expand = splitmix32(seed);
  let a = expand();
  let b = expand();
  let c = expand();
  let d = expand();
  const next = (): number => {
    const t = (((a + b) | 0) + d) | 0;
    d = (d + 1) | 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) | 0;
    c = (c << 21) | (c >>> 11);
    c = (c + t) | 0;
    return t >>> 0;
  };
  for (let i = 0; i < 15; i++) next();
  return next;
}

export function createRng(seed: Seed): Rng {
  const hashed = hashSeed(seed);
  const next = sfc32(hashed);
  const float = (): number => next() / 4294967296;

  return {
    seed: hashed,
    float,
    int(min, max) {
      if (!Number.isInteger(min) || !Number.isInteger(max) || max < min) {
        throw new RangeError(`int(${min}, ${max}) needs integer bounds with min <= max`);
      }
      return min + Math.floor(float() * (max - min + 1));
    },
    chance(p) {
      return float() < p;
    },
    pick(items) {
      if (items.length === 0) throw new RangeError('pick() needs at least one item');
      return items[Math.floor(float() * items.length)] as (typeof items)[number];
    },
    weighted(items) {
      let total = 0;
      for (const { weight } of items) {
        if (!(weight >= 0)) throw new RangeError(`weighted() got a negative or invalid weight: ${weight}`);
        total += weight;
      }
      if (total <= 0) throw new RangeError('weighted() needs at least one positive weight');
      let roll = float() * total;
      for (const item of items) {
        roll -= item.weight;
        if (roll < 0) return item.value;
      }
      // Floating-point leftovers: fall back to the last item with weight.
      return items.findLast((item) => item.weight > 0)!.value;
    },
    shuffle(items) {
      const copy = [...items];
      for (let i = copy.length - 1; i > 0; i--) {
        const j = Math.floor(float() * (i + 1));
        [copy[i], copy[j]] = [copy[j]!, copy[i]!];
      }
      return copy;
    },
    fork(label) {
      return createRng(hashString(`${hashed}/${label}`));
    },
  };
}
