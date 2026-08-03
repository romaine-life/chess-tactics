---
status: accepted
date: 2026-08-02
deciders: owner (Nelson) + Claude
refines:
  - "[ADR-0287](0287-deployment-is-a-dedicated-side-specific-authoring-workspace.md)"
  - "[ADR-0346](0346-run-deployment-is-a-battlefield-state-with-conditional-input.md)"
  - "[ADR-0348](0348-discipline-resolves-before-automatic-deployment.md)"
partially_supersedes:
  - "[ADR-0288](0288-new-deployment-authoring-uses-one-flexible-zone-per-side.md)"
---

# ADR-0365: Pawn deployment is authored geometry, and placement is a free-for-all

## Context

A pawn is column-bound: it advances along its file and leaves it only by capturing. A War Battle
level therefore has columns where a pawn is useful and columns where a pawn deployed there can
never contribute — a dead-end file behind a wall, a column that only enters water, a file whose
whole length is covered by an enemy piece the pawn can never pass. The Player Deployment zone had
no way to express that: every usable square in it accepted every unit type equally.

Automatic placement also ran in a fixed piece-type priority — King, Rook, Bishop, pawn, Knight,
Queen — with each unit choosing its best-scoring square out of the entire remaining pool. That
order is invisible to the player, is not a rule anyone stated, and quietly made the earlier types
structurally privileged.

Separately, ADR-0288 declared one deployment zone per side but only *warned* about extras. Legacy
content and pasted board codes could still produce two Player or two Enemy Deployment zones, and
the author was left looking at duplicate objects the UI could not explain.

## Decision

**Deployment geometry is singular.** A level holds at most one Player Deployment zone, at most one
Pawn Deployment zone, and at most one Enemy Deployment zone. This is enforced, not warned about:
every reader canonicalizes duplicates by folding later entries into the first of their type. The
extra zone *object* disappears; the squares it painted are absorbed, never discarded. No board
code, legacy Level, paste, or editor command can produce a second one.

**A Player Deployment zone may bar pawns.** `Zone.pawnsExcluded` marks the zone's squares as
closed to pawns. Every other piece uses them normally.

**A Pawn Deployment zone is its own painted zone.** `player-pawn-spawn` is a zone type, created
from the Deployment card and painted in the ordinary Zones layer like any other zone. It may
overlap the Player Deployment zone freely — overlapping zones are ordinary authoring, not a
conflict to resolve.

Those two facts reduce to a per-square pair of independent permissions:

| square | pawns | other pieces |
| --- | --- | --- |
| Player Deployment | ✓ | ✓ |
| Player Deployment, pawns barred | ✗ | ✓ |
| Pawn Deployment | ✓ | ✗ |
| both zones | ✓ | ✓ |

A Pawn Deployment square outside the Player Deployment zone takes pawns only. Where the two zones
overlap, the square takes anything. Capacity — the count that decides how many units the Run can
field this Battle — is every square in either zone.

**Placement is a free-for-all.** Units take their squares one at a time in a seeded random order.
Each unit, on its turn, takes the best-scoring square still open to it. Nothing is reserved ahead
of a unit and nothing backtracks. A pawn that reaches its turn to find its eligible squares taken
by units placed earlier does not deploy: it is held back exactly like an overflow unit, and stays
callable as a reservist. That is the pawn's problem, by design.

Only a pawn can be held back this way. Every other piece may take any deployment square, and
capacity already guarantees one remains for it.

**Deployment abilities still steer a unit, within what its turn finds open.** The ability scorers
are unchanged, so a Positioned pawn still wants the front rank and an Agminate Rook still wants a
corner near its King. Random order is a deliberate cost: an ability that reads an already-placed
unit now sometimes runs before that unit is placed, and its effect degrades accordingly.

**Discipline overrides the pawn bar.** A Disciplined unit is placed by the player, not by the
automatic placer, and reaches every deployment square regardless of type. Putting a pawn on a
square the placer refuses is a deliberate choice the player is welcome to make; the bar is a
default that helps the automatic placer, not a rule about where a pawn may legally stand.

**A reservist called up mid-Battle is placed automatically, so the bar applies to it.** A
reservist pawn arrives only on a pawn-eligible square, and does not arrive at all when none is
free.

## Consequences

- An author can hand a level's dead-end columns to the pieces that can use them without
  hand-placing anything, and can give pawns squares that nothing else competes for.
- Deployment outcomes are less predictable per unit and more even across the army. A Run that
  wanted a specific piece on a specific square has Discipline for exactly that.
- Ability-driven formations are weaker than under type-priority ordering, most visibly Agminate,
  which reads the King's placed square. This was accepted when the free-for-all was chosen.
- A level whose Player Deployment zone bars pawns and that paints no Pawn Deployment zone will
  bench every pawn in the Run army. The Deployment card states the pawn-square count and warns
  when it reaches zero; it is legal to save, because it may be what the author wants.
- Enemy randomized deployment is untouched. It uses the seeded setup resolver and has no pawn
  zone of its own.
- ADR-0288's "does not silently delete extra zone geometry" stands — geometry is preserved by the
  merge — but its warn-and-canonicalize-later handling of extra zone objects is replaced by
  enforcement at every read.
