---
status: accepted
date: 2026-08-01
deciders: owner (Nelson) + Codex
partially_superseded_by:
  - "[ADR-0341](0341-cacochymic-replaces-plagued-as-the-pestiferous-unit-state-name.md)'s Cacochymic accessibility and explanatory terminology"
refines:
  - "[ADR-0311](0311-pestiferous-cards-reveal-one-plagued-unit-at-a-time.md)'s direct marker presentation"
extends:
  - "[ADR-0085](0085-runtime-assets-are-live-storage-backed.md)"
---

# ADR-0312: Plagued targets use a live icon, not a written label

## Context

ADR-0311 requires the next unit that a Pestiferous card will lose to be visible
on the shared card face. The first implementation printed **Plagued** below that
unit. That word competes with the unit ledger and makes a recurring status read
like another line of card prose. The intended status artwork is being generated
separately and is not yet available through the live asset system.

## Decision

The direct Plagued marker on a unit is a small status icon, never the visible
word **Plagued**.

- The final generated icon resolves from the stable semantic live-media slot
  `ui/run/card-status/plagued-v1.png`. Its bytes, candidate, accepted pointer,
  and provenance follow ADR-0085 and never enter Git as a packaged fallback.
- The icon socket is attached to the exact target sprite in the shared
  `RunCardFace`, so offers, owned cards, and Card Layout project the same mark.
- Accessibility labels and explanatory inspection text may continue to call the
  state **Plagued**. The no-word rule applies to the visible card-face marker,
  not to screen-reader semantics or rules explanations.
- Until the generated candidate is accepted, the socket contains one small
  neutral hollow diamond rendered as DOM text. This is owner-authorized named
  temporary debt, used only to reserve and verify the marker's size and
  placement; it is not an alternate icon direction or a media fallback.
- Accepting the icon retires that debt: the shared socket renders the accepted
  live asset and removes the diamond rather than preserving a fallback branch.

## Consequences

- Good: the target remains legible without adding another written label to a
  compact card ledger.
- Good: all card carriers already share one replacement point for the final
  generated icon.
- Good: assistive technology keeps the explicit status name.
- Cost: the hollow diamond is intentionally incomplete and must not be mistaken
  for accepted visual art.

## More Information

- [ADR-0311](0311-pestiferous-cards-reveal-one-plagued-unit-at-a-time.md)
- [Runtime asset contract](../runtime-asset-contract.md)
- [Game concept](../game-concept.md)
