---
status: accepted
date: 2026-08-09
deciders: owner (Nelson) + Claude
refines:
  - "[ADR-0514](0514-play-opens-run-without-a-mode-rail.md)"
  - "[ADR-0334](0334-current-run-stays-visible-disabled-without-an-active-run.md)"
  - "[ADR-0290](0290-run-preparation-follows-play-master-detail-navigation.md)"
---

# ADR-0556: Run preparation chooses in a tab column of one-line rows

## Context

The menu shell has two column TYPES, each a locked width: a **tab column** at `--col-tab-w`
(322px, the rail's own width) and an **action column** at `--col-action-w`. The action width is
not a design value — it is defined as arithmetic, *"the MAX that fits beside two tab columns at
the 1240 body cap: 1240 − 2×322 − 2×12 = 572px"*.

That was correct while Run preparation sat THIRD in its row: main-menu rail, Play mode rail, Run
choices. [ADR-0514](0514-play-opens-run-without-a-mode-rail.md) then deleted the Play mode rail
and moved the choices into the first destination seat, deciding only that they must not inherit
the narrow-viewport compression. The leftover width was never re-decided, so Current Run and
Start New Run kept a column sized for a seat that no longer exists: 546px rows next to 346px of
empty body, at a width nobody chose.

The rows were also two lines tall, and neither second line was carrying anything. Current Run's
`Battle 3 of 10 · Ataraxia 0` is the first two facts of the detail column the row opens, restated
one click early. Start New Run's `Choose Ataraxia` names the control immediately to its right.
Between them they bought a 96px slab for a row whose content is a name.

## Decision

- Run's choice column is a **tab column**, at `--col-tab-w`. It selects; the detail column beside
  it is what acts, which is what a tab column is in this shell. The rows then land byte-identical
  in width to the main-menu buttons they sit beside, from the same variable, rather than at a
  width derived from a column count that no longer holds.
- `--col-action-w` is unchanged. It remains correct for the columns that genuinely act — Levels,
  Campaign Levels, Continue — and this is a Run-scoped class on the shared column, not a new
  width or a fork of the two column types (ADR-0059).
- An **enabled** choice row carries its name and nothing else, on one line, in the 61px seat the
  main-menu buttons use. A row whose whole job is to open a detail column does not summarize that
  column.
- The empty state keeps its sentence. [ADR-0334](0334-current-run-stays-visible-disabled-without-an-active-run.md)'s
  **No active Run** is the only thing on the surface that says why the row cannot be taken, so it
  moves to the shared row's optional END VALUE rather than being deleted or left as a second line.
  Both states are therefore one line at a constant height.
- That constancy is load-bearing, not cosmetic: the two rows are cut from ONE plank of installed
  oak by a fixed `--play-choice-row-surface-pitch` (ADR-0034/ADR-0063). A row that grew a second
  line when a Run ended would shift the plank under the row below it.

## Consequences

- Run preparation reads as one family with the rail beside it: same width, same seat height, same
  material.
- The Battle position and Ataraxia are stated once, in the detail column, instead of twice.
- The pitch constant tracks the 61px seat; the copy is `clamp()`ed type, so the real row runs
  56–62px across the viewport range and the sheet drifts a few px at the extremes — the same
  accepted trade the tab rail's measured step already makes.
- Reintroducing a second mode rail (ADR-0514's policy switch) does not restore the old width:
  the choice column is sized as what it is, not as what is left over.
