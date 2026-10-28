import type { Gender, Riddle, Role, RoomKind, SecretType } from './types';

export type Presence = 'always' | 'usually' | 'sometimes';

/** How often each role is drawn, from docs/story.md. Housekeeper and cook share one slot. */
export const ROLE_PRESENCE: Record<Role, Presence> = {
  patriarch: 'always',
  painter: 'always',
  matriarch: 'always',
  bookkeeper: 'usually',
  housekeeper: 'usually',
  cook: 'usually',
  eldestChild: 'usually',
  doctor: 'sometimes',
  grandmother: 'sometimes',
  gardener: 'sometimes',
};

/** Canonical order, so characters always come out in the same order for a seed. */
export const ROLE_ORDER: readonly Role[] = [
  'patriarch',
  'painter',
  'matriarch',
  'bookkeeper',
  'housekeeper',
  'cook',
  'eldestChild',
  'doctor',
  'grandmother',
  'gardener',
];

export const PRESENCE_WEIGHT: Record<Exclude<Presence, 'always'>, number> = { usually: 3, sometimes: 1 };

/** Fixed genders; every other role is drawn. */
export const ROLE_GENDER: Partial<Record<Role, Gender>> = {
  patriarch: 'male',
  matriarch: 'female',
  grandmother: 'female',
};

/** Roles that carry the family surname. */
export const FAMILY_ROLES: ReadonlySet<Role> = new Set(['patriarch', 'matriarch', 'bookkeeper', 'eldestChild', 'grandmother']);

export const ROOM_OPTIONS: Record<Role, readonly RoomKind[]> = {
  patriarch: ['study'],
  painter: ['studio'],
  matriarch: ['greenhouse', 'conservatory'],
  bookkeeper: ['library', 'countingRoom'],
  housekeeper: ['servantsStairs', 'linenRoom'],
  cook: ['kitchen', 'pantry'],
  eldestChild: ['musicRoom'],
  doctor: ['guestRoom'],
  grandmother: ['kitchen', 'chapel', 'sewingRoom'],
  gardener: ['pottingRoom'],
};

export const FIRST_NAMES: Record<Gender, readonly string[]> = {
  female: [
    'Inés', 'Lucía', 'Rosa', 'Carmen', 'Elvira', 'Consuelo', 'Remedios', 'Pilar',
    'Beatriz', 'Amparo', 'Soledad', 'Dolores', 'Teresa', 'Graciela', 'Josefina', 'Esperanza',
  ],
  male: [
    'Aurelio', 'Tomás', 'Mateo', 'Salvador', 'Ignacio', 'Rafael', 'Joaquín', 'Emilio',
    'Fermín', 'Julián', 'Benito', 'Ernesto', 'Octavio', 'Lorenzo', 'Severo', 'Anselmo',
  ],
};

export const FAMILY_SURNAMES: readonly string[] = [
  'Villaseñor', 'Altamirano', 'Echeverría', 'Montenegro', 'Cienfuegos', 'Valdivia', 'Arriaga', 'Santibáñez',
];

export const OTHER_SURNAMES: readonly string[] = [
  'Reyes', 'Ortega', 'Lozano', 'Fuentes', 'Salinas', 'Duarte', 'Medina', 'Paredes', 'Robles', 'Zamora',
];

export interface RiddleBundle {
  personality: string;
  riddle: Riddle;
}

/** Personality and riddle drawn together, so the riddle is about the character's own life. */
export const RIDDLE_BUNDLES: Record<Role, readonly RiddleBundle[]> = {
  patriarch: [
    { personality: 'a proud collector of clocks', riddle: { theme: 'clocks', answer: 'A pendulum' } },
    { personality: 'a silver-mine owner who trusted no one', riddle: { theme: 'silver', answer: 'Silver' } },
    { personality: 'a bookish man who kept every letter he was ever sent', riddle: { theme: 'letters', answer: 'A wax seal' } },
  ],
  painter: [
    { personality: 'a quiet painter of the family portraits', riddle: { theme: 'portraits', answer: 'A paintbrush' } },
    { personality: 'a restless painter who only worked at night', riddle: { theme: 'night painting', answer: 'Candlelight' } },
    { personality: 'a painter who ground every colour by hand', riddle: { theme: 'pigments', answer: 'Cochineal' } },
  ],
  matriarch: [
    { personality: 'the keeper of the greenhouse, fond of rare orchids', riddle: { theme: 'orchids', answer: 'An orchid' } },
    { personality: 'a devout woman who never missed mass', riddle: { theme: 'devotion', answer: 'A rosary' } },
    { personality: 'a hostess famous for her dinners', riddle: { theme: 'dinners', answer: 'A silver bell' } },
  ],
  bookkeeper: [
    { personality: 'a nervous clerk who counted everything twice', riddle: { theme: 'ledgers', answer: 'A ledger' } },
    { personality: 'a chess player who never lost a game', riddle: { theme: 'chess', answer: 'A pawn' } },
    { personality: 'a dreamer who wrote verses in the margins of the accounts', riddle: { theme: 'verses', answer: 'An inkwell' } },
  ],
  housekeeper: [
    { personality: 'a tireless housekeeper who carried every key in the house', riddle: { theme: 'keys', answer: 'A ring of keys' } },
    { personality: 'a superstitious housekeeper who read fortunes in the cards', riddle: { theme: 'fortunes', answer: 'A tarot card' } },
    { personality: 'a strict housekeeper who starched every sheet', riddle: { theme: 'linen', answer: 'Starch' } },
  ],
  cook: [
    { personality: 'a cook famous for mole negro', riddle: { theme: 'mole', answer: 'Chocolate' } },
    { personality: 'a cook who baked pan de muerto every November', riddle: { theme: 'bread', answer: 'Pan de muerto' } },
    { personality: 'a cook who sang while grinding corn', riddle: { theme: 'corn', answer: 'A metate' } },
  ],
  eldestChild: [
    { personality: 'a gifted pianist', riddle: { theme: 'piano', answer: 'A piano key' } },
    { personality: 'a reckless rider who loved the stables', riddle: { theme: 'horses', answer: 'A horseshoe' } },
    { personality: 'a would-be poet who never finished a poem', riddle: { theme: 'poems', answer: 'A torn page' } },
  ],
  doctor: [
    { personality: 'a physician who swore by tonics', riddle: { theme: 'tonics', answer: 'A medicine bottle' } },
    { personality: 'a doctor who played cards until dawn', riddle: { theme: 'cards', answer: 'A deck of cards' } },
    { personality: 'a doctor who studied the stars', riddle: { theme: 'stars', answer: 'A telescope' } },
  ],
  grandmother: [
    { personality: 'a sharp-eyed grandmother who never forgot a face', riddle: { theme: 'memory', answer: 'A photograph' } },
    { personality: 'a grandmother who embroidered every tablecloth', riddle: { theme: 'embroidery', answer: 'A needle' } },
    { personality: 'a grandmother who told ghost stories by the stove', riddle: { theme: 'ghost stories', answer: 'La Llorona' } },
  ],
  gardener: [
    { personality: 'a gardener who spoke to the plants', riddle: { theme: 'plants', answer: 'A seed' } },
    { personality: 'a gardener who grew cempasúchil for the ofrenda', riddle: { theme: 'marigolds', answer: 'A marigold' } },
    { personality: 'a gardener who kept bees', riddle: { theme: 'bees', answer: 'Honey' } },
  ],
};

