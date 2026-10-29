import type { CaseFile, Character } from '../case/types';
import { createRng } from '../core/rng';
import { FALLBACKS } from '../../server/fallbacks';
import type { LineRequest, LineResponse } from '../../server/llm/types';
import { trustBucket } from './trust';

// The hand-written lines (server/fallbacks), chosen the same way on the server and in the browser: the
// server falls back to them when the model is missing, slow or wrong (spec 08), and the game falls
// back to them when the local server isn't there at all (spec 11). Pure: case file and seed in, line out.

/** The riddle the player sees: the model's (or a fallback's) wrong answers and the case file's answer, shuffled by seed. */
export function riddleFor(seed: number, character: Character, question: string, wrong: readonly string[]): LineResponse['riddle'] {
  const options = createRng(seed).fork('dialogue').fork(`riddle:${character.id}`).shuffle([character.riddle.answer, ...wrong]);
  return { question, options, correctIndex: options.indexOf(character.riddle.answer) };
}

/** A hand-written line for one step of one spirit's encounter. */
export function fallbackLine(seed: number, caseFile: CaseFile, character: Character, request: Pick<LineRequest, 'step' | 'trust' | 'lastChoiceCategory'>): LineResponse {
  const lines = FALLBACKS[character.role];
  const rng = createRng(seed).fork('dialogue').fork(`fallback:${character.id}:${request.step}`);
  switch (request.step) {
    case 'greeting':
      return { source: 'fallback', line: rng.pick(lines.greeting[trustBucket(request.trust)]) };
    case 'whoAreYou':
      return { source: 'fallback', line: rng.pick(lines.whoAreYou) };
    case 'reaction':
      return { source: 'fallback', line: rng.pick(lines.reaction[request.lastChoiceCategory ?? 'evasive']) };
    case 'riddle': {
      const riddle = lines.riddles[character.riddle.theme]!;
      return { source: 'fallback', line: riddle.question, riddle: riddleFor(seed, character, riddle.question, riddle.wrong) };
    }
    case 'reward': {
      const facts = caseFile.facts.filter((f) => f.holderId === character.id).map((f) => f.text);
      return { source: 'fallback', line: rng.pick(lines.reward).replace('{fact}', facts.join(' ')) };
    }
    case 'silence':
      return { source: 'fallback', line: rng.pick(lines.silence) };
  }
}
