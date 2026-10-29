import type { CaseFile, CharacterId } from '../case/types';
import type { LineRequest, LineResponse, ReplyCategory, SpiritStep } from '../../server/llm/types';
import { fallbackLine } from './fallback-lines';

export type { LineResponse } from '../../server/llm/types';

/** How long to wait for the local server before speaking a hand-written line instead. */
const LINE_TIMEOUT_MS = 6000;

export interface LineQuery {
  characterId: CharacterId;
  step: SpiritStep;
  trust: number;
  lastChoiceText?: string;
  lastChoiceCategory?: ReplyCategory;
}

/**
 * A response the game can trust: a line of text, and for a riddle 4 different options with the case
 * file's answer exactly once, at `correctIndex`. The server checks the model; this checks the server.
 */
function trustworthy(response: unknown, query: LineQuery, caseFile: CaseFile): response is LineResponse {
  if (!response || typeof response !== 'object') return false;
  const r = response as Partial<LineResponse>;
  if (typeof r.line !== 'string' || !r.line.trim()) return false;
  if (query.step !== 'riddle') return true;
  const answer = caseFile.characters.find((c) => c.id === query.characterId)?.riddle.answer;
  const riddle = r.riddle;
  return (
    !!riddle &&
    Array.isArray(riddle.options) &&
    riddle.options.length === 4 &&
    riddle.options.every((o) => typeof o === 'string' && o.trim()) &&
    new Set(riddle.options).size === 4 &&
    riddle.options.filter((o) => o === answer).length === 1 &&
    riddle.options[riddle.correctIndex] === answer
  );
}

/**
 * One line of a spirit's encounter from the local server (the model, or its fallbacks), or, if the
 * server is down, slow or sends anything odd, the same hand-written lines chosen here.
 */
export async function fetchLine(seed: number, caseFile: CaseFile, query: LineQuery): Promise<LineResponse> {
  const local = () => fallbackLine(seed, caseFile, caseFile.characters.find((c) => c.id === query.characterId)!, query);
  try {
    const body: LineRequest = { seed, ...query };
    const response = await fetch('/api/spirit/line', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(LINE_TIMEOUT_MS),
    });
    if (!response.ok) return local();
    const json: unknown = await response.json();
    return trustworthy(json, query, caseFile) ? json : local();
  } catch {
    return local();
  }
}

/** Asks the server to prepare these spirits' lines (and their speech) ahead of time. Failures don't matter. */
export function prefetchLines(seed: number, characterIds: readonly CharacterId[], trust: number): void {
  void fetch('/api/spirit/prefetch', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ seed, characterIds, trust }),
  }).catch(() => undefined);
}
