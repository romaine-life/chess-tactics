---
status: accepted
date: 2026-08-10
deciders: owner (Nelson) + Claude
refines:
  - "[ADR-0562](0562-the-destination-mounts-at-transition-priority.md)"
---

# ADR-0563: A long list arrives in pieces

## Context

The owner's requirement, in his words: *"the app has NO PROBLEM with loading taking 100 minutes.
it just needs to load IN THE BACKGROUND."* Loading time is already covered — the director has a
transition for it. What is not acceptable is the app going dead while it happens.

The Enchiridion's card catalog did exactly that. All 284 faces mounted in one commit, and for
about a second nothing on the screen could move: the menu's rain is a rAF-driven canvas draw and
its waterfalls animate `background-position` under `steps()`, a main-thread property that is
never composited, so both stopped along with every control.

Two fixes were tried first and neither was enough on its own, which is worth recording so the
next person does not re-run them:

- **Scheduling.** [ADR-0562](0562-the-destination-mounts-at-transition-priority.md) moved the
  mount to transition priority. That fixed the press — the pressed tab's mark now paints
  immediately instead of at the end of the block — but a transition can yield BETWEEN commits
  and never inside one. The gallery's own commit stayed atomic: 1194ms became 735 + 466.
- **Skipping work.** `content-visibility: auto` lets the browser skip layout and paint for
  off-screen items. Worth having, and it took the block from ~1000ms to ~730ms — but it does not
  skip the cost of CREATING the elements, which is what the rest of the block was.

## Decision

**A screen that mounts a long list puts it up in pieces**, one batch per animation frame, via the
shared `useProgressiveMount`. The screen appears at once with its first screenful and the rest
fills in over the following frames, with a paint — and therefore a rain frame, a waterfall step,
and a chance to respond to input — between every batch.

The total work is unchanged. Nothing is made shorter or faster; it is made interruptible. That is
the distinction the requirement turns on, and the one that both earlier attempts missed.

**Off-screen items additionally carry `content-visibility: auto`** with an `auto` intrinsic size,
so the browser both skips their layout while they are out of view and remembers their real size
once they have been in it (the scrollbar must not jump).

`useProgressiveMount` takes a `resetKey` alongside the total: a filter change that happens to
yield a list of the SAME length would otherwise leave the counter at "all mounted" and put the
whole new list up in one commit again.

## Consequences

- Measured on the live app, pressing CARDS: one 1194ms task with no paint in it became a run of
  50–85ms tasks, with the main thread idle for 2189ms of the 4s window. The longest stretch
  without a paint fell from **1074ms to 92ms** and painted frames rose from 154 to 232.
- The catalog still lands complete — 284 faces in 11 tier groups — and a filter change restarts
  the fill and lands complete too (169 for `rarity=rare`). Tier order is unaffected, because
  `cardsByTier` sorts its groups by rank: a partly-filled catalog is the same catalog with its
  tail missing, not a reordered one.
- A card addressed deeper in the catalog is not on the page in the first batch, so the
  scroll-into-view effect takes the mounted count as a dependency and runs again on each batch,
  landing on the card the moment it arrives.
- The remaining hitches are 60–90ms, which is a few dropped frames rather than a freeze. If they
  ever need to go, the lever is the batch size in `useProgressiveMount` — not another scheduling
  change.
- Any other screen that mounts a long list should use this hook. Screenshots of such a screen
  must let the fill finish before capturing; `npm run shot` already settles the scene first.
