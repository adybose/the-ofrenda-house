import { beforeAll, describe, expect, it } from 'vitest';
import { generateCase } from '../../src/case/generate';
import { KILLER_SECRET_TYPES, RIDDLE_BUNDLES, ROLE_PRESENCE } from '../../src/case/pools';
import { contradicts, solve } from '../../src/case/solve';
import type { CaseFile, Character, Fact } from '../../src/case/types';

const SEEDS = Array.from({ length: 1_000 }, (_, i) => i);
let cases: CaseFile[] = [];

beforeAll(() => {
  cases = SEEDS.map((seed) => generateCase(seed));
});

function characterById(caseFile: CaseFile, id: string): Character {
  const character = caseFile.characters.find((c) => c.id === id);
  if (!character) throw new Error(`no character ${id}`);
  return character;
}

function factsHeldBy(caseFile: CaseFile, id: string): Fact[] {
  return caseFile.facts.filter((f) => f.holderId === id);
}

function redHerrings(caseFile: CaseFile): Character[] {
  return caseFile.characters.filter((c) => c.secretId !== undefined && c.id !== caseFile.killerId);
}

describe('determinism', () => {
  it('gives the same case file for the same seed', () => {
    for (const seed of [0, 1, 42, 999, 123456789]) {
      expect(generateCase(seed)).toEqual(generateCase(seed));
    }
    expect(generateCase('elena')).toEqual(generateCase('elena'));
  });

  it('gives different households for different seeds', () => {
    const fingerprints = new Set(cases.map((c) => c.characters.map((ch) => ch.name).join('|')));
    expect(fingerprints.size).toBeGreaterThan(990);
  });
});

describe('the household', () => {
  it('has 7 or 8 characters, always with the patriarch, painter and matriarch', () => {
    for (const c of cases) {
      expect(c.characters.length).toBeGreaterThanOrEqual(7);
      expect(c.characters.length).toBeLessThanOrEqual(8);
      const roles = c.characters.map((ch) => ch.role);
      expect(roles).toEqual(expect.arrayContaining(['patriarch', 'painter', 'matriarch']));
      expect(new Set(roles).size).toBe(roles.length);
      expect(roles.includes('housekeeper') && roles.includes('cook')).toBe(false);
    }
  });

  it('gives every character a unique id, name and room, and a personality and riddle', () => {
    for (const c of cases) {
      for (const key of ['id', 'name', 'shortName', 'roomKind'] as const) {
        const values = c.characters.map((ch) => ch[key]);
        expect(new Set(values).size, key).toBe(values.length);
      }
      for (const ch of c.characters) {
        expect(ch.personality.length).toBeGreaterThan(0);
        expect(ch.riddle.theme.length).toBeGreaterThan(0);
        expect(ch.riddle.answer.length).toBeGreaterThan(0);
        expect(RIDDLE_BUNDLES[ch.role].map((b) => b.riddle.theme)).toContain(ch.riddle.theme);
      }
    }
  });

  it('uses each riddle theme for only one role, so spec 08 can key fallbacks by theme', () => {
    const themes = Object.values(RIDDLE_BUNDLES).flatMap((bundles) => bundles.map((b) => b.riddle.theme));
    expect(new Set(themes).size).toBe(themes.length);
  });

  it('draws every "usually" role more often than every "sometimes" role', () => {
    const counts = new Map<string, number>();
    for (const c of cases) for (const ch of c.characters) counts.set(ch.role, (counts.get(ch.role) ?? 0) + 1);
    const usually = ['bookkeeper', 'eldestChild'].map((r) => counts.get(r) ?? 0);
    usually.push((counts.get('housekeeper') ?? 0) + (counts.get('cook') ?? 0));
    const sometimes = (Object.keys(ROLE_PRESENCE) as (keyof typeof ROLE_PRESENCE)[])
      .filter((r) => ROLE_PRESENCE[r] === 'sometimes')
      .map((r) => counts.get(r) ?? 0);
    expect(sometimes.length).toBe(3);
    expect(Math.min(...usually)).toBeGreaterThan(Math.max(...sometimes));
    expect(Math.min(...sometimes)).toBeGreaterThan(0);
  });
});

describe('secrets and the killer', () => {
  it('gives 3 or 4 characters a secret, never the patriarch', () => {
    for (const c of cases) {
      expect(c.secrets.length).toBeGreaterThanOrEqual(3);
      expect(c.secrets.length).toBeLessThanOrEqual(4);
      for (const secret of c.secrets) {
        const holder = characterById(c, secret.holderId);
        expect(holder.role).not.toBe('patriarch');
        expect(holder.secretId).toBe(secret.id);
      }
      expect(c.characters.filter((ch) => ch.secretId !== undefined).length).toBe(c.secrets.length);
    }
  });

  it('never makes the patriarch, painter or grandmother the killer, and the killer always has a secret', () => {
    for (const c of cases) {
      const killer = characterById(c, c.killerId);
      expect(['patriarch', 'painter', 'grandmother']).not.toContain(killer.role);
      expect(killer.secretId).toBeDefined();
      expect(c.motiveSecretId).toBe(killer.secretId);
    }
  });

  it('records true motive, means and opportunity facts about the killer, held by others', () => {
    for (const c of cases) {
      const byId = (id: string) => c.facts.find((f) => f.id === id);
      const motive = byId(c.motiveFactId);
      const means = byId(c.meansFactId);
      const opportunity = byId(c.opportunityFactId);
      expect(motive?.claim).toEqual({ attribute: 'motive', subject: c.killerId, secretId: c.motiveSecretId });
      expect(means?.claim).toEqual({ attribute: 'means', subject: c.killerId, value: true });
      expect(opportunity?.claim).toEqual({ attribute: 'opportunity', subject: c.killerId, value: true });
      for (const f of [motive, means, opportunity]) {
        expect(f?.isLie).toBe(false);
        expect(f?.holderId).not.toBe(c.killerId);
      }
      expect(c.means.length).toBeGreaterThan(0);
    }
  });
});

