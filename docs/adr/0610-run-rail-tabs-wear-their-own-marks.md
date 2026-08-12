---
status: accepted
date: 2026-08-10
deciders: owner (Nelson) + Claude
refines:
  - "[ADR-0558](0558-a-menu-language-rail-tab-is-the-primitive-or-it-fails-the-build.md)"
  - "[ADR-0026](0026-ui-kit-icon-canvas.md)"
---

# ADR-0610: Run's rail tabs wear their own marks

## Context

ADR-0558 made Current Run and Start New Run rail tabs, and a rail tab carries a mark. They were
given the Run's **title-bar** marks — Battle and Ataraxia — because those were the Run marks that
existed. The owner's read was immediate and correct: they look arbitrary. They are minted for the
bar's tight measure chip, authored edge-to-edge so they need `markCanvas="bleed"`, and warm where
the kit's icons are not. Right meaning, wrong canvas spec.

A first spread pinned "carved grey-blue slate" to match the marks then on screen. That constraint
was already retired — the kit's own icons had moved to full colour — so the whole spread was
generated against a dead style rule.

## Decision

- The two tabs wear their own installed marks: a **chess king** for Current Run and a **sealed
  parchment** for Start New Run, subjects chosen by the owner. New roles
  `ui-kit-icons-run-current-png` / `ui-kit-icons-run-new-png` on new slots, so nothing existing is
  overwritten and retiring them is the undo.
- No palette constraint. The colour-devoid style is retired; a mark looks how it wants to look.
  The constraints that remain are the seat's: the ADR-0026 64×64 kit canvas, and legibility at the
  44px the rail draws.
- **`ui-kit` rail marks get a typed completeness validator**, `runRailMarkMediaIssue`. Acceptance
  refused these outright — `ui-kit` candidates stay bridge-only until their slot family has one —
  and that refusal is the system working. The contract it states is the OPPOSITE of a title-bar
  mark's: a title-bar mark must be trimmed to its own ink because its square seat scales the
  canvas, while a rail mark must RESERVE the kit canvas margin, because that margin is its optical
  centring. Trimming one would make it draw larger than the kit icons beside it.
- **Review happens in the seat that ships.** `RunRailMarkCatalog` is a Studio category that mounts
  every candidate on a real `ApparatusRailTab` at native size. Reviewing these in the title bar's
  measure chip would be reviewing a size they are never drawn at, and a contact sheet is not a
  review at all.
- A candidate that cannot be accepted is not offered. The seat filters to versions carrying
  provenance, native-1x evidence, a measured ink box and the typed runtime projection, so a card
  that looks installable cannot fail at the last step with a server code.

## Consequences

- Both marks are installed and bound; the tabs drop `markCanvas="bleed"` for the kit's `inset`.
- The ink band is 62–95% of the canvas rather than the kit's authored 62–84%. Generated art
  commonly lands nearer the edge and the seat compensates with a stated ink fraction; what the
  band rejects is the two failures the seat cannot compensate — ink filling the canvas edge to
  edge and colliding with the tab frame, or ink so small it reads as another size class.
- The next `ui-kit` family to want acceptance needs the same two things: a validator naming its
  contract, and a review instrument mounting it in its own seat.
