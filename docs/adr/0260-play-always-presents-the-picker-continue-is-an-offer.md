---
status: accepted
date: 2026-07-30
deciders: owner (Nelson) + Claude
partially_supersedes:
  - "[ADR-0257](0257-play-lands-on-the-resumable-activity-or-the-neutral-hub-root.md)'s resume-forward clause (its neutral root, canonicalization, and installed-row clauses remain in force)"
refines:
  - "[ADR-0232](0232-continue-run-selects-run-before-play.md)"
---

# ADR-0260: Play always presents the picker; Continue is an offer

## Context

The owner directed that Play must not default to Skirmish. ADR-0257 delivered
that as a neutral selector root, but also added a resume-forward: once content
and the Run document settled, the root replace-navigated to the one in-progress
activity — an unresolved battle went straight to its live board and the picker
never appeared.

That forward over-extended the direction. One PR earlier (#552) the selector
had already gained a Continue rail entry: clicking Play showed the picker with
the resumable activity offered at the top, and the player chose. The
resume-forward (#555) replaced that offer with a redirect, so any persisted
battle or active Run made the mode choice unreachable from the Play button —
observed immediately as "Play takes me straight to the battle screen." Choosing
to continue belongs to the player; an unresolved activity must not capture the
Play entry.

## Decision

- The bare selector root `/play/select` **always reveals the picker**. It never
  replace-navigates to a resumable activity.
- A resumable activity (most recent of the active Run or persisted battle, per
  the existing `continueActivity` ordering) is presented as an **offer**: the
  existing Continue rail entry stays first in the rail, and the neutral hub's
  action panel leads with a prominent **Continue card** naming the activity
  (label, detail) whose single action navigates to the same Continue
  destination ADR-0257 used — a battle's live board, or the Run submenu
  (ADR-0232).
- The root holds composition only until the Run document settles, so the
  Continue offer and rail order reveal together instead of popping in.
- Everything else in ADR-0257 stands: the installed Play row targets the bare
  root, the root is a real authored neutral state with no lit tab, malformed
  paths and missing campaigns canonicalize to the root, and board exits keep
  targeting explicit tab addresses.

## Consequences

- Clicking Play always presents the mode choice; continuing an interrupted
  activity is one click, chosen, not imposed.
- A stale persisted battle can no longer trap the Play entry on a board the
  player has mentally abandoned; it is simply an offer they can ignore.
- The neutral hub is now reachable while activities are in progress, so its
  copy coexists with the Continue card rather than being the nothing-to-resume
  case only.
