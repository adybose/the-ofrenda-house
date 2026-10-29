import { generateCase } from '../../src/case/generate';
import type { CaseFile, Character, CharacterId } from '../../src/case/types';
import { createRng, hashSeed } from '../../src/core/rng';
import { trustBucket } from '../../src/dialogue/trust';
import { fallbackLine, riddleFor } from '../../src/dialogue/fallback-lines';
import { SHADOW_TAUNTS } from '../fallbacks';
import { LruCache } from './cache';
import { OllamaClient, type OllamaConfig, type Priority } from './ollama';
import { buildPrompt, buildTauntPrompt } from './prompts';
import { schemaFor, type LineOutput, type RiddleOutput } from './schemas';
import type { ChatMessage, LineRequest, LineResponse, SpiritStep, Step, TauntRequest } from './types';
import { validateStep, type ValidationContext } from './validate';

/** Leave a retry only if at least this much of the budget is left. */
const MIN_RETRY_MS = 50;
/** Steps worth preparing before the player reaches the room. */
const PREFETCHED: readonly SpiritStep[] = ['greeting', 'riddle'];

export interface Bridge {
  line(request: LineRequest): Promise<LineResponse>;
  prefetch(seed: number | string, characterIds: readonly string[], trust: number): void;
  taunt(request: TauntRequest): Promise<{ source: 'llm' | 'fallback'; line: string }>;
  available(): Promise<boolean>;
  idle(): Promise<void>;
  caseFor(seed: number | string): CaseFile;
}

/** The model likes Markdown emphasis (`*amigo*`); the dialogue box shows plain text. */
function tidy(output: unknown): unknown {
  const plain = (text: unknown) => (typeof text === 'string' ? text.replace(/[*_]{1,3}([^*_]+)[*_]{1,3}/g, '$1').trim() : text);
  if (!output || typeof output !== 'object') return output;
  const o = output as Record<string, unknown>;
  return {
    ...o,
    ...('line' in o ? { line: plain(o.line) } : {}),
    ...('question' in o ? { question: plain(o.question) } : {}),
    ...(Array.isArray(o.wrongAnswers) ? { wrongAnswers: o.wrongAnswers.map(plain) } : {}),
  };
}

export interface BridgeHooks {
  /** Called with each line a prefetch has ready, so its speech can be prefetched too (spec 09). */
  onPrefetched?(seed: number, characterId: CharacterId, response: LineResponse): void;
}

export function createBridge(config: OllamaConfig, hooks: BridgeHooks = {}): Bridge {
  const client = new OllamaClient(config);
  const cases = new LruCache<CaseFile>(16);
  const cache = new LruCache<LineResponse>(256);

  const caseFor = (seed: number | string): CaseFile => {
    const key = String(hashSeed(seed));
    let caseFile = cases.get(key);
    if (!caseFile) {
      caseFile = generateCase(seed);
      cases.set(key, caseFile);
    }
    return caseFile;
  };

  const context = (caseFile: CaseFile, character: Character, step: Step): ValidationContext => {
    const allowed = step === 'reward' ? caseFile.facts.filter((f) => f.holderId === character.id).map((f) => f.text) : [];
    const otherNames = caseFile.characters
      .filter((c) => c.id !== character.id)
      .flatMap((c) => [c.shortName, c.name.replace(/^(?:Don|Doña|Abuela|Dr\.) /, '').split(' ')[0]!]);
    return { answer: character.riddle.answer, otherNames: [...new Set(otherNames)], allowedText: allowed.join(' ') };
  };

  /** Asks the model, checks the answer, and tries once more while the budget allows. */
  async function ask(messages: ChatMessage[], step: Step, ctx: ValidationContext, priority: Priority, budgetMs: number): Promise<LineOutput | RiddleOutput | undefined> {
    const deadline = Date.now() + budgetMs;
    for (let attempt = 0; attempt < 2 && deadline - Date.now() > MIN_RETRY_MS; attempt++) {
      try {
        const output = tidy(await client.chat(messages, schemaFor(step), priority, deadline));
        const result = validateStep(step, output, ctx);
        if (result.ok) return result.value;
      } catch {
        // Down, slow or garbled: try again if there's time, then fall back.
      }
    }
    return undefined;
  }

  function toResponse(seed: number, character: Character, step: SpiritStep, output: LineOutput | RiddleOutput): LineResponse {
    if (step === 'riddle') {
      const { question, wrongAnswers } = output as RiddleOutput;
      return { source: 'llm', line: question, riddle: riddleFor(seed, character, question, wrongAnswers) };
    }
    return { source: 'llm', line: (output as LineOutput).line };
  }

  const cacheKey = (seed: number, characterId: string, step: SpiritStep, trust: number) => `${seed}|${characterId}|${step}|${trustBucket(trust)}`;

  return {
    caseFor,

    async line(request) {
      const caseFile = caseFor(request.seed);
      const seed = hashSeed(request.seed);
      const character = caseFile.characters.find((c) => c.id === request.characterId);
      if (!character) throw new Error(`no character ${request.characterId}`);
      if (PREFETCHED.includes(request.step)) {
        const cached = cache.get(cacheKey(seed, character.id, request.step, request.trust));
        if (cached) return cached;
      }
      const output = await ask(buildPrompt(caseFile, character.id, request.step, request), request.step, context(caseFile, character, request.step), 'live', config.liveTimeoutMs);
      return output ? toResponse(seed, character, request.step, output) : fallbackLine(seed, caseFile, character, request);
    },

    prefetch(seedInput, characterIds, trust) {
      const caseFile = caseFor(seedInput);
      const seed = hashSeed(seedInput);
      for (const id of characterIds) {
        const character = caseFile.characters.find((c) => c.id === id);
        if (!character) continue;
        for (const step of PREFETCHED) {
          const key = cacheKey(seed, id, step, trust);
          if (cache.has(key)) continue;
          void ask(buildPrompt(caseFile, character.id, step, { trust }), step, context(caseFile, character, step), 'prefetch', config.prefetchTimeoutMs).then((output) => {
            if (!output) return;
            const response = toResponse(seed, character, step, output);
            cache.set(key, response);
            hooks.onPrefetched?.(seed, character.id, response);
          });
        }
      }
    },

    async taunt({ seed, context: where }) {
      const output = await ask(buildTauntPrompt(where), 'taunt', { otherNames: caseFor(seed).characters.map((c) => c.shortName), allowedText: '' }, 'live', config.liveTimeoutMs);
      if (output) return { source: 'llm', line: (output as LineOutput).line };
      const rng = createRng(hashSeed(seed)).fork('dialogue').fork(`taunt:${Date.now()}`);
      return { source: 'fallback', line: rng.pick(SHADOW_TAUNTS) };
    },

    available: async () => (await client.model()) !== undefined,
    idle: () => client.idle(),
  };
}
