import type { CharacterId } from '../case/types';
import type { Rng } from '../core/rng';

export type ReplyCategory = 'honest' | 'evasive' | 'lie';

/** One answer to a spirit's "who are you?", and what it does to that spirit's trust. */
export interface Reply {
  id: string;
  text: string;
  category: ReplyCategory;
  trustDelta: number;
}

/**
 * Every answer the stranger can give. The spirits sense a lie (spec 08's prompts), so lies cost
 * trust; the truth that the stranger is family gains the most.
 */
export const REPLIES: readonly Reply[] = [
  { id: 'traveller', text: 'A traveller lost in the storm.', category: 'honest', trustDelta: 10 },
  { id: 'family', text: 'Your family, I think.', category: 'honest', trustDelta: 20 },
  { id: 'rest', text: 'Someone who wants to help you rest.', category: 'honest', trustDelta: 12 },
  { id: 'shelter', text: 'Only a stranger looking for shelter.', category: 'honest', trustDelta: 8 },
  { id: 'business', text: 'None of your business.', category: 'evasive', trustDelta: -5 },
  { id: 'matter', text: 'Does it matter who I am?', category: 'evasive', trustDelta: -3 },
  { id: 'passing', text: 'Just passing through.', category: 'evasive', trustDelta: 0 },
  { id: 'owner', text: 'The new owner of this house.', category: 'lie', trustDelta: -12 },
  { id: 'priest', text: 'A priest, come to bless the dead.', category: 'lie', trustDelta: -8 },
  { id: 'police', text: "The police. I'm here about the deaths.", category: 'lie', trustDelta: -10 },
];

function shuffled<T>(rng: Rng, items: readonly T[]): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = rng.int(0, i);
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

/**
 * The 3 or 4 answers one spirit offers, from the dialogue stream: always at least one honest, the
 * rest from the whole pool, in a seeded order. The same seed and spirit always give the same set.
 */
export function draw(rng: Rng, characterId: CharacterId): Reply[] {
  const own = rng.fork(`replies:${characterId}`);
  const count = own.int(3, 4);
  const honest = own.pick(REPLIES.filter((r) => r.category === 'honest'));
  const rest = shuffled(own, REPLIES.filter((r) => r !== honest)).slice(0, count - 1);
  return shuffled(own, [honest, ...rest]);
}
