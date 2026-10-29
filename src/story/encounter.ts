import type { CaseFile, CharacterId } from '../case/types';
import type { Reply } from '../dialogue/replies';
import { trustBucket } from '../dialogue/trust';
import type { KeyRoomState } from '../world/types';

/**
 * One spirit's encounter (spec 11), as a pure reducer: the steps run strictly in order, appear → who
 * are you → reaction → riddle → reward or silence → done. Each transition lists what it emits; the
 * controller shows the lines and passes those on to the event bus.
 */
export type EncounterStep = 'appear' | 'whoAreYou' | 'reaction' | 'riddle' | 'reward' | 'silence' | 'done';

export type EncounterEmit =
  | { name: 'encounterStarted'; characterId: CharacterId }
  | { name: 'clueAwarded'; factId: string }
  | { name: 'keyAwarded'; keyId: string }
  | { name: 'riddleFailed'; characterId: CharacterId }
  | { name: 'encounterEnded'; characterId: CharacterId; outcome: 'reward' | 'silence' };

export interface EncounterState {
  characterId: CharacterId;
  step: EncounterStep;
  /** This spirit's trust, 0..100. */
  trust: number;
  /** The case-file facts its clue cards show, and the keys it holds: given only as a reward. */
  factIds: readonly string[];
  keyIds: readonly string[];
  /** A warm spirit allows one second try at the riddle, with the wrong option removed. */
  secondTry: boolean;
  removed: readonly number[];
  /** What the last transition emitted. */
  emits: readonly EncounterEmit[];
}

export type EncounterEvent =
  | { type: 'greeted' }
  | { type: 'replied'; reply: Reply }
  | { type: 'reacted' }
  | { type: 'answered'; index: number; correctIndex: number }
  | { type: 'ended' };

export interface EncounterSetup {
  characterId: CharacterId;
  factIds: string[];
  keyIds: string[];
}

/** A spirit's clue cards (its case-file facts) and the keys it holds (spec 03's lock plan). */
export function encounterSetup(caseFile: CaseFile, keyRooms: readonly KeyRoomState[], characterId: CharacterId): EncounterSetup {
  return {
    characterId,
    factIds: caseFile.facts.filter((f) => f.holderId === characterId).map((f) => f.id),
    keyIds: keyRooms.filter((k) => k.keyHolderId === characterId).map((k) => k.keyId),
  };
}

export function startEncounter(setup: EncounterSetup & { trust: number }): EncounterState {
  return {
    ...setup,
    step: 'appear',
    secondTry: false,
    removed: [],
    emits: [{ name: 'encounterStarted', characterId: setup.characterId }],
  };
}

export function encounterReducer(state: EncounterState, event: EncounterEvent): EncounterState {
  const next = (changes: Partial<EncounterState>, emits: EncounterEmit[] = []): EncounterState => ({ ...state, ...changes, emits });
  const unchanged = () => (state.emits.length ? { ...state, emits: [] } : state);
  switch (event.type) {
    case 'greeted':
      return state.step === 'appear' ? next({ step: 'whoAreYou' }) : unchanged();
    case 'replied':
      return state.step === 'whoAreYou' ? next({ step: 'reaction', trust: Math.max(0, Math.min(100, state.trust + event.reply.trustDelta)) }) : unchanged();
    case 'reacted':
      return state.step === 'reaction' ? next({ step: 'riddle' }) : unchanged();
    case 'answered': {
      if (state.step !== 'riddle') return unchanged();
      if (event.index === event.correctIndex) {
        return next({ step: 'reward' }, [
          ...state.factIds.map((factId): EncounterEmit => ({ name: 'clueAwarded', factId })),
          ...state.keyIds.map((keyId): EncounterEmit => ({ name: 'keyAwarded', keyId })),
        ]);
      }
      if (!state.secondTry && trustBucket(state.trust) === 'warm') return next({ secondTry: true, removed: [...state.removed, event.index] });
      return next({ step: 'silence' }, [{ name: 'riddleFailed', characterId: state.characterId }]);
    }
    case 'ended':
      if (state.step !== 'reward' && state.step !== 'silence') return unchanged();
      return next({ step: 'done' }, [{ name: 'encounterEnded', characterId: state.characterId, outcome: state.step }]);
  }
}