describe('the clues', () => {
  it('has exactly one lie, held by the killer, contradicting a true fact held by someone else', () => {
    for (const c of cases) {
      const lies = c.facts.filter((f) => f.isLie);
      expect(lies.length).toBe(1);
      const lie = lies[0]!;
      expect(lie.holderId).toBe(c.killerId);
      expect(c.lie.factId).toBe(lie.id);
      const contradicted = c.facts.filter((f) => !f.isLie && contradicts(f.claim, lie.claim));
      expect(contradicted.length).toBeGreaterThan(0);
      for (const f of contradicted) expect(f.holderId).not.toBe(c.killerId);
      expect(contradicted.map((f) => f.id)).toContain(c.lie.contradictsFactId);
    }
  });

  it('has no contradictions among the true facts', () => {
    for (const c of cases) {
      const truths = c.facts.filter((f) => !f.isLie);
      for (const a of truths) for (const b of truths) expect(contradicts(a.claim, b.claim)).toBe(false);
    }
  });

  it('clears every red herring with at least one true fact held by someone else', () => {
    for (const c of cases) {
      const herrings = redHerrings(c);
      expect(herrings.length).toBe(c.secrets.length - 1);
      for (const herring of herrings) {
        const clearing = c.facts.filter(
          (f) =>
            !f.isLie &&
            f.holderId !== herring.id &&
            f.claim.attribute !== 'motive' &&
            f.claim.subject === herring.id &&
            f.claim.value === false,
        );
        expect(clearing.length, `${herring.role} in seed ${c.seed}`).toBeGreaterThan(0);
      }
    }
  });

  it('reveals every red herring motive, so each one is a real suspect', () => {
    for (const c of cases) {
      for (const herring of redHerrings(c)) {
        expect(
          c.facts.some((f) => f.claim.attribute === 'motive' && f.claim.subject === herring.id),
        ).toBe(true);
      }
    }
  });

  it('gives each victim spirit 1 or 2 true facts, the killer only the lie, and the patriarch none', () => {
    for (const c of cases) {
      for (const ch of c.characters) {
        const held = factsHeldBy(c, ch.id);
        if (ch.role === 'patriarch') expect(held).toEqual([]);
        else if (ch.id === c.killerId) expect(held.map((f) => f.isLie)).toEqual([true]);
        else {
          expect(held.length).toBeGreaterThanOrEqual(1);
          expect(held.length).toBeLessThanOrEqual(2);
          expect(held.every((f) => !f.isLie)).toBe(true);
        }
      }
    }
  });

  it('never has a spirit hold a true fact about themselves', () => {
    for (const c of cases) {
      for (const f of c.facts.filter((fact) => !fact.isLie)) expect(f.claim.subject).not.toBe(f.holderId);
    }
  });

  it('gives every fact a unique id, a kind that matches its claim, and finished text', () => {
    for (const c of cases) {
      expect(new Set(c.facts.map((f) => f.id)).size).toBe(c.facts.length);
      expect(new Set(c.facts.map((f) => f.text)).size).toBe(c.facts.length);
      for (const f of c.facts) {
        expect(f.text).not.toMatch(/[{}]/);
        if (f.claim.attribute === 'motive') expect(f.kind).toBe('motive');
        else if (f.claim.value === false) expect(f.kind).toBe('alibi');
        else expect(f.kind).toBe(f.claim.attribute);
      }
    }
  });
});

describe('solvability', () => {
  it('a brute-force solver finds exactly one consistent killer, the real one, for all 1,000 seeds', () => {
    for (const c of cases) expect(solve(c), `seed ${c.seed}`).toEqual([c.killerId]);
  });

  it('uses every kind of lie: a false alibi, a false denial of the poison, and framing a red herring', () => {
    const kinds = new Set(cases.map((c) => c.lie.kind));
    expect([...kinds].sort()).toEqual(['frameMeans', 'frameOpportunity', 'selfAlibi', 'selfMeans']);
  });
});

describe('motives', () => {
  it('uses every killer-eligible secret type as the motive at least once in 1,000 seeds', () => {
    const motives = new Set(
      cases.map((c) => c.secrets.find((s) => s.id === c.motiveSecretId)?.type),
    );
    for (const type of KILLER_SECRET_TYPES) expect(motives).toContain(type);
  });
});
