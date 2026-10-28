import Ajv from 'ajv';
import { schemaFor, type LineOutput, type RiddleOutput } from './schemas';
import type { Step } from './types';

const ajv = new Ajv({ allErrors: true });
const validators = new Map(['greeting', 'riddle'].map((s) => [s, ajv.compile(schemaFor(s as Step))]));
const validatorFor = (step: Step) => validators.get(step === 'riddle' ? 'riddle' : 'greeting')!;

/** Words that would break the spell: no spirit of 1931 talks like this. */
const OUT_OF_CHARACTER = /\b(?:AI|A\.I\.|artificial intelligence|language model|chatbot|assistant|as a model|OpenAI|Gemma|Ollama)\b/i;

export const MAX_LINE_WORDS = 45;
export const MAX_TAUNT_WORDS = 12;
const MAX_RIDDLE_WORDS = 70;
const MAX_ANSWER_WORDS = 6;

export interface ValidationContext {
  /** The right answer, for riddles. */
  answer?: string;
  /** Names of the other household members: a spirit may only say them if its facts do. */
  otherNames: readonly string[];
  /** The facts this step may reveal; names inside them are allowed. */
  allowedText: string;
}

export type Validation<T> = { ok: true; value: T } | { ok: false; errors: string[] };

const words = (text: string) => text.trim().split(/\s+/).filter(Boolean).length;

/** Lower case, no accents or punctuation, single spaces, and no leading article. */
export function normalise(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^(?:a|an|the|la|el|los|las|un|una) /, '');
}

function textProblems(text: string, ctx: ValidationContext, label: string): string[] {
  const problems: string[] = [];
  if (OUT_OF_CHARACTER.test(text)) problems.push(`${label} breaks character`);
  for (const name of ctx.otherNames) {
    const named = new RegExp(`\\b${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`);
    if (named.test(text) && !named.test(ctx.allowedText)) problems.push(`${label} names ${name}`);
  }
  return problems;
}

/** Checks a model reply against its step's schema, then for sense. */
export function validateStep(step: Step, output: unknown, ctx: ValidationContext): Validation<LineOutput | RiddleOutput> {
  const check = validatorFor(step);
  if (!check(output)) return { ok: false, errors: (check.errors ?? []).map((e) => `${e.instancePath || 'reply'} ${e.message}`) };
  const errors: string[] = [];

  if (step === 'riddle') {
    const { question, wrongAnswers } = output as RiddleOutput;
    errors.push(...textProblems(question, ctx, 'riddle'));
    if (words(question) > MAX_RIDDLE_WORDS) errors.push('riddle too long');
    const answer = normalise(ctx.answer ?? '');
    const wrong = wrongAnswers.map(normalise);
    if (new Set(wrong).size !== wrong.length) errors.push('wrong answers repeat');
    if (wrong.some((w) => w === answer || w.length === 0)) errors.push('a wrong answer is the right answer');
    if (wrongAnswers.some((w) => words(w) > MAX_ANSWER_WORDS)) errors.push('a wrong answer is too long');
    for (const w of wrongAnswers) errors.push(...textProblems(w, ctx, 'wrong answer'));
    if (answer && ` ${normalise(question)} `.includes(` ${answer} `)) errors.push('the riddle gives its answer away');
  } else {
    const { line } = output as LineOutput;
    errors.push(...textProblems(line, ctx, 'line'));
    const limit = step === 'taunt' ? MAX_TAUNT_WORDS : MAX_LINE_WORDS;
    if (words(line) > limit) errors.push(`line over ${limit} words`);
  }
  return errors.length ? { ok: false, errors } : { ok: true, value: output as LineOutput | RiddleOutput };
}
