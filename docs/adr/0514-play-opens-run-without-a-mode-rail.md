---
status: accepted
date: 2026-08-07
deciders: owner (Nelson) + Codex
partially_supersedes:
  - "[ADR-0074](0074-one-play-entry-one-shared-selector.md)'s visible multi-mode selector"
  - "[ADR-0356](0356-continue-resumes-in-place-instead-of-re-listing-the-rail.md)'s ordinary Continue entry"
  - "[ADR-0513](0513-campaign-play-entry-is-dormant.md)'s remaining fixed Play rail"
refines:
  - "[ADR-0290](0290-run-preparation-follows-play-master-detail-navigation.md)"
  - "[ADR-0059](0059-reuse-the-canonical-primitive-not-a-bespoke-parallel.md)"
---

# ADR-0514: Play opens Run without a mode rail

## Context

After Campaign became dormant, Play still devoted a complete source column to
Continue, Skirmish, Run, and Levels. Campaign, Skirmish, and standalone Levels should
all remain implemented for development and direct review, but Run is now the only mode
the ordinary game offers. A selector whose only enabled mode is Run would repeat the
top-level Play choice and consume a full column without making a decision.

Continue is equally redundant in a one-mode product. Run preparation already keeps the
visible Current Run choice beside Start New Run and honestly disables Current Run when
there is nothing to resume.

## Decision

- One Git-owned `PLAY_MODE_ENTRY_ENABLED` registry marks Run enabled and Campaign,
  Skirmish, and Levels disabled. Continue derives candidates only from enabled modes.
- The installed top-level Play address `/play/select` paints Run preparation immediately
  and replace-canonicalizes to `/play/select/run` after Run authority settles. Malformed
  selector addresses also resolve to Run.
- When only one mode is enabled, Play mounts no source rail at all: no Continue,
  Skirmish, Run, Levels, Campaign heading, campaign rows, or reserved scroll region.
- Removing that rail shifts Run's Current Run / Start New Run action column into the
  first destination seat beside the persistent main-menu rail. A selected Run detail
  follows in the next seat at its full authored width; it does not inherit the old
  narrow-viewport compression that made room for the removed mode column.
- Campaign, Skirmish, Levels, and Continue implementations remain in source. Their
  parsers, scene registrations, direct selector addresses, gameplay, content, editor,
  and persistence paths remain available for development and review. This decision
  removes ordinary discovery, not those systems.
- The top-level control remains **Play**. Run is the mode it opens, while Play remains
  the user verb that distinguishes this destination from Editor and reference tools.

## Consequences

- The ordinary game exposes one mode, Run, with no redundant intermediate choice.
- Run preparation and its selected detail shift one full column toward the main-menu
  rail and use the released horizontal space.
- Reintroducing a second mode is a policy change in the shared registry; the retained
  source rail and mode implementations can then render again without reconstruction.
- Dormant-mode saved state is preserved but is not advertised by Continue.
