import type { CharacterId, Claim, Fact } from './types';

/** Two claims contradict when they give opposite values for the same subject and attribute. */
export function contradicts(a: Claim, b: Claim): boolean {
  if (a.attribute === 'motive' || b.attribute === 'motive') return false;
  return a.attribute === b.attribute && a.subject === b.subject && a.value !== b.value;
}

function negate(claim: Claim): Claim | undefined {
  // A lie about a motive just removes the motive; there is no "no motive" claim.
  if (claim.attribute === 'motive') return undefined;
  return { ...claim, value: !claim.value };
}

function clears(claim: Claim, suspect: CharacterId): boolean {
  return claim.attribute !== 'motive' && claim.subject === suspect && !claim.value;
}

function consistentAsKiller(suspect: CharacterId, known: readonly Fact[], lie: Fact | undefined): boolean {
  const accepted: Claim[] = [];
  for (const fact of known) {
    if (fact === lie) {
      const opposite = negate(fact.claim);
      if (opposite) accepted.push(opposite);
    } else {
      accepted.push(fact.claim);
    }
  }
  if (!accepted.some((c) => c.attribute === 'motive' && c.subject === suspect)) return false;
  if (accepted.some((c) => clears(c, suspect))) return false;
  for (let i = 0; i < accepted.length; i++) {
    for (let j = i + 1; j < accepted.length; j++) {
      if (contradicts(accepted[i]!, accepted[j]!)) return false;
    }
  }
  return true;
}

/**
 * The suspects still consistent with the known facts. A suspect is anyone
 * whose motive is known. Suspect k stays when, taking every fact held by
 * others as true and at most one of k's own facts as the lie, nothing
 * contradicts and nothing clears k. With no ids given, every fact is known.
 */
export function solve(caseFile: { facts: readonly Fact[] }, knownFactIds?: readonly string[]): CharacterId[] {
  const ids = knownFactIds ? new Set(knownFactIds) : undefined;
  const known = ids ? caseFile.facts.filter((f) => ids.has(f.id)) : caseFile.facts;

  const suspects: CharacterId[] = [];
  for (const fact of known) {
    if (fact.claim.attribute === 'motive' && !suspects.includes(fact.claim.subject)) suspects.push(fact.claim.subject);
  }

  return suspects.filter((suspect) => {
    const ownFacts = known.filter((f) => f.holderId === suspect);
    return [undefined, ...ownFacts].some((lie) => consistentAsKiller(suspect, known, lie));
  });
}
