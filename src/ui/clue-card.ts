import type { CharacterId, Fact, FactKind } from '../case/types';

/** A clue as the player keeps it: always the case file's own words, never the spirit's (spec 08). */
export interface ClueCard {
  factId: string;
  kind: FactKind;
  holderId: CharacterId;
  text: string;
}

export function clueCardFrom(fact: Fact): ClueCard {
  return { factId: fact.id, kind: fact.kind, holderId: fact.holderId, text: fact.text };
}
