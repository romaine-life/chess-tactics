---
status: accepted
date: 2026-08-01
deciders: owner (Nelson) + Claude
refines:
  - "[ADR-0289](0289-run-preparation-is-control-first-and-ataraxia-uses-one-selector.md)"
  - "[ADR-0290](0290-run-preparation-follows-play-master-detail-navigation.md)"
---

# ADR-0334: Current Run stays visible and disabled without an active Run

## Context

ADR-0290 gave Run preparation selectable **Current Run** and **Start New Run**
rows, but never decided an empty state, and the implementation simply omitted
the Current Run row whenever no Run existed. A player who had not started a Run
saw a one-row list, and the resume point's location was unlearnable until after
they already needed it; Start New Run also shifted position depending on Run
existence.

Every neighboring surface already answers this question the other way. The
Continue rail keeps all four mode rows mounted and disables the empty ones with
"Nothing to continue" (ADR-0294 family), Campaign Levels keeps locked rows
visible with a disabled Locked action, and ADR-0289 requires the Ataraxia
dropdown to keep unavailable installed tiers "visible but disabled" so the
ladder ahead stays legible. Standard usability guidance matches: disable and
show a control when the player can act to make it available, and say why it is
unavailable; hide it only when it is irrelevant to them.

## Decision

- The **Current Run** row is an availability surface, not an existence surface.
  With no active Run it keeps its first-row position, rendered with the shared
  disabled row treatment and the description **No active Run**, and it cannot be
  selected or navigated.
- With an active Run the row is unchanged: enabled, summarized by Battle
  position and Ataraxia, selectable to reveal the standard right detail column.
- The row appears once Run authority has settled (store hydration and Play
  content load); the existing Loading Runs status box continues to own the
  unsettled interval. The adoption-conflict card still replaces the row while
  it speaks for the account's current Run.
- Direct navigation to the Current Run address without an active Run continues
  to canonicalize back to the neutral Run address (ADR-0260 language); a
  disabled row never becomes a reachable destination.

## Consequences

- The resume point is learnable where it will appear, before it is ever needed,
  and Start New Run no longer moves when a Run starts or ends.
- Run preparation now states its empty case in the same voice as Continue's
  "Nothing to continue" instead of presenting a silently shorter list.
- The Play menu contract pins the row as always-present-disabled, so a future
  refactor cannot quietly regress it to conditional existence.
