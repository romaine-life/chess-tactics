---
status: accepted
date: 2026-08-06
deciders: Nelson
partially_superseded_by: "[ADR-0501](0501-promotion-opens-without-a-preselected-looking-choice.md)'s removal of first-choice autofocus"
supersedes:
  - "[ADR-0499](0499-pawns-arrive-before-their-promotion-choice.md)'s Controls-rail placement for the post-arrival choices"
refines:
  - "[ADR-0059](0059-reuse-the-canonical-primitive-not-a-bespoke-parallel.md)"
  - "[ADR-0102](0102-runtime-buttons-use-registered-inner-chrome.md)"
---

# ADR-0500: Promotion choices stay with the arrived Pawn

## Context and Problem Statement

ADR-0499 made a Pawn arrive before asking what it became, but placed that question in the normal
Controls rail. The timing was causal while the composition was not: the player's eye followed the
Pawn across the battlefield, then had to discover that an ordinary-looking sidebar had changed.
Nothing spatially joined the four replacement figures to the Pawn that had just triggered them.

## Decision Drivers

- The promotion question must identify its subject without requiring the player to scan the HUD.
- The arrived Pawn and its destination must remain visible while the player chooses.
- The picker must stay legible under camera pan and zoom and must not run off the board's outside
  edge on either promotion rank.
- Every replacement remains a canonical registered control; promotion does not authorize a new
  CSS-painted panel or button family.
- Run's Paid Crossing alternative and either multiplayer seat must use the same presentation.

## Considered Options

- Keep the existing Controls-rail card and add louder copy.
- Place a modal in the center of the screen.
- Anchor one blocking callout beside the arrived Pawn and highlight its destination.

## Decision Outcome

Chosen: **anchor one blocking callout beside the arrived Pawn**. When the post-arrival choice phase
opens, the destination receives the existing selected-cell treatment and an opaque registered
inner-chrome picker appears directly beside that board seat. Its heading says both what happened
and what is required: “Pawn arrived” and “Choose what this Pawn becomes.” The replacement figures
remain a two-by-two set of registered asset-swatch buttons; the first receives focus when the
blocking dialog appears. Paid Crossing, when available, is a full-width fifth registered action.

The picker is board-seated so camera pan keeps it attached to the Pawn. It opens toward the board's
middle rather than farther past an outside edge. Its own scale and offset cancel the board zoom, so
the relationship follows the battlefield while the text and targets remain a stable screen size.
The normal Controls rail continues to show unit context but owns no duplicate promotion controls.

This changes presentation only. ADR-0499's local arrival projection, choice timing, atomic solo
commit, premove boundary, and ordered multiplayer submission remain unchanged.

### Consequences

- Good: the board now communicates event, subject, and required action in one place.
- Good: the Pawn remains visible and highlighted rather than being obscured by a centered modal.
- Good: zoom and either promotion edge do not shrink or strand the controls.
- Cost: the board compositor owns one interactive DOM overlay above its canvas scene.

## More Information

The reusable presentation component is indexed in
[`docs/shared-ui-primitives.md`](../shared-ui-primitives.md), while the binding visual rule lives in
[`docs/ui-art-direction.md`](../ui-art-direction.md).
