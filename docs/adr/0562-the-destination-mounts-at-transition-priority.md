---
status: accepted
date: 2026-08-10
deciders: owner (Nelson) + Claude
refines:
  - "[ADR-0369](0369-one-cold-load-ladder-builds-background-then-chrome-then-scene.md)"
  - "[ADR-0561](0561-a-rail-tab-marks-what-it-opened-on-the-press.md)"
---

# ADR-0562: The destination mounts at transition priority, and nothing measures during render

## Context

Pressing a rail tab whose destination is expensive froze the whole app. Not "dropped a few
frames" — froze: the rain (a rAF-driven WASM canvas draw) stopped, the waterfalls
(`background-position` under `steps()`, a main-thread property, never composited) stopped, and
the rail's own `›` open mark — whose DOM change had already happened — did not appear until it
was over. On the Enchiridion's card gallery, profiled on the live app, that was **one task of
1194ms with no paint anywhere inside it**.

Three things stacked into that single task, and the first one made the other two unsplittable:

1. **The mount ran at synchronous priority.** The stack was
   `performSyncWorkOnRoot → renderRootSync → workLoopSync`. Committing the destination is
   dispatched from an effect that runs off a click, so React built the entire incoming screen in
   one non-yielding pass. The mark's update was batched into the same commit, which is why a
   control that had already changed could not paint until a screen the player had not asked to
   see yet had finished being built.
2. **`KitScroll` measured inside a `setState` updater.** `setGutter((previous) => …
   clientHeight: el.clientHeight …)` — React runs an updater during the RENDER phase, and
   re-runs it on every render before the state settles. That is a forced synchronous layout per
   render of every scrolling pane in the app, charged against whatever the pane contains.
3. **`FittedTabLabel` read `document.fonts.ready` in each label's layout effect.** That getter
   makes the font set settle, which forces a style recalc over the whole document — ~500ms when
   a label mounts beside a freshly-inserted 284-card gallery, for a call whose only purpose is
   "refit once webfonts land".

Neither 2 nor 3 was individually the cause, which is what made this hard to read: stubbing
either one out changed nothing, because the next forced layout in the same commit paid the same
bill. The cause was the commit being one atomic, un-yieldable block in the first place.

## Decision

**The destination mounts at transition priority.** The three dispatches that swap the mounted
scene — `exit-finished` with no shared region, the empty-slot origin, and the post-exit commit —
run inside `startTransition`, with `setPath`/`setSearch` inside the same transition because they
are the address the mounted scene renders from. Everything else about the director is unchanged:
same actions, same order, same generation guard, same `exiting → loading → entering` phases.

**Nothing measures the DOM during render.** A `setState` updater is render-phase code; layout
reads belong in the effect that already measured, hoisted into a local and passed in.

**Document-wide state is read once per document, not once per mount.** `document.fonts.ready`
is resolved at module scope, where the document is small and nothing is waiting to paint.

## Consequences

- The open mark now paints **~80ms** after the press instead of at the end of the block, and an
  ordinary destination press no longer stalls at all (a 110ms freeze became 53ms, with nothing
  over 60ms). That is the behaviour ADR-0561 promised and could not deliver on its own: the mark
  was always *set* on the press: it just could not be *seen* until the paint arrived.
- The card gallery's single 1194ms task is now 735ms + 466ms with React yielding between them,
  and the app-code CPU inside it fell from 558ms to ~120ms once the render-phase measurement was
  removed.
- **A ~1s stretch on that gallery remains, and priority cannot remove it.** A commit and its
  layout effects are atomic by construction, and `KitScroll` must measure a scroll container that
  the browser must therefore lay out — 284 card faces of it. The only remaining lever is to stop
  mounting the whole catalog at once. Do not reach for scheduling again there; reach for
  windowing.
- Every director gate was re-run against this change and passes: `verify:play-transition`,
  `verify:strategikon` (all six section/reference hops still run
  `current → exiting → loading → entering → current`), `verify:scene-retention`,
  `verify:unit-arrival --settled`, and `verify:run-scenes`.
- A transition can defer a commit while a destination suspends. The menu destinations sit behind
  their own `Suspense` boundary and the director owns its loading presentation, so this shows the
  outgoing scene rather than a fallback flash — but a future screen that suspends OUTSIDE a
  boundary would stall the ladder, and the gates above are what catch it.
