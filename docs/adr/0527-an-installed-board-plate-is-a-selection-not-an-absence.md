---
status: accepted
date: 2026-08-08
refines:
  - "[ADR-0521](0521-an-unread-artwork-version-list-is-not-a-verdict.md)"
---

# ADR-0527: An installed board plate is a selection, not an absence

## Context and Problem Statement

Fortress Gate's artwork disappeared out of the Level Editor. The board painted nothing — the page
backdrop showed through it, with only zones, units and props standing on empty space — and the Level
Artwork panel said **AI artwork is unavailable · No AI artwork version is selected yet**.

The level holds artwork. Its board code carries
`pd: ["boards/fortress-gate/plate.png", 1672, 941, "v4;…"]`, and that slot is installed, accepted,
and serves a 3.1 MB 1672×941 PNG on request. Nothing about it is missing, stale, archived, or
unreadable.

What it is not is *versioned*. It is a **plate**: the pre-pipeline selection shape — a live-media
slot with its own frame size and a hand v4 registration — rather than a `schemaVersion` 2/3 surface
minted by the Board Art Pipeline and provable against a document's background-version list.

Every renderer beneath the editor already knows this. `runtimePredrawnBoardPlate` resolves a plate
straight from the media catalog and carries its registration; gameplay's own gate is
`isPredrawnBackgroundActive`, which asks only whether the saved mode is AI. The board code encodes
and decodes plates losslessly, and has a pinned round-trip test for this exact registration.

Only the editor refused, and it refused one step *above* all of that. The plate gate opens on
`predrawnSelectionValidation.kind === 'valid'`, and the check that produces that verdict starts from
`currentVersionedPredrawnSurface` — a surface narrowed to the versioned kinds. A plate is not one, so
the check settled on `missing` before any read, the gate never opened, and the mode stayed AI, which
correctly suppresses the legacy environment. The result is the failure mode ADR-0521 named for a
different cause: a working level, rendering nothing.

The word was wrong in the same way, too. `missing` means *this level has selected no artwork*. It was
being said about a level whose artwork is installed and serving.

## Decision Outcome

**A surface the editor holds settles into a state derived from what that surface IS, and an installed
plate is a settled, drawable one.** It gets its own kind, `plate`, beside the versioned verdicts.

- **A plate has nothing to check, so it asks nothing.** Version lineage, completeness, immutable
  identity and environment-geometry binding are all questions about a pipeline artifact. A plate has
  no lineage — it is complete in the board code that names it. It never reaches the server, never
  retries, and never sits in `checking`.
- **Drawability is asked as its own question**, `predrawnSelectionIsDrawable`, rather than by
  comparing to `valid` at each gate. Fail-closed is untouched for artwork that *has* a lineage: a
  versioned selection still paints only on `valid`, and `checking`, `stale`, `unavailable`,
  `unreachable`, `error` and `missing` all still keep the plate hidden.
- **One seed answers for every path.** Mount, document load, commit, undo and redo each re-seeded the
  check with their own copy of the same expression, and every one of them read "not versioned" as
  "nothing selected". `predrawnSelectionSeed` is now the single answer, so a path cannot forget a
  plate on its own. Its key is the whole remembered surface rather than only a versioned one, so
  swapping or clearing a plate re-seeds exactly as a version swap does.
- **The panel says what is true.** *Board plate is active*, and that it has no version lineage to
  check. The version chip stays absent, because there is no version to name. `missing` returns to
  meaning what it says: no artwork is selected at all.
- **AI artwork mode is selectable for a plate.** Activating it was gated on `valid`, so a level whose
  only artwork is a plate could not be switched back to AI after a trip through Legacy tileset.

## Consequences

- **This decides how a plate RENDERS, not whether plates survive.** Exactly one level is still placed
  this way — Fortress Gate, off-square by a few percent — and it remains un-migrated. Migrating it
  would mean running it through the warp stage and accepting different pixels than were placed by
  hand; that trade is an open decision about the artwork, and this ADR does not make it. What it
  settles is that an un-migrated level draws its artwork in the meantime instead of showing an empty
  board, so the question can be answered on its merits rather than under a broken editor.
- Anything new that keys off the selection check must ask `predrawnSelectionIsDrawable` rather than
  compare against `valid`, exactly as ADR-0521 requires `unreachable` to be handled explicitly.
- Verified against the real document that showed the defect (`legacy-egkfkpjvhfph`, Fortress Gate,
  zero background versions, plate serving 200): the board paints its artwork, the panel names it, and
  the AI artwork control is selectable.
