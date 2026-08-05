---
status: accepted
date: 2026-08-05
deciders: owner (Nelson) + Codex
partially_supersedes:
  - "[ADR-0053](0053-battle-clock-time-control.md)'s no-chip display for untimed Levels"
refines:
  - "[ADR-0307](0307-every-replaceable-region-is-a-director-owned-scene-slot.md)"
---

# ADR-0451: Untimed Levels display elapsed Battle time

## Context

ADR-0053 made an absent `Level.timeControl` mean untimed and originally omitted the clock chip in
that state. A later title-bar composition kept the middle chip for stable three-part alignment but
filled it with a static infinity and **No limit**. That placeholder communicates the lack of a
deadline, but it discards useful information while every timed Level continues to show changing
time.

The owner's direction on 2026-08-05 is that a Level with no limit must still show time increasing.
This changes presentation and elapsed-time bookkeeping, not the gameplay meaning of
`Level.timeControl`.

## Decision

An untimed Battle retains the central clock chip and displays a count-up `m:ss` readout beginning at
`0:00`. Its secondary label remains **No limit**. The static infinity path and its special styling
are retired.

Elapsed time is a wall-clock Battle duration, not a second chess clock. It includes both the player
and opponent's live turns and cannot cause flag fall, defeat, an increment, or any other rules
transition. The authored countdown remains player-turn-only and otherwise unchanged.

The elapsed clock starts at the same director-authorized, post-paint activation boundary as the
countdown. It banks its exact duration when the Battle ends or its board departs, freezes on the
result, resumes the same attempt after Undo, and resets for Retry or any other fresh attempt. The
browser-resumable match snapshot stores only the banked duration, never a live timestamp, so load
and reload latency is not counted. Existing version-1 snapshots migrate at the storage boundary to
version 2 with a zero elapsed bank.

The display floors to completed whole seconds. The stored live anchor remains deadline-style wall
clock truth, so throttled rendering can delay a repaint but cannot stretch elapsed time.

## Consequences

- Every playable Level keeps a stable three-chip title-bar composition.
- Untimed play gains useful duration feedback without becoming timed gameplay.
- Retry begins again at `0:00`; a terminal result keeps the final elapsed value visible.
- The device-local match format advances to version 2 through an explicit one-way migration; no
  database or Level-format migration is required.
