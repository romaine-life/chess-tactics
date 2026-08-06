---
status: accepted
date: 2026-08-05
deciders: owner (Nelson) + Codex
partially_supersedes: "[ADR-0356](0356-continue-resumes-in-place-instead-of-re-listing-the-rail.md)'s resume-action label"
refines: "[ADR-0294](0294-play-defaults-to-a-multi-mode-continue-surface.md)"
---

# ADR-0474: Continue resume action is labeled Continue

## Context

The Play selector's Continue destination identifies the most recent unfinished activity and
presents one final action that resumes it. ADR-0356 labeled that action **Play**. On a surface
already named Continue, **Play** describes the broad application area but does not tell the
player that activating it will resume saved progress.

## Decision

- The sole resume action on Play's Continue surface is labeled **Continue**.
- The action keeps the same destination and behavior; only its player-facing label changes.
- Play actions on ordinary Campaign, Skirmish, Levels, and Run preparation surfaces remain
  **Play**, because those surfaces are not the dedicated resume destination.

## Consequences

- The destination and its action use the same self-labeling resume vocabulary.
- A player can distinguish resuming unfinished work from choosing an ordinary Play entry.
- Continue retains ADR-0356's one-activity, one-action composition and routing behavior.
