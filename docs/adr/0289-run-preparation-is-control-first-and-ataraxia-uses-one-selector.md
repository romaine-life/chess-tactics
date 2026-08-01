---
status: accepted
date: 2026-08-01
deciders: owner (Nelson) + Codex
partially_supersedes:
  - "[ADR-0232](0232-continue-run-selects-run-before-play.md)'s nested Play label and authored-War summary presentation"
refines:
  - "[ADR-0193](0193-runs-are-persistent-wars-around-unchanged-chess-battles.md)"
  - "[ADR-0266](0266-ataraxia-names-optional-run-difficulty-after-real-history.md)"
  - "[ADR-0286](0286-ataraxia-i-is-a-persisted-run-tier-with-draw-time-pestiferous-instances.md)"
partially_superseded_by:
  - "[ADR-0290](0290-run-preparation-follows-play-master-detail-navigation.md)"
  - "[ADR-0291](0291-ataraxia-zero-is-a-named-tier-with-visible-impact.md)"
---

# ADR-0289: Run preparation is control-first and Ataraxia uses one selector

## Context

The first installed Run preparation page presented a pitch, the selected
official War's authoring name and description, a generic Play action, two large
Ataraxia cards, a baseline explainer, and a separate Start a New Run action.
That made an active test War look like another mode choice and left two adjacent
entry actions whose different consequences were not legible.

Run preparation is a menu surface. Its job is to let the player resume the
current Run or choose the difficulty for a replacement, not explain the feature
or expose internal War-pool language. Ataraxia is also a linear ladder intended
to grow, so permanent side-by-side cards do not scale.

## Decision

- The Run preparation surface is control-first. It has no Roguelike chess
  kicker, standalone Run heading, feature pitch, selected War name, War
  description, or baseline flavor sentence.
- An active Run is identified as **Current Run** and summarized only by
  decision-relevant progress: Battle position, army size, gold, and selected
  Ataraxia.
- The active Run's nested action is labeled **Continue Run**, while the
  destructive replacement action remains separately labeled **Start New Run**
  and retains its abandonment confirmation. This partially supersedes
  ADR-0232's generic nested **Play** label without changing its
  selector-before-entry navigation rule.
- Ataraxia uses the canonical shared dropdown. Its popup uses the shared drawn
  scroll primitive, lists every installed tier in ladder order, keeps
  unavailable installed tiers visible but disabled, and skips disabled tiers
  during keyboard navigation.
- **No Ataraxia** needs no explanatory sentence. When a selected tier adds a
  mechanic, its direct mechanical statement remains visible beneath the
  dropdown, preserving ADR-0266's requirement that difficulty effects be
  understandable without historical exposition.
- The War editor reuses the same Ataraxia selector instead of retaining a
  parallel card control.

## Consequences

- Resume and replacement are visibly different actions instead of two
  unexplained launch buttons.
- Internal or temporary War names no longer dominate the player-facing
  preparation page.
- Future installed tiers extend one bounded scrollable list without widening
  or multiplying the setup cards.
- Locked tiers communicate the ladder ahead without implying that they can
  already be selected.
