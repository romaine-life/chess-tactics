---
status: accepted
date: 2026-08-07
deciders: Nelson, Claude
refines:
  - "[ADR-0045](0045-units-deploy-with-a-staggered-drop-in.md)"
---

# ADR-0518: The board assembles — its obstacles drop before its armies

## Context and Problem Statement

[ADR-0045](0045-units-deploy-with-a-staggered-drop-in.md) gave the units a staggered drop at
board start and drew an explicit line around it: *"Neutral rocks are scenery, not deploying
units → no drop."* That was right for what it decided — it was choreographing an army's
DEPLOYMENT, and scenery does not deploy.

But rocks are not scenery in this game. A rock is the obstacle that shapes a position: blocking
one path is most of what makes one board different from another. Under ADR-0045's rule the
board revealed with its whole obstacle course already standing, and then the armies were placed
onto it — so the entrance said "here is a place, now the pieces arrive," when the thing worth
saying is "this position is being built."

Two facts about the implementation mattered for how this could be done at all:

- The entrance ADR-0045 describes as CSS keyframes (`.skirmish-board-unit.is-arriving`,
  `@keyframes unit-arrival`) is no longer how the game board plays it. The board is a canvas:
  `arrivalOffset()` computes the same spawn → hang → accelerate curve in JS and applies it to a
  draw op's `dy`/`opacity`. Those CSS rules are now unreferenced.
- Props are drawn as several ops — two clipped depth halves per authored part, at different `z`,
  so a unit can stand between a prop's front and back. A flat op list had no way to say which of
  those ops belonged to the same placed prop.

## Decision Outcome

**Placed ROCKS take part in the board's entrance, landing on the same fall curve as the units and
starting before them.** The reveal order becomes ground → obstacles → armies, running from the
board's far corner toward the player. It is one continuous beat, not three separated ones: on a
rock-heavy board the first units are already arriving while the last rocks are still falling, and
that overlap is what makes it read as assembly rather than as a checklist.

- **One motion, not a second one.** Rocks call the same `arrivalOffset()` the units call, on the
  `drop` track. There is no separate prop curve to keep in sync, and ADR-0045 §A/§B still govern
  the physics (a fall accelerates; board-world motion sits outside the chrome token ladder).
- **Ordered by depth, not by identity.** Units order by home edge because order teaches
  mine-vs-theirs. Obstacles have no side to teach, so they order by `x + y` — the same depth order
  their ops are painted in — and the position lays itself down front-ward.
  `STRUCTURE_ARRIVAL_BASE_MS` (130ms) releases the first rock well before `ARRIVAL_BASE_MS`
  (400ms) frees the first unit. The unit choreography itself is untouched — same base, same wave
  gap, same per-unit stagger — so ADR-0045's timing and its live gate still hold exactly.
- **Rocks only.** `structureArrives()` is the single predicate, and today it admits `kind ===
  'rock'`. Trees and houses stay standing scenery: a house falling out of the sky is a different
  claim about the world than a rock landing, and it is not one this decision makes. Widening the
  set is a one-line change at that predicate.
- **Ops carry the identity of the prop they belong to.** `BoardDrawOp.structure`
  (`{ key, kind, x, y }`) is stamped on every op emitted for a placed prop. Every op of one
  anchor takes the SAME offset, which is what keeps a flat-contact prop's two clipped halves from
  shearing apart mid-fall. This is identity metadata; it changes no pixels on its own, so
  thumbnails, bakes and every still consumer are byte-unaffected.
- **Same lifecycle as the units.** Props are admitted, staged and released through
  `unitArrivalPlan()`'s `pending`/`active`/`settled` states, keyed by anchor cell instead of piece
  id. A staged prop is held off the board (invisible, above its seat), so a battlefield prepared
  behind a scene transition never reveals a rock at a seat it has not arrived in. A `settled`
  review — a resolved position — owns no prop plans, exactly as it owns no unit plans. A retained
  battlefield does not re-drop rocks that were already standing.

### The fall needs no new art

Worth recording, because it is the question this work started from: an arriving rock is the
existing sprite under a transform. It is not a frame sequence, and generating one would fight the
projection rather than help it. The art questions that remain are the rock's own look and the
[ADR-0045 §D](0045-units-deploy-with-a-staggered-drop-in.md) landing effect (dust on soil, splash
on water, chips on stone) — both still open, and both independent of this decision.

### No new Level Editor surface

Rocks are already a prop kind with their own palette group under **Placed Art → Props**
(`/editor/level?layer=prop`). Dropping is a property of the KIND, resolved at render time from
`propDef().kind`, so nothing is authored, nothing is stored, and every rock already placed on
every existing board gets the entrance without being re-saved. A separate "falling rock" brush
would have split rock placement across two surfaces to express something the author never chooses
per-instance.

## Consequences

- Good: the start reads as a position being built rather than a stage being dressed; obstacles get
  the emphasis their gameplay weight deserves; no new motion family, no new art, no content
  migration, no editor surface.
- Cost: `BoardDrawOp` grew an optional identity field, and the scene compositor's frame loop now
  has a second reason to stay alive (bounded — it stops when the last prop lands). A board with
  many rocks spends longer assembling; the stagger is 55ms, so a heavy board should be re-judged
  by eye rather than assumed.
- The unreferenced `.skirmish-board-unit` arrival CSS is now doubly stale. Removing it is a
  separate cleanup and is deliberately not bundled here. **Done in ADR-0527's branch**: the
  whole family went — the move glide, the arrival drop, the `is-moving`/`is-dragging`/
  `is-premove-origin` chrome, the unit badge spans, the reduced-motion overrides, and the five
  keyframes only they used. `.board-unit-seat` stays; it is what the Studio and the labs seat a
  DOM unit with. A headless capture had been firing during the canvas entrance and writing
  boards with no pieces on them, and this CSS was the first thing every such investigation
  found and believed.

## More Information

- Code: `structureArrives` / `computeStructureArrivalDelays` / `arrivingStructures` /
  `structureArrivalOp` in `frontend/src/render/SkirmishBoard.tsx`; `BoardStructureIdentity` in
  `packages/board-render/src/render/renderPlan.ts`.
- Verification: `frontend/scripts/capture-board-assembly.mjs` records the live entrance frame by
  frame from inside the page and tiles it into one labelled strip — the frames BETWEEN the two
  settled states are the only thing that can show a drop, and a CDP screenshot loop is far too
  slow to sample a 620ms fall. The existing `npm run verify:unit-arrival` gate (ADR-0357) still
  passes unchanged.
