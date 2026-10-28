export type Role =
  | 'patriarch'
  | 'painter'
  | 'matriarch'
  | 'bookkeeper'
  | 'housekeeper'
  | 'cook'
  | 'eldestChild'
  | 'doctor'
  | 'grandmother'
  | 'gardener';

export type SecretType =
  | 'hiddenHeir'
  | 'leavingWithLover'
  | 'embezzler'
  | 'spurnedLover'
  | 'adopted'
  | 'gamblingDebts'
  | 'familyScandal'
  | 'trueHeir';

export type RoomKind =
  | 'study'
  | 'studio'
  | 'greenhouse'
  | 'conservatory'
  | 'library'
  | 'countingRoom'
  | 'servantsStairs'
  | 'linenRoom'
  | 'kitchen'
  | 'pantry'
  | 'musicRoom'
  | 'guestRoom'
  | 'chapel'
  | 'sewingRoom'
  | 'pottingRoom';

export type Gender = 'female' | 'male';

/** Character ids are the role names, since each role appears at most once. */
export type CharacterId = Role;

export interface Riddle {
  /** Unique across all roles, so spec 08 can key fallback riddles by theme. */
  theme: string;
  /** The one correct answer; the model only writes the wrong ones. */
  answer: string;
}

export interface Character {
  id: CharacterId;
  role: Role;
  /** Full name with honorific, e.g. "Don Aurelio Villaseñor". */
  name: string;
  /** How others refer to them in clues, e.g. "Don Aurelio". */
  shortName: string;
  gender: Gender;
  personality: string;
  roomKind: RoomKind;
  riddle: Riddle;
  secretId?: string;
}

export interface Secret {
  id: string;
  type: SecretType;
  holderId: CharacterId;
  /** The motive, as it reads on a clue card. */
  text: string;
}

export type Claim =
  | { attribute: 'motive'; subject: CharacterId; secretId: string }
  | { attribute: 'means' | 'opportunity'; subject: CharacterId; value: boolean };

export type FactKind = 'motive' | 'means' | 'opportunity' | 'alibi';

export interface Fact {
  id: string;
  holderId: CharacterId;
  kind: FactKind;
  /** The clue card text. Spirits voice it, but never change it. */
  text: string;
  isLie: boolean;
  claim: Claim;
}

export type LieKind = 'selfAlibi' | 'selfMeans' | 'frameOpportunity' | 'frameMeans';

export interface CaseFile {
  seed: number;
  characters: Character[];
  secrets: Secret[];
  killerId: CharacterId;
  motiveSecretId: string;
  /** The poison, for prompts and the ending. */
  means: string;
  motiveFactId: string;
  meansFactId: string;
  opportunityFactId: string;
  lie: { factId: string; contradictsFactId: string; kind: LieKind };
  facts: Fact[];
}
