---
status: superseded by ADR-0293
date: 2026-08-01
deciders: owner (Nelson) + Codex
refines:
  - "[ADR-0059](0059-reuse-the-canonical-primitive-not-a-bespoke-parallel.md)"
  - "[ADR-0260](0260-play-always-presents-the-picker-continue-is-an-offer.md)"
  - "[ADR-0290](0290-run-preparation-follows-play-master-detail-navigation.md)"
superseded_by:
  - "[ADR-0293](0293-continue-is-one-agnostic-resume-entry.md)"
---

# ADR-0292: Play hub Continue uses the complete choice frame

## Context

ADR-0260 made a resumable activity a prominent offer on the neutral Play hub,
but its first implementation rendered an inert inner frame containing the
activity label, detail, and a much smaller nested Continue button. Most of the
visible card therefore did nothing when pressed.

ADR-0290 subsequently corrected the analogous Run preparation controls:
Continue Run and Start New Run became canonical selectable rows whose complete
registered frames are their hit targets. Leaving the hub Continue offer on the
older card-plus-button model makes two adjacent Play surfaces use different
interaction geometry for the same kind of choice.

## Decision

- The neutral Play hub renders a resumable activity as the same registered
  full-frame Play choice row used by Run preparation.
- The activity label and decision-relevant detail live inside one `NavButton`.
  The complete inner-list-row frame is the hit target; there is no nested
  Continue button or inert wrapper frame.
- The Continue destination does not change: an unresolved Battle opens its
  live board, while an active Run opens the Run preparation submenu under
  ADR-0232.
- The leading Continue rail entry, the neutral no-selection state, and the
  no-automatic-redirect rule from ADR-0260 remain unchanged.
- Hub and Run choice rows share the one Play-scoped interaction class so hover,
  focus, disabled, and responsive behavior cannot drift into parallel styles.

## Consequences

- Every visible part of the Continue offer behaves like the action it depicts.
- The hub and Run preparation now use one choice language instead of nesting a
  small action control inside an otherwise inert choice card.
- Keyboard activation and route prefetch remain owned by the canonical
  `NavButton` transport.
