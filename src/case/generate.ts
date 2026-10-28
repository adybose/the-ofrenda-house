import { createRng, STREAMS, type Rng, type Seed } from '../core/rng';
import {
  ALIBI_TEXT,
  FAMILY_ROLES,
  FAMILY_SURNAMES,
  FIRST_NAMES,
  MEANS_TEXT,
  NEVER_KILLER,
  NO_MEANS_TEXT,
  OPPORTUNITY_TEXT,
  OTHER_SURNAMES,
  POISON,
  PRESENCE_WEIGHT,
  RIDDLE_BUNDLES,
  ROLE_GENDER,
  ROLE_ORDER,
  ROLE_PRESENCE,
  ROLE_SECRET,
  ROOM_OPTIONS,
  SECRET_TEXT,
  SELF_ALIBI_TEXT,
  SELF_NO_MEANS_TEXT,
} from './pools';
import { solve } from './solve';
import type { CaseFile, Character, CharacterId, Claim, Fact, FactKind, LieKind, Role, RoomKind, Secret } from './types';

/** Attempts before giving up; in practice the first attempt almost always works. */
const MAX_ATTEMPTS = 50;

const LIE_KINDS: readonly LieKind[] = ['selfAlibi', 'selfMeans', 'frameOpportunity', 'frameMeans'];

/** A fact before it has a holder and an id. */
interface Draft {
  kind: FactKind;
  claim: Claim;
  text: string;
}

/** Hands out template lines without repeats, so no two clues in a case read the same. */
function textPicker(rng: Rng, templates: readonly string[]): () => string {
  const queue = rng.shuffle(templates);
  return () => {
    const next = queue.shift();
    if (next === undefined) throw new Error('ran out of clue templates');
    return next;
  };
}

function fill(template: string, names: Record<string, string>): string {
  return template.replace(/\{(\w)\}/g, (_, key: string) => {
    const name = names[key];
    if (name === undefined) throw new Error(`no name for {${key}} in "${template}"`);
    return name;
  });
}

function drawRoles(rng: Rng): Role[] {
  const count = rng.int(7, 8);
  // Housekeeper and cook share one "usually" slot.
  const slots: { value: Role | 'housekeeperOrCook'; weight: number }[] = [
    { value: 'bookkeeper', weight: PRESENCE_WEIGHT.usually },
    { value: 'housekeeperOrCook', weight: PRESENCE_WEIGHT.usually },
    { value: 'eldestChild', weight: PRESENCE_WEIGHT.usually },
    { value: 'doctor', weight: PRESENCE_WEIGHT.sometimes },
    { value: 'grandmother', weight: PRESENCE_WEIGHT.sometimes },
    { value: 'gardener', weight: PRESENCE_WEIGHT.sometimes },
  ];
  const roles: Role[] = ROLE_ORDER.filter((role) => ROLE_PRESENCE[role] === 'always');
  while (roles.length < count) {
    const slot = rng.weighted(slots);
    slots.splice(
      slots.findIndex((s) => s.value === slot),
      1,
    );
    roles.push(slot === 'housekeeperOrCook' ? (rng.chance(0.5) ? 'housekeeper' : 'cook') : slot);
  }
  return ROLE_ORDER.filter((role) => roles.includes(role));
}

function buildCharacters(rng: Rng, roles: readonly Role[]): Character[] {
  const firstNames = { female: rng.shuffle(FIRST_NAMES.female), male: rng.shuffle(FIRST_NAMES.male) };
  const familySurname = rng.pick(FAMILY_SURNAMES);
  const otherSurnames = rng.shuffle(OTHER_SURNAMES);
  const takenRooms = new Set<RoomKind>();

  return roles.map((role) => {
    const gender = ROLE_GENDER[role] ?? (rng.chance(0.5) ? 'female' : 'male');
    const first = firstNames[gender].shift()!;
    const surname = FAMILY_ROLES.has(role) ? familySurname : otherSurnames.shift()!;
    const roomKind = rng.pick(ROOM_OPTIONS[role].filter((room) => !takenRooms.has(room)));
    takenRooms.add(roomKind);
    const bundle = rng.pick(RIDDLE_BUNDLES[role]);

    let name = `${first} ${surname}`;
    let shortName = first;
    if (role === 'patriarch') [name, shortName] = [`Don ${name}`, `Don ${first}`];
    if (role === 'matriarch') [name, shortName] = [`Doña ${name}`, `Doña ${first}`];
    if (role === 'grandmother') [name, shortName] = [`Abuela ${name}`, `Abuela ${first}`];
    if (role === 'doctor') [name, shortName] = [`Dr. ${name}`, `Dr. ${surname}`];

    return { id: role, role, name, shortName, gender, personality: bundle.personality, roomKind, riddle: { ...bundle.riddle } };
  });
}

/** Gives every victim 1 or 2 facts, never one about themselves. Returns undefined if stuck. */
function assignHolders(rng: Rng, drafts: readonly Draft[], victims: readonly CharacterId[]): CharacterId[] | undefined {
  const order = rng.shuffle(drafts.map((_, i) => i));
  const holders = new Array<CharacterId | undefined>(drafts.length);
  const load = new Map(victims.map((v) => [v, 0]));

  // Everyone gets one fact first, so nobody is left empty-handed.
  for (const victim of rng.shuffle(victims)) {
    const pos = order.findIndex((i) => drafts[i]!.claim.subject !== victim);
    if (pos === -1) return undefined;
    holders[order[pos]!] = victim;
    load.set(victim, 1);
    order.splice(pos, 1);
  }
  for (const i of order) {
    const options = victims.filter((v) => load.get(v)! < 2 && drafts[i]!.claim.subject !== v);
    if (options.length === 0) return undefined;
    const holder = rng.pick(options);
    holders[i] = holder;
    load.set(holder, load.get(holder)! + 1);
  }
  return holders as CharacterId[];
}

