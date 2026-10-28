import type { CharacterId } from '../../src/case/types';

/** The steps of an encounter (spec 11), plus the Shadow's taunts. */
export const STEPS = ['greeting', 'whoAreYou', 'reaction', 'riddle', 'reward', 'silence', 'taunt'] as const;
export type Step = (typeof STEPS)[number];
export type SpiritStep = Exclude<Step, 'taunt'>;

/** The kind of reply the player picked to "who are you?" (spec 10 owns the replies). */
export type ReplyCategory = 'honest' | 'evasive' | 'lie';

export interface ChatMessage {
  role: 'system' | 'user';
  content: string;
}

export interface PromptContext {
  trust: number;
  lastChoiceText?: string;
  lastChoiceCategory?: ReplyCategory;
}

export interface LineRequest extends PromptContext {
  seed: number | string;
  characterId: CharacterId;
  step: SpiritStep;
}

export interface Riddle {
  question: string;
  options: string[];
  correctIndex: number;
}

export interface LineResponse {
  source: 'llm' | 'fallback';
  line: string;
  riddle?: Riddle;
}

export interface TauntRequest {
  seed: number | string;
  context: 'chase' | 'whisper';
}
