---
status: accepted
date: 2026-08-06
deciders: owner (Nelson) + Codex
supersedes:
  - "[ADR-0149](0149-artwork-select-toggles-candidate-discovery.md)"
partially_supersedes:
  - "[ADR-0148](0148-floating-artwork-uses-dedicated-placement-and-explicit-selection.md)'s growing Selected dropdown"
refines:
  - "[ADR-0059](0059-reuse-the-canonical-primitive-not-a-bespoke-parallel.md)"
  - "[ADR-0434](0434-scene-art-uses-its-ground-contact-for-shared-depth.md)"
  - "[ADR-0464](0464-forests-are-saved-rerunnable-generator-instances.md)"
---

# ADR-0500: Scene Art Select is local, alpha-aware, and stack-cycling

## Context

Scene Art Select outlined every placed image rectangle at once and put an independent rectangular
pointer target over each object. That discovery model was legible for a few landmarks, but Forest
and Town now materialize dense ordinary Scene Art. A generated Forest may contain a hundred trees:
the complete scene becomes outline noise, transparent canopy rectangles intercept visible art
behind them, collection order rather than rendered depth decides which object receives a click, and
the growing `Selected` dropdown is not a spatially meaningful way to find one tree.

The author needs to point at the visible object they mean. When several visible Scene Art pixels
genuinely overlap, the editor also needs an explicit way to reach every member of that local stack.

## Decision

- Select remains an explicit toggle. Activating it mounts one viewport-sized Scene Art selection
  surface, but draws no global candidate outlines.
- Pointer hover tests the exact source alpha painted by the same directional back/front draw
  operations used by the shared renderer. Transparent source pixels and transparent image gutters
  are inert. Selection waits for those alpha masks; it never revives rectangle hits while media is
  being measured.
- Eligible painted candidates are ordered front-to-back by their live render depth. Persisted
  placement order remains only the equal-depth tie-breaker, matching the renderer.
- Hover outlines only the current candidate's calibrated image bounds and names it beside the
  pointer. A primary click selects that candidate without moving it.
- Repeated primary clicks within six real viewport pixels cycle through the unchanged painted
  candidate stack. The local readout shows the selected candidate's one-based position and total;
  moving away or changing the stack resets cycling to the frontmost candidate. No modifier key is
  required.
- Clicking blank scene space does not clear the current object. Clicking Select again exits the
  mode and clears it, and a plainly labelled **Clear** action remains beside the current-object
  readout.
- The unbounded instance dropdown is retired. The compact readout names only the current source and
  exact X/Y position. Move, transform, duplicate, and Delete remain locked to that stable selected
  id, and the selected object retains its dotted outline outside discovery mode.
- Hand-placed, Forest-owned, and Town-owned Scene Art use the same spatial picker. Generator output
  does not create a parallel Forest-only selection system.
- Browser raster-alpha decoding is one shared primitive used by Scene Art selection and other
  source-pixel proofs rather than a feature-local cache.

## Consequences

- Dense Forests remain visually readable while Select is active.
- Clicking visible art chooses what the shared compositor paints in front, and transparent sprite
  rectangles can no longer make another tree unreachable.
- True painted overlaps remain fully reachable through a visible, discoverable local cycle.
- A selected generated placement is still ordinary Scene Art: deleting it removes that one output
  instance, while a later explicit Regenerate may recreate generator-owned output as ADR-0464
  already specifies.
- Source media that cannot be alpha-measured is reported and remains unselectable instead of
  silently falling back to inaccurate rectangular interaction.