function attempt(rng: Rng, seed: number): CaseFile | undefined {
  const characters = buildCharacters(rng, drawRoles(rng));
  const byId = new Map(characters.map((c) => [c.id, c]));
  const nameOf = (id: CharacterId) => byId.get(id)!.shortName;
  const patriarch = nameOf('patriarch');

  // Secrets: 3 or 4, never the patriarch.
  const secretCount = rng.int(3, 4);
  const holders = rng.shuffle(characters.filter((c) => c.role !== 'patriarch')).slice(0, secretCount);
  const secrets: Secret[] = holders.map((holder) => {
    const type = ROLE_SECRET[holder.role]!;
    const lover = nameOf(rng.chance(0.5) ? 'patriarch' : 'matriarch');
    const secret = {
      id: `secret-${holder.id}`,
      type,
      holderId: holder.id,
      text: fill(SECRET_TEXT[type], { X: holder.shortName, P: patriarch, L: lover }),
    };
    holder.secretId = secret.id;
    return secret;
  });

  const killer = rng.pick(holders.filter((h) => !NEVER_KILLER.has(h.role)));
  const herrings = holders.filter((h) => h !== killer);
  const lieKind = rng.pick(LIE_KINDS);
  const framed = lieKind === 'frameOpportunity' || lieKind === 'frameMeans' ? rng.pick(herrings) : undefined;

  const text = {
    means: textPicker(rng, MEANS_TEXT),
    noMeans: textPicker(rng, NO_MEANS_TEXT),
    opportunity: textPicker(rng, OPPORTUNITY_TEXT),
    alibi: textPicker(rng, ALIBI_TEXT),
  };
  const motive = (who: Character): Draft => ({
    kind: 'motive',
    claim: { attribute: 'motive', subject: who.id, secretId: who.secretId! },
    text: secrets.find((s) => s.holderId === who.id)!.text,
  });
  const claimDraft = (who: Character, attribute: 'means' | 'opportunity', value: boolean): Draft => {
    const pick = attribute === 'means' ? (value ? text.means : text.noMeans) : value ? text.opportunity : text.alibi;
    return {
      kind: value ? attribute : 'alibi',
      claim: { attribute, subject: who.id, value },
      text: fill(pick(), { X: who.shortName }),
    };
  };

  // The truth: the killer's motive, means and opportunity, and each red herring's motive and clearing fact.
  const killerMotive = motive(killer);
  const killerMeans = claimDraft(killer, 'means', true);
  const killerOpportunity = claimDraft(killer, 'opportunity', true);
  const clearing = new Map<Character, Draft>();
  const truths: Draft[] = [killerMotive, killerMeans, killerOpportunity];
  for (const herring of herrings) {
    const attribute =
      herring === framed ? (lieKind === 'frameMeans' ? 'means' : 'opportunity') : rng.pick(['means', 'opportunity'] as const);
    const clear = claimDraft(herring, attribute, false);
    clearing.set(herring, clear);
    truths.push(motive(herring), clear);
  }

  // The lie, and the true fact it contradicts.
  let lie: Draft;
  let contradicted: Draft;
  if (lieKind === 'selfAlibi') {
    lie = { kind: 'alibi', claim: { attribute: 'opportunity', subject: killer.id, value: false }, text: rng.pick(SELF_ALIBI_TEXT) };
    contradicted = killerOpportunity;
  } else if (lieKind === 'selfMeans') {
    lie = { kind: 'alibi', claim: { attribute: 'means', subject: killer.id, value: false }, text: rng.pick(SELF_NO_MEANS_TEXT) };
    contradicted = killerMeans;
  } else {
    lie = claimDraft(framed!, lieKind === 'frameMeans' ? 'means' : 'opportunity', true);
    contradicted = clearing.get(framed!)!;
  }

  const victims = characters.filter((c) => c.role !== 'patriarch' && c !== killer).map((c) => c.id);
  const truthHolders = assignHolders(rng, truths, victims);
  if (!truthHolders) return undefined;

  const ids = new Map<Draft, string>();
  const facts: Fact[] = [...truths, lie].map((draft, i) => {
    const id = `fact-${i + 1}`;
    ids.set(draft, id);
    const holderId = draft === lie ? killer.id : truthHolders[i]!;
    return { id, holderId, kind: draft.kind, text: draft.text, isLie: draft === lie, claim: draft.claim };
  });

  return {
    seed,
    characters,
    secrets,
    killerId: killer.id,
    motiveSecretId: killer.secretId!,
    means: POISON,
    motiveFactId: ids.get(killerMotive)!,
    meansFactId: ids.get(killerMeans)!,
    opportunityFactId: ids.get(killerOpportunity)!,
    lie: { factId: ids.get(lie)!, contradictsFactId: ids.get(contradicted)!, kind: lieKind },
    facts,
  };
}

/**
 * Builds the household, secrets, killer and clues for a run. Every case is
 * checked with the solver before it is returned: with all facts known, the
 * killer is the only consistent suspect.
 */
export function generateCase(seed: Seed): CaseFile {
  const run = createRng(seed);
  const base = run.fork(STREAMS.case);
  for (let i = 0; i < MAX_ATTEMPTS; i++) {
    const caseFile = attempt(base.fork(`attempt:${i}`), run.seed);
    if (!caseFile) continue;
    const suspects = solve(caseFile);
    if (suspects.length === 1 && suspects[0] === caseFile.killerId) return caseFile;
  }
  throw new Error(`could not build a solvable case for seed ${String(seed)}`);
}