/** Each role's possible secret, from docs/story.md. The patriarch has none. */
export const ROLE_SECRET: Partial<Record<Role, SecretType>> = {
  painter: 'hiddenHeir',
  matriarch: 'leavingWithLover',
  bookkeeper: 'embezzler',
  housekeeper: 'spurnedLover',
  cook: 'spurnedLover',
  eldestChild: 'adopted',
  doctor: 'gamblingDebts',
  grandmother: 'familyScandal',
  gardener: 'trueHeir',
};

/** Roles that can never be the killer. */
export const NEVER_KILLER: ReadonlySet<Role> = new Set(['patriarch', 'painter', 'grandmother']);

/** Secret types that can be a killer's motive (all but the painter's and the grandmother's). */
export const KILLER_SECRET_TYPES: readonly SecretType[] = [
  'leavingWithLover',
  'embezzler',
  'spurnedLover',
  'adopted',
  'gamblingDebts',
  'trueHeir',
];

/** The poison, always the same. */
export const POISON = 'a tincture brewed from the white flower in the greenhouse';

// Clue text. {X} is the subject's short name, {P} the patriarch's, {L} a lover's.
// Clues are spoken by their holder, so "I" and "my" mean the holder.

export const SECRET_TEXT: Record<SecretType, string> = {
  hiddenHeir: "{X} was secretly {P}'s child by another woman, an heir no one else knew about.",
  leavingWithLover: "{X} was in love with someone else in this house and meant to run away with the family's money.",
  embezzler: '{X} had been stealing from the estate and needed the will read before anyone checked the books.',
  spurnedLover: '{X} was the secret lover of {L}, and was promised an inheritance that never came.',
  adopted: '{X} had found adoption papers in the study, and a new will with nothing in it for an adopted child.',
  gamblingDebts: "{X} owed a fortune at the card tables, and was the one who prescribed the household's tonic.",
  familyScandal: '{X} was hiding an old family scandal and would have done anything to keep it buried.',
  trueHeir: "{X} was {P}'s child from a first marriage, and the true heir to this house.",
};

/** Someone handled the poison. */
export const MEANS_TEXT: readonly string[] = [
  'I saw {X} in the greenhouse after midnight, cutting the white flowers.',
  '{X} kept a little brown bottle that smelled of the white greenhouse flower.',
  '{X} asked me which of the greenhouse flowers could stop a heart.',
];

/** Someone never touched the poison. */
export const NO_MEANS_TEXT: readonly string[] = [
  'The scent of the white flower made {X} faint. {X} never set foot in the greenhouse.',
  '{X} broke out in welts at the touch of the white flower and would never have handled it.',
  "I searched {X}'s room after the first death. There was no trace of the white flower.",
  'The greenhouse key never left my keeping that autumn, and {X} never once asked me for it.',
];

/** Someone was alone with the tonic or the food. */
export const OPPORTUNITY_TEXT: readonly string[] = [
  'On the last night, I saw {X} carry the tonic tray upstairs alone.',
  'I saw {X} stirring something into the evening chocolate when no one else was in the kitchen.',
  '{X} was the only one awake when the tonic was poured that last night.',
];

/** Someone was elsewhere. */
export const ALIBI_TEXT: readonly string[] = [
  '{X} spent that whole last night at my bedside and never left the room.',
  '{X} was in town that last night, at the cantina until dawn. Half the town saw.',
  'The storm trapped {X} at the chapel by the road that last night.',
  '{X} sat up with me in the nursery all that last night. We heard the clock strike every hour.',
];

/** The killer's lie when it is a false alibi for themselves. */
export const SELF_ALIBI_TEXT: readonly string[] = [
  'I never left the chapel that last night. I prayed until the bells rang at dawn.',
  'I was in town that last night, and did not come home until the funeral bells.',
];

/** The killer's lie when it denies touching the poison. */
export const SELF_NO_MEANS_TEXT: readonly string[] = [
  'I never set foot in that greenhouse. I could not bear the smell of those white flowers.',
  'I never touched the white flower. I did not even know it was poisonous.',
];
