---
status: accepted
date: 2026-07-29
deciders: owner (Nelson) + Codex
supersedes: ADR-0227
---

# ADR-0228: Run unit names are role-specific historical identities

## Context

ADR-0227 established seeded, persistent Run unit names, but its two recombinable
vocabularies created plausible-sounding people who were not necessarily
historical. The game's stated visual period is roughly 1000–1500 AD, with
western European, Mediterranean, biblical, and early-church historical pressure.
The owner wants the pool to represent actual people who held the role suggested
by each chess piece, and real castles for Rooks.

## Decision

- Supersede ADR-0227's combinatorial name generator with six curated pools of 64
  complete historical identities. Name fragments are never recombined.
- Piece type determines the historical register:
  - Pawns use named archers transcribed from the Medieval Soldier Database's
    National Archives-derived muster and retinue records.
  - Knights use documented medieval knights and exclude legendary Round Table
    figures.
  - Bishops use biblical and historical religious leaders, including bishops,
    popes, abbots, abbesses, founders, prophets, apostles, and high priests.
  - Rooks use real medieval European or Mediterranean castles and citadels.
  - Queens use queens, empresses, and regents.
  - Kings use kings and emperors.
- The medieval 1000–1500 register is primary. Biblical and early-church figures
  are an explicit secondary register. Western Europe and the Mediterranean are
  favored without pretending that one region supplied every relevant office.
- Each role pool is independently shuffled from the Run seed. A separate
  acquisition ordinal per piece type consumes every identity in that role once
  before the role can repeat.
- The chosen name remains stored on `RunArmyUnit`; display does not regenerate
  it. Format-3 Runs preserve valid stored names. Format-1 unnamed Runs and the
  unverified format-2 provisional fantasy-name Runs deterministically migrate to
  the new role-specific identities.
- The pool's sources, scope, and admission rules live in
  [`docs/run-unit-name-pools.md`](../run-unit-name-pools.md). New entries require
  an attested person, office, or fortification appropriate to the role.
- Name editing remains deferred. The already discussed rank ladder is unchanged;
  rank titles, kill thresholds, and cumulative service records remain a separate
  decision.

## Consequences

- A generated Run name now makes a historically meaningful claim that can be
  traced to a source category.
- Duplicate piece types remain distinguishable for at least 64 acquisitions of
  that type, far beyond an ordinary Run roster, while all names remain stable
  across retries, reloads, and cross-device persistence.
- Existing format-2 Runs created during the unverified first pass receive the
  corrected historical register instead of preserving provisional fantasy names.
- Expanding the pool is editorial research rather than combinatorial growth, but
  this cost prevents plausible-looking fictional people from silently entering
  the game.
