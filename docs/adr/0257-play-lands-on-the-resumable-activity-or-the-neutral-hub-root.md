---
status: accepted
date: 2026-07-30
deciders: owner (Nelson) + Codex
partially_superseded_by:
  - "[ADR-0260](0260-play-always-presents-the-picker-continue-is-an-offer.md)'s always-picker rule (the resume-forward clause is retired; the neutral root, canonicalization, and installed-row clauses remain)"
  - "[ADR-0294](0294-play-defaults-to-a-multi-mode-continue-surface.md)'s Continue landing and canonicalization"
supersedes:
  - "[ADR-0074](0074-one-play-entry-one-shared-selector.md)'s canonicalize-to-Skirmish landing clause"
refines:
  - "[ADR-0231](0231-strategikon-and-enchiridion-share-one-reference-workspace-language.md)"
  - "[ADR-0232](0232-continue-run-selects-run-before-play.md)"
---

# ADR-0257: Play lands on the resumable activity or the neutral hub root

## Context

ADR-0074 gave the main menu one Play entry whose installed route was the
Skirmish tab, and canonicalized bare or malformed selector paths to
`/play/select/skirmish` because the selector had no neutral state. Clicking
Play therefore committed the address bar and the rail to a Skirmish selection
the player never made. The owner directed that Play must not default to
Skirmish: it should return to the one in-progress activity when there is one,
and otherwise open plainly with nothing preselected.

## Decision

- The installed `menu-mode` Play record navigates to the bare selector root
  `/play/select`. Migration 46 updates the installed row and is guarded to the
  retired canonical default, so an owner-authored route is never overwritten
  and a database without the row is a clean no-op.
- The bare root is a real authored state: scene path `main-menu → play` with no
  `play-content` child, no lit rail tab, and one neutral action panel that
  names the choices without making one.
- Once both content sources and the Run document settle, the root resumes the
  single most recent in-progress activity by replace-navigation to its
  existing Continue destination: an unresolved standalone or Campaign Battle
  returns directly to its live board (ADR-0231), while an active Run selects
  the Run submenu and never enters `/run` directly (ADR-0232). Nothing
  composes while that decision is pending, so the neutral hub cannot flash
  before a resume.
- With nothing to resume, the neutral hub reveals. When either content source
  is unavailable, the selector presents its retryable error instead of
  forwarding on incomplete knowledge (a Campaign Battle must resume under its
  campaign identity, which unknown content cannot prove).
- Malformed selector paths, and campaign ids still absent after both sources
  settle, canonicalize to the root — not to Skirmish. `/play/select/skirmish`
  remains the Skirmish tab's real address, produced only by choosing it.
- Board exits and `returnTo` fallbacks continue to target explicit tab
  addresses, so backing out of a live board never re-enters the resume
  landing.
- The main-menu tab highlight matches a destination by shell-family membership
  rather than exact route equality, so an installed route may migrate within
  its family without a transient unlit tab.

## Consequences

- Clicking Play means "continue playing": it returns to the interrupted
  activity, or presents the mode choice honestly with nothing preselected.
- The address bar never claims a selector state the player did not produce;
  deep links to the bare root inherit the same resume-or-neutral semantics.
- Back/forward history stays clean: the resume is a replace, so leaving the
  resumed board returns to the screen that preceded Play, not to a bounce.
- The landing decision is contract-tested at the source level, and the
  installed row, test fixture, backend smoke seed, scene manifest, and
  loading-contract note moved in the same change.

## Related decisions

Partially supersedes ADR-0074 (its one-Play-entry consolidation and retired
picker deletions remain in force). Instances ADR-0174 (append-only migration
for the installed row). Refines ADR-0231/0232's Continue destinations into the
Play landing itself.
