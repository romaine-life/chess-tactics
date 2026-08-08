---
status: accepted
date: 2026-08-07
deciders: owner (Nelson) + Codex
partially_supersedes:
  - "[ADR-0074](0074-one-play-entry-one-shared-selector.md)'s visible Campaign collection"
  - "[ADR-0356](0356-continue-resumes-in-place-instead-of-re-listing-the-rail.md)'s Campaign resume entry"
refines:
  - "[ADR-0059](0059-reuse-the-canonical-primitive-not-a-bespoke-parallel.md)"
partially_superseded_by: "[ADR-0514](0514-play-opens-run-without-a-mode-rail.md)'s one-mode rail collapse"
---

# ADR-0513: Campaign Play entry is dormant

## Context

Campaign gameplay, content, progress, persistence, editing, and direct routes are
implemented. Campaign should not currently be offered as a player-facing game mode,
but this is a visibility decision rather than a retirement or migration of that work.

The visible Campaign collection previously owned the lower part of Play's source rail.
Simply hiding its buttons without changing that rail would leave a reserved scrolling
region below the remaining fixed destinations. Continue could also rediscover Campaign
through a persisted Campaign battle even when the ordinary entry was absent.

## Decision

- One explicit Git-owned switch, `CAMPAIGN_PLAY_ENTRY_ENABLED`, controls Campaign's
  player-facing entry points and is currently `false`.
- While the switch is off, Play renders one complete fixed rail containing Continue,
  Skirmish, Run, and Levels. It mounts no Campaign heading, campaign buttons, or empty
  Campaign scroll region, and the rail collapses to the fixed stack.
- Continue excludes persisted Campaign battles from its resumable candidates and its
  empty guidance names only the modes that are actually offered.
- Campaign implementation is retained. Campaign hydration, content, progress,
  gameplay, editor surfaces, selector parsing, and `/play/select/campaign/<id>` direct
  routes remain intact. Re-enabling the one switch restores the existing menu and
  Continue entry behavior.
- This is a global product policy, not a player preference or an environment-dependent
  feature flag. The disabled entry does not appear as a locked or unavailable control.

## Consequences

- The ordinary Play menu no longer advertises Campaign and does not leave a visual gap
  where its collection was.
- Existing Campaign code and direct review addresses remain available for development.
- A saved Campaign battle is preserved but is not offered by Continue while Campaign is
  dormant.
