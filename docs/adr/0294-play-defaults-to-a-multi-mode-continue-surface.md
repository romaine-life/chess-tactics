---
status: accepted
date: 2026-08-01
deciders: owner (Nelson) + Codex
supersedes:
  - "[ADR-0293](0293-continue-is-one-agnostic-resume-entry.md)"
partially_supersedes:
  - "[ADR-0257](0257-play-lands-on-the-resumable-activity-or-the-neutral-hub-root.md)'s neutral landing"
  - "[ADR-0260](0260-play-always-presents-the-picker-continue-is-an-offer.md)'s neutral root and single resolved offer"
refines:
  - "[ADR-0074](0074-one-play-entry-one-shared-selector.md)"
  - "[ADR-0232](0232-continue-run-selects-run-before-play.md)"
  - "[ADR-0290](0290-run-preparation-follows-play-master-detail-navigation.md)"
---

# ADR-0294: Play defaults to a multi-mode Continue surface

## Context

ADR-0293 removed the duplicate Continue card from the neutral Play hub, but it
left Continue as a rail shortcut whose descriptor named one resolved activity.
For an active Run that shortcut opened ordinary Run preparation with Current
Run and Start New Run choices. Continue therefore remained Run-shaped and made
the player pass through a second choice even though the resume intent was
already known.

Continue is not a synonym for Continue Run. It is the Play selector's
activity-agnostic view of unfinished work across Campaign, Skirmish, Run, and
Levels. Play should make that view its best default guess while still requiring
an explicit final Play action before entering gameplay.

## Decision

- **Continue** is a permanent first Play rail entry. Its rail control contains
  only the label Continue: it never embeds the resolved activity kind, title,
  or progress as a descriptor.
- The installed `/play/select` entry resolves to the Continue scene after
  canonical content and active-Run authority settle. It replace-canonicalizes
  to `/play/select/continue/<mode>` for the most recently updated resumable
  mode, or `/play/select/continue` when nothing is resumable. The root and bare
  Continue address compose the complete Continue scene rather than a neutral or
  fake intermediate hub.
- Continue's action column always presents the stable mode inventory Campaign,
  Skirmish, Run, and Levels. Each row names its resumable activity when one
  exists; otherwise it visibly says **Nothing to continue** and is disabled.
- The most recently updated available activity is selected by default. Its row
  is selected and the fixed fourth column contains its identifying details and
  one **Play** action. Selecting another available mode addresses and fills that
  same fourth column without entering gameplay.
- Continue derives availability from durable activity identity: active Runs use
  their Run document and Run battle activity id; persisted Campaign battles use
  campaign membership; Skirmish uses canonical profile levels; other persisted
  standalone battles belong to Levels. A Run battle snapshot is not also
  exposed as a second Levels activity.
- Continue never enters an activity automatically. The fourth-column Play
  action is the only transition to `/run` or the selected live Battle.
- Ordinary Skirmish, Run, Levels, and Campaign rail destinations remain their
  preparation/browsing surfaces. In particular, ordinary Run retains Current
  Run and Start New Run master-detail choices; Continue does not route through
  that Run preparation surface.

## Consequences

- Clicking Play produces the likely next action immediately while preserving a
  deliberate final Play confirmation.
- Continue remains semantically stable even as the unfinished activity changes
  kind, and the rail no longer looks Run-specific.
- Empty and partially available states are legible without hiding modes or
  changing rail order.
- Continue and ordinary Run share the established master-detail geometry but
  no longer pretend to be the same surface.
