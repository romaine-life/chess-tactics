---
status: "accepted"
date: 2026-07-13
deciders: Nelson, Codex
---

# ADR-0091: Unsaved drafts belong to the Unassigned editor collection

## Context

The private **Continue editing** section introduced by ADR-0090 was rendered
above every Editor collection. Selecting a campaign therefore showed unrelated
working-copy cards before that campaign's own settings and levels. The rail also
gave no indication that private unsaved work existed elsewhere, so moving the
cards out of the global position without a navigation signal would make them
harder to discover.

The Editor already owns an **Unassigned levels** meta-collection for authored
work that is not being presented inside a campaign. It is the natural navigation
home for resumable working-copy cards even though the saved level count and the
working-copy count remain distinct facts.

## Decision

- The **Continue editing** section renders only while **Unassigned levels** is
  selected. It appears before the canonical Unassigned Levels section.
- Draft discovery and bounded owner-scoped hydration remain eager at Editor load
  so the rail can signal unsaved work before the collection is opened.
- When one or more resumable working copies exist, the existing Unassigned rail
  tab's trailing-status slot shows a noninteractive `!` attention marker. Its
  accessible label states that unsaved drafts are available; it does not claim
  a total from the intentionally bounded visible-card list.
- The tab's normal `N levels` subtitle continues to count canonical unassigned
  Levels only. Drafts are not added to that number because a working copy can be
  never-saved, can overlay a saved Level, or can already have a campaign home.
- The marker reflects the same bounded private draft list rendered inside the
  collection. It does not imply that autosaved work is canonical or playable.
- Draft-card links carry `/editor?collection=unassigned` as their return target,
  and the Editor restores that collection from the query parameter, so Back
  returns to the collection that owns the card. The Editor keeps this route
  parameter synchronized with rail selection, and nested edit/play links carry
  the active collection as their return context.

## Consequences

- Campaign and Skirmish Profile screens contain only their own content.
- Unsaved work remains discoverable from anywhere in the Editor without a global
  section occupying every collection.
- Saved-level counts retain their existing meaning, while the separate marker
  honestly reports private working-copy state.
- The rail reuses its canonical trailing-status slot and stone-continuity tab;
  no new navigation or chrome primitive is introduced.
