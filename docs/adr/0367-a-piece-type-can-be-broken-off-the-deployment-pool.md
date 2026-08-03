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

# ADR-0367: A piece type can be broken off the deployment pool, and placement is a free-for-all

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

**A Player Deployment zone may bar piece types.** `Zone.excludedPieceTypes` lists the types the
automatic placer may not put there. Every other piece uses those squares normally.

**A broken-off type gets its own painted zone, and one control owns both halves.** Barring a type
and giving it a zone are not two settings: `excludedPieceTypes` is the only stored one, and a
dedicated zone is ON exactly when its type appears in it. The author sees a single switch per type
on the Deployment card. Turning it on bars the type and creates its zone in the same click;
turning it off returns the type to the shared pool.

A switched-off zone is **retained but not on the level**. Its painted squares stay in the editor's
own store so turning the type back on returns the zone the author had, but `layers.zones` does not
carry it: gameplay, validation, rendering and the Zones dropdown all read a level where it does not
exist. There are no stray zones for a feature the author has not turned on, and the cost — you
cannot see or edit a hidden zone without turning its type back on — is one click to undo.

`player-pawn-spawn` and `player-king-spawn` are zone types painted in the ordinary Zones layer like
any other zone. Each holds exactly one piece type. They may overlap the Player Deployment zone and
each other freely — overlapping zones are ordinary authoring, not a conflict to resolve.

Those two facts reduce to a per-square permission per piece type:

| square | the barred type | every other piece |
| --- | --- | --- |
| Player Deployment | ✓ | ✓ |
| Player Deployment, type barred | ✗ | ✓ |
| that type's dedicated zone | ✓ | ✗ |
| both zones | ✓ | ✓ |

A dedicated square outside the Player Deployment zone takes its one type only. Where zones overlap,
the square takes anything the general zone allows. Capacity — the count that decides how many units
the Run can field this Battle — is every square in any of these zones.

Two types are breakable today, for two different reasons. A **pawn** is column-bound, so an author
frees dead-end files for the pieces that can use them. A **King** is the piece an author most often
wants somewhere specific — a keep, a back rank, a corner — rather than wherever the roll lands it.
The model is per-type, so a third type is a data change rather than a new mechanism.

**Placement is a free-for-all, and the King goes first.** Units take their squares one at a time
in a seeded random order. Each unit, on its turn, takes the best-scoring square still open to it.
Nothing is reserved ahead of a unit and nothing backtracks. A unit that reaches its turn to find
its eligible squares taken by units placed earlier does not deploy: it is held back exactly like an
overflow unit, and stays callable as a reservist. That is the unit's problem, by design.

The King is the one exception and takes its square before anyone else. The Run always fields its
King — it is never among the blocked units — so it cannot be the unit that misses out, and a King
Deployment zone that overlapped the general pool would otherwise be honored or not on a coin flip.

**Deployment abilities still steer a unit, within what its turn finds open.** The ability scorers
are unchanged, so a Positioned pawn still wants the front rank and an Agminate Rook still wants a
corner near its King. Random order is a deliberate cost for everything except the King: an ability
that reads an already-placed unit may run before that unit is placed. Agminate is the exception
that recovers, because the King it reads is now always down first.

**Discipline overrides the type bars.** A Disciplined unit is placed by the player, not by the
automatic placer, and reaches every deployment square regardless of type. Putting a pawn on a
square the placer refuses is a deliberate choice the player is welcome to make; a bar is a default
that helps the automatic placer, not a rule about where a piece may legally stand.

**A level that leaves the King nowhere to stand cannot be saved.** `W3_PLAYER_KING_SQUARE` fires
when no usable square accepts the King — Kings barred from the Player Deployment zone with no King
Deployment zone painted. Benching a pawn stays a legal authored outcome; benching the King is not,
because the Run has no army without it.

**A reservist called up mid-Battle is placed automatically, so the bar applies to it.** A
reservist pawn arrives only on a pawn-eligible square, and does not arrive at all when none is
free.

## Consequences

- An author can hand a level's dead-end columns to the pieces that can use them without
  hand-placing anything, and can give pawns squares that nothing else competes for.
- Deployment outcomes are less predictable per unit and more even across the army. A Run that
  wanted a specific piece on a specific square has Discipline for exactly that.
- Ability-driven formations are weaker than under type-priority ordering for every piece except
  the King. Agminate, which reads the King's placed square, is unaffected because the King is
  placed first.
- Turning a type on and not painting its zone leaves it with nowhere to stand. For pawns that
  benches them and is legal to save, because it may be what the author wants; for the King it
  blocks Save. Turning a switch on can therefore make a level unpublishable until its zone is
  painted, which is acceptable: the working copy autosaves, so the state is never lost while the
  author goes and paints it.
- The dedicated zone can no longer ADD squares for a type that is still welcome in the shared pool.
  One switch means the zone is always a replacement, never a supplement.
- Enemy randomized deployment is untouched. It uses the seeded setup resolver and has no dedicated
  zones of its own.
- ADR-0288's "does not silently delete extra zone geometry" stands — geometry is preserved by the
  merge — but its warn-and-canonicalize-later handling of extra zone objects is replaced by
  enforcement at every read.
