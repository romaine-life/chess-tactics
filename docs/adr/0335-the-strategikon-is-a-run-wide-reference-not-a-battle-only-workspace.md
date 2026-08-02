---
status: accepted
date: 2026-08-01
deciders: owner (Nelson) + Claude
refines:
  - "[ADR-0231](0231-strategikon-and-enchiridion-share-one-reference-workspace-language.md)"
  - "[ADR-0250](0250-strategikon-book-aligns-to-the-controls-content-boundary.md)"
---

# ADR-0335: The Strategikon is a Run-wide reference, not a Battle-only workspace

## Context

ADR-0231 introduced the Strategikon as "a Controls-titlebar **Battle** workspace", and the
implementation took that literally. `Skirmish` owned the whole feature: it computed the
address, contributed the book control to the Controls title band, and mounted the workspace
over the battlefield. `RunScreen`'s between-Battle phases render the same shell and the same
Controls panel, but without any of that wiring — and additionally repaired any
`/run/strategikon/*` address back to `/run` whenever the Run's phase was not `battle`.

The result the owner saw: the Controls title band on the Shop, Deployment, and Victory
screens is the same brown band with the same **CONTROLS** copy, but the book mark at its
right edge is simply absent. Nothing about those phases makes the reference less useful —
the Shop is precisely where the army, the held relics, and the unit/card rules are consulted
before spending gold — so the absence read as a missing control rather than a scoped one.

## Decision

- The Strategikon is the reference workspace of a **Run**, in every phase, not of a Battle.
  Deployment, Shop, and Victory open it from the same title mark and the same
  `/run/strategikon/...` addresses that Battle already uses.
- `RunScreen` owns that wiring for its non-Battle phases the way `Skirmish` owns it for
  Battle: the book control is contributed to the shared Controls title band, and the
  workspace mounts in a director-owned `strategikon-slot` covering the phase workspace.
- Only an **absent** Run repairs a `/run/strategikon/*` address back to `/run`. Phase is
  never the reason an address is rewritten.
- The Controls column's own workspace verbs — Army, Relics, Sell Units — always address the
  Run root, so they stay live while the Strategikon covers the screen instead of navigating
  to a path the reference workspace still occupies.

## Consequences

- One control appears in one place across the whole Run, so the Controls title band no longer
  changes its contents from phase to phase.
- The Strategikon's own Prosopography and Lipsanotheca sections read the live Run document in
  every phase; between Battles they are the same content as the Controls Army/Relics
  workspaces, reached from the reference rail instead of the Controls column.
- ADR-0231's Battle framing is superseded only in scope. The workspace language, the rail,
  the frameless book control, and its Controls-boundary alignment (ADR-0250) are unchanged.
