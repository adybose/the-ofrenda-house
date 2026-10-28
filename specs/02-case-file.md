# 02: Case file generator
Status: Done
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
  record motive, means (the poison) and opportunity. The patriarch, the
  grandmother and the painter are never the killer (the painter makes the
  reveal in the true ending).
- THE SYSTEM SHALL spread clues so that: each victim spirit holds 1 or 2
  true facts; every red herring is cleared by at least one fact; the killer
  is the only suspect left once all facts are known.
- The patriarch is the guide and holds no clue facts. The killer's friendly
  form holds exactly one fact: the lie.
- THE SYSTEM SHALL mark one fact the killer's friendly form will state
  falsely, and that lie must contradict a true fact held by another spirit.
- No spirit holds a true fact about themselves, so nobody can clear
  themselves.
- THE SYSTEM SHALL expose the solver used by the tests, so spec 14 can ask
  whether the clues the player holds are enough to name one suspect.

## Interfaces
generateCase(seed): CaseFile, with characters[], secrets[], killerId,
facts[] { id, holderId, kind: motive | means | opportunity | alibi, text, isLie, claim }

characters[] { id, role, name, shortName, gender, personality, roomKind,
riddle: { theme, answer }, secretId? }

Each fact's `claim` is what the solver reasons about:
`{ attribute: 'motive', subject, secretId }` or
`{ attribute: 'means' | 'opportunity', subject, value: boolean }`.
An alibi is `opportunity = false`; proof someone never touched the poison
is `means = false` (both have kind `alibi`). Two facts contradict when they
claim opposite values for the same subject and attribute.

solve(caseFile, knownFactIds): characterId[] (the suspects still
consistent with those facts, treating a contradicted pair as one lie)

A suspect is anyone whose motive is among the known facts. Suspect `k` is
consistent when, taking every fact held by others as true and at most one
of `k`'s own known facts as the lie (replaced by its opposite), no two
accepted facts contradict and none clears `k`.

## Out of scope
Wording of lines (spec 08), room placement (spec 03).

## Acceptance checks
Must:
- [x] The same seed always gives the same case file.
- [x] A brute-force solver finds exactly one consistent killer for all
      1,000 test seeds.
- [x] The patriarch is never the killer, and the killer always has a secret.
- [x] Every run has 7 or 8 characters, 3 or 4 secrets, and exactly one
      fact with `isLie: true`, held by the killer and contradicting a true
      fact held by someone else.
- [x] Every red herring is cleared by at least one true fact.
Should:
- [x] Each secret type that can belong to a killer (all but the
      grandmother's and the painter's) appears as the killer's motive at
      least once in 1,000 seeds.

## Test plan
Vitest: determinism test, solver property test over 1,000 seeds,
role and secret constraint tests, and hand-built cases for the solver's
rules (contradiction, clearing, partial knowledge).

## Decisions
- The painter can hold a secret but is never the killer (was an open
  question; proposal accepted when the specs were approved).
- The patriarch holds no clue facts (as above).
- `solve` only counts characters whose motive the player has heard, so
  with few clues it can name one suspect early. Spec 14 should not treat
  a single suspect as "enough" on its own without checking that the
  contradicting pair has been heard.
