import type { CaseFile, CharacterId } from '../case/types';
import { solve } from '../case/solve';
import type { TrustBucket } from '../dialogue/trust';
import type { KeyRoomState } from '../world/types';

/**
 * Naming the killer (spec 21), pure: when a spirit asks, whom the player may name, and which key it
 * leaves for the answer.
 */

/** The key to the way out: it opens the dining room and its garden door. */
export const EXIT_KEY = 'key:exit';
/** Solve this many riddles and a spirit asks, even if the cards alone aren't conclusive. */
export const ENOUGH_RIDDLES = 4;

/** Enough to name someone: the cards leave one suspect, or enough riddles have been solved. */
export function enoughClues(caseFile: CaseFile, heldFactIds: readonly string[], solvedCount: number): boolean {
  return solvedCount >= ENOUGH_RIDDLES || solve(caseFile, heldFactIds).length === 1;
}

/** Whom the player may name: everyone with a secret (the killer always has one), in household order. */
export function accusationOptions(caseFile: CaseFile): CharacterId[] {
  return caseFile.characters.filter((c) => c.secretId !== undefined && c.role !== 'patriarch').map((c) => c.id);
}

/** The key laid for an answer: the way out if right; else a still-locked room's key not yet given, if any. */
export function accusationKey(input: { correct: boolean; locked: readonly KeyRoomState[]; given: ReadonlySet<string> }): string | undefined {
  if (input.correct) return EXIT_KEY;
  return input.locked.find((k) => k.locked && !input.given.has(k.keyId))?.keyId;
}

/** The question, by how much the spirit trusts the player. */
export const ACCUSE_LINES: Record<TrustBucket, string> = {
  wary: 'You have heard us all. So. Who did this to us?',
  neutral: 'Tell me, stranger… who did this to us?',
  warm: 'You have listened well, child. Tell me… who did this to us?',
};

export const LAUGH_LINE = 'Ha… ha ha ha ha!';
