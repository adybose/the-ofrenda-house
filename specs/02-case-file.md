# 02: Case file generator
Status: Approved
Depends on: 01

## Goal
Each run gets a new household and a new killer, and the mystery can
always be solved from the clues the spirits hold.

## Requirements
- WHEN a run starts THE SYSTEM SHALL draw 7 to 8 characters from the role
  pool (patriarch, painter and matriarch are always present) and give each
  a name, personality, room and riddle theme.
- THE SYSTEM SHALL draw "usually" roles (bookkeeper, housekeeper or cook,
  eldest child) more often than "sometimes" roles (family doctor,
  grandmother, gardener), as listed in `docs/story.md`.
- THE SYSTEM SHALL give each character a riddle theme from their own life
  with a single correct answer, so spec 08 can build a riddle that is
  always solvable.
- THE SYSTEM SHALL give 3 or 4 characters a hidden secret from the secret
  pool, never to the patriarch.
- THE SYSTEM SHALL pick the killer from the characters with a secret, and
  record motive, means (the poison) and opportunity. The patriarch and the
  grandmother are never the killer.
- THE SYSTEM SHALL spread clues so that: each victim spirit holds 1 or 2
  true facts; every red herring is cleared by at least one fact; the killer
  is the only suspect left once all facts are known.
- THE SYSTEM SHALL mark one fact the killer's friendly form will state
  falsely, and that lie must contradict a true fact held by another spirit.
- THE SYSTEM SHALL expose the solver used by the tests, so spec 14 can ask
  whether the clues the player holds are enough to name one suspect.

## Interfaces
generateCase(seed): CaseFile, with characters[], secrets[], killerId,
facts[] { id, holderId, kind: motive | means | opportunity | alibi, text, isLie }

characters[] { id, role, name, personality, roomKind,
riddle: { theme, answer }, secretId? }

solve(caseFile, knownFactIds): characterId[] (the suspects still
consistent with those facts, treating a contradicted pair as one lie)

## Out of scope
Wording of lines (spec 08), room placement (spec 03).

## Acceptance checks
Must:
- [ ] The same seed always gives the same case file.
- [ ] A brute-force solver finds exactly one consistent killer for all
      1,000 test seeds.
- [ ] The patriarch is never the killer, and the killer always has a secret.
- [ ] Every run has 7 or 8 characters, 3 or 4 secrets, and exactly one
      fact with `isLie: true`, held by the killer and contradicting a true
      fact held by someone else.
- [ ] Every red herring is cleared by at least one true fact.
Should:
- [ ] Each secret type appears as the killer's motive at least once in
      1,000 seeds.

## Test plan
Vitest: determinism test, solver property test over 1,000 seeds,
role and secret constraint tests.

## Open questions
- The painter is always present and makes the reveal in the true ending,
  but the painter's secret is a possible motive. If the painter can be the
  killer, who reveals baby Elena? Proposal: like the grandmother, the
  painter can hold a secret but is never the killer.
- Does the patriarch hold facts? `docs/story.md` calls him "your guide"
  and the build plan places "6 key rooms", which fits him having no
  key-room encounter. Proposal: the patriarch holds no clue facts.
