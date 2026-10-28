import type { Step } from './types';

/**
 * One JSON schema per step. The same object goes to Ollama as `format` (so the model is held to
 * it) and to ajv to check what comes back (so nothing unchecked reaches the game).
 */
const LINE = {
  type: 'object',
  properties: { line: { type: 'string', minLength: 1, maxLength: 320 } },
  required: ['line'],
  additionalProperties: false,
} as const;

const RIDDLE = {
  type: 'object',
  properties: {
    question: { type: 'string', minLength: 8, maxLength: 420 },
    wrongAnswers: { type: 'array', items: { type: 'string', minLength: 1, maxLength: 60 }, minItems: 3, maxItems: 3 },
  },
  required: ['question', 'wrongAnswers'],
  additionalProperties: false,
} as const;

export function schemaFor(step: Step): typeof LINE | typeof RIDDLE {
  return step === 'riddle' ? RIDDLE : LINE;
}

export interface LineOutput {
  line: string;
}

export interface RiddleOutput {
  question: string;
  wrongAnswers: string[];
}
