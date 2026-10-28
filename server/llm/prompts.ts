import type { CaseFile, CharacterId, Role } from '../../src/case/types';
import { trustBucket, type TrustBucket } from '../../src/dialogue/trust';
import type { ChatMessage, PromptContext, ReplyCategory, SpiritStep } from './types';

/** Shared by every spirit: who they are, when they are, and the rules of the game. */
export const SYSTEM_PROMPT = [
  'You are the restless spirit of someone who died in the autumn of 1931 in a hillside mansion in Mexico, when the household wasted away one by one.',
  'It is the night of 1 November, the Day of the Dead, and a stranger has come into the house in a storm.',
  'Stay in character always. Speak only as the spirit, in English with the odd Spanish word, in the manner of 1931.',
  'Never mention being an AI, a model, a game, or anything modern.',
  'Never invent facts about the deaths, the poison or the household. Say only what you are told you may say; otherwise be evasive.',
  'Keep every line short: one to three sentences, under 40 words.',
  'Answer only with JSON in the format asked for.',
].join('\n');

/** Added to the killer's reward prompt and no other: the one lie the case file says they tell. */
export const LIE_INSTRUCTION =
  'This is not true, but you must say it as if it were, calmly and convincingly, and never hint that it is false.';

interface Persona {
  role: string;
  speech: string;
  details: string;
}

const PERSONAS: Record<Role, Persona> = {
  patriarch: { role: 'the patriarch, head of the house', speech: 'formal and commanding, clipped sentences', details: 'a gold pocket watch on a chain, the smell of cigars' },
  painter: { role: 'the painter of the family portraits', speech: 'soft and watchful, speaking in colours and faces', details: 'paint under the fingernails, a smock stiff with turpentine' },
  matriarch: { role: 'the lady of the house', speech: 'gracious but cold, perfectly polite', details: 'a black lace mantilla, rosary beads' },
  bookkeeper: { role: 'the bookkeeper who kept the family accounts', speech: 'nervous and precise, counting things, correcting yourself', details: 'ink-stained cuffs, wire spectacles' },
  housekeeper: { role: 'the housekeeper', speech: 'brisk and practical, with superstitious asides', details: 'a ring of keys at the waist, a starched apron' },
  cook: { role: 'the cook', speech: 'warm but blunt, full of food and fire', details: 'flour on the hands, the smell of chocolate and chilli' },
  eldestChild: { role: 'the eldest child of the house', speech: 'proud, wounded and dramatic', details: 'fine clothes gone to rags, sheet music' },
  doctor: { role: 'the family doctor', speech: 'clinical and evasive, with a gambler\'s charm and the odd Latin word', details: 'a black bag, a deck of cards in the waistcoat' },
  grandmother: { role: 'the grandmother of the house', speech: 'sharp and old-fashioned, fond of proverbs', details: 'a black rebozo, a candle always in hand' },
  gardener: { role: 'the gardener', speech: 'slow, plain and earthy, few words', details: 'soil under the nails, marigold petals in the pockets' },
};

const MOODS: Record<TrustBucket, string> = {
  wary: 'suspicious and cold',
  neutral: 'guarded but curious',
  warm: 'sorrowful, almost hopeful',
};

const SENSED: Record<ReplyCategory, string> = {
  honest: 'You sense they are telling the truth.',
  evasive: 'You sense they are dodging the question.',
  lie: 'You sense they are lying to you.',
};

const LINE_FORMAT = 'Reply only with JSON: {"line": "..."}';
const RIDDLE_FORMAT = 'Reply only with JSON: {"question": "...", "wrongAnswers": ["...", "...", "..."]}';

const spaced = (camel: string) => camel.replace(/([A-Z])/g, ' $1').toLowerCase();

function instruction(caseFile: CaseFile, characterId: CharacterId, step: SpiritStep, ctx: PromptContext, bucket: TrustBucket): string {
  const character = caseFile.characters.find((c) => c.id === characterId)!;
  switch (step) {
    case 'greeting':
      return `The stranger has just come into your room. Greet them as a ${bucket} spirit would. Do not ask who they are yet.\n${LINE_FORMAT}`;
    case 'whoAreYou':
      return `Ask the stranger who they are and where they have come from, in your own manner.\n${LINE_FORMAT}`;
    case 'reaction':
      return `${SENSED[ctx.lastChoiceCategory ?? 'evasive']} React to their answer in one or two sentences.\n${LINE_FORMAT}`;
    case 'riddle':
      return [
        `Set the stranger a riddle about your own life, on the theme of ${character.riddle.theme}.`,
        `Its answer is "${character.riddle.answer}". Write the riddle so that answer fits it, without using the answer's words.`,
        'Also give exactly three wrong answers: plausible, but clearly not the answer.',
        RIDDLE_FORMAT,
      ].join('\n');
    case 'reward': {
      const facts = caseFile.facts.filter((f) => f.holderId === characterId);
      const told = facts.map((f) => `"${f.text}"`).join(' and ');
      const lie = facts.some((f) => f.isLie) ? `\n${LIE_INSTRUCTION}` : '';
      return `The stranger has answered your riddle. Tell them what you know, in your own words, keeping its meaning exactly: ${told}${lie}\n${LINE_FORMAT}`;
    }
    case 'silence':
      return `The stranger got your riddle wrong. Fade away in a few words, telling them nothing.\n${LINE_FORMAT}`;
  }
}

/**
 * The prompt for one step of one spirit. Pure: it depends only on the case file and the context,
 * and it carries only the facts the step allows (none before the reward).
 */
export function buildPrompt(caseFile: CaseFile, characterId: CharacterId, step: SpiritStep, ctx: PromptContext): ChatMessage[] {
  const character = caseFile.characters.find((c) => c.id === characterId);
  if (!character) throw new Error(`no character ${characterId}`);
  const persona = PERSONAS[character.role];
  const bucket = trustBucket(ctx.trust);
  const lines = [
    `You are ${character.name}, ${persona.role}. In life you were ${character.personality}.`,
    `You haunt the ${spaced(character.roomKind)}.`,
    `Speech: ${persona.speech}. Details you might mention: ${persona.details}.`,
    `Towards the stranger you are ${MOODS[bucket]} (trust: ${bucket}).`,
  ];
  if (ctx.lastChoiceText && step === 'reaction') lines.push(`The stranger's answer: "${ctx.lastChoiceText}".`);
  lines.push(`STEP: ${step}`, instruction(caseFile, characterId, step, ctx, bucket));
  return [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: lines.join('\n') },
  ];
}

/** La Sombra: the poisoner, dragged down the cellar stairs, faceless and hateful. */
export function buildTauntPrompt(context: 'chase' | 'whisper'): ChatMessage[] {
  return [
    {
      role: 'system',
      content: [
        'You are La Sombra, a faceless shadow bound to a mansion in 1931: the poisoner of the household, dragged down the cellar stairs by your victims, dead and full of hate.',
        'Never mention being an AI, a model or a game. Never name anyone.',
        'Answer only with JSON in the format asked for.',
      ].join('\n'),
    },
    {
      role: 'user',
      content: [
        'STEP: taunt',
        context === 'chase'
          ? 'You are hunting the trespasser through the corridors. Hiss one taunt at them.'
          : 'You whisper through the walls to the trespasser, unseen. Say one thing to frighten them.',
        'At most 12 words.',
        LINE_FORMAT,
      ].join('\n'),
    },
  ];
}
