import type { TrustBucket } from '../../src/dialogue/trust';
import type { ReplyCategory } from '../llm/types';

/**
 * Hand-written lines for one role, used whenever the model is missing, slow or talks nonsense.
 * Reward lines carry `{fact}`, replaced with the spirit's clue from the case file.
 */
export interface RoleFallbacks {
  greeting: Record<TrustBucket, string[]>;
  whoAreYou: string[];
  reaction: Record<ReplyCategory, string[]>;
  /** One riddle per riddle theme of the role (see RIDDLE_BUNDLES): the question and three wrong answers. */
  riddles: Record<string, { question: string; wrong: [string, string, string] }>;
  reward: string[];
  silence: string[];
}
