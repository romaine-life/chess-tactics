---
status: accepted
date: 2026-08-04
deciders: owner (Nelson) + Codex
supersedes:
  - ADR-0382
refines:
  - ADR-0059
  - ADR-0205
  - ADR-0307
  - ADR-0355
---

# ADR-0383: Run viewport DOM is a scene contribution

## Context

ADR-0205 and ADR-0307 already made every meaningful drawn-region replacement a
director-owned scene. The Run nevertheless allowed a feature component to mount
one legitimate `RunWorkspace` and then replace everything inside it from local
React state. Bona Vacantia used `targeting` and `selectedUnitId` this way, and
ordinary Army inspection used another local selected-unit state. Both swaps sat
inside the real `SceneBoundary`, so the director saw one unchanged scene and no
fade occurred.

That failure is not principally a stacking-order bug. Keeping the scene boundary
above undeclared siblings would catch a competing overlay, but it cannot catch an
undeclared screen painted *inside* the authorized layer. The missing boundary was
a capability: feature code could emit viewport DOM without first declaring the
presentation identity it meant to show.

ADR-0382 correctly kept a targeted take provisional until confirmation, but it
explicitly put the target and selected unit in local presentation state. It is
superseded so the gameplay transaction remains provisional without making the
visible screen private state.

## Decision

The Run viewport is a closed scene-contribution API.

- `RunSceneSnapshot.workspace` is a discriminated object, not a loose view label.
  It carries every identity that can replace the Run viewport: ordinary workspace,
  selected Army unit, or Bona target lipsanon and selected unit.
- The address supplies intent. The scene manifest validates a requested lipsanon
  against the current Bona offers and target policy, and a requested unit against
  the current Army. Invalid intent resolves to the nearest valid authored scene;
  it never acquires a viewport identity of its own.
- Each distinct workspace object produces a distinct `run-workspace` instance and
  manifest id. Mat to target ledger, ledger to profile, and either back operation
  therefore use the one director lifecycle and its shell-viewport overlap scope.
- `RunSceneViewport` is the sole exported capability that emits the Run viewport
  landmark, shell frame, artwork layer, and `data-run-scene-view` identity. A
  feature supplies its required typed scene object. The former unscoped
  `RunWorkspace` renderer is not exported.
- Ordinary React remains valid inside the content slot granted by that API. This
  decision does not replace React with `AddDiv`/`AddParagraph`. It closes the
  architectural boundary that matters: descendants may implement the contents of
  the declared scene, but they may not claim another viewport, portal around its
  authority, or privately choose a screen-sized child identity.
- Navigation controls which change that identity use the canonical Run address
  helpers. Filters, focus, hover, and the outgoing lipsanon-flight latch remain
  local because they do not select a different drawn region.

For a targeted Bona choice, the provisional lipsanon is projected into the
canonical held strip for the authored target scene. The decision brief does not
draw a second icon and does not repeat “Bona Vacantia”. The ledger labels every row
as **Select**, the profile confirms **Give Adlected to this unit**, and the safe
back action says **Return to the three offers**. Confirmation alone writes the
lipsanon and target atomically and reveals the Shop.

## Enforcement

- The presentation architecture build check permits Run viewport/frame DOM only in
  `RunSceneViewport`, requires every consumer to pass a typed scene object, rejects
  Run feature portals around that authority, and rejects the retired local target
  and selected-unit scene states.
- Manifest tests prove all mat, target-ledger, target-profile, Army-ledger, and
  Army-profile pairs have distinct scene/layer identities and the expected
  `shell-viewport` overlap scope. Invalid addresses must collapse to a valid scene.
- The live Run transition gate records the real director preparation, entrance,
  and changed committed identity for mat to target and ledger to profile, then
  audits that the active Run boundary owns exactly one viewport contribution.
  Run's overlapping complete layers acknowledge exit synchronously, so the first
  browser-observable phase is `loading`; `entering` is the visible crossfade.
- A DOM topology audit remains a secondary guard for undeclared viewport siblings.
  It is not accepted as proof that descendants used scene identity correctly.

## Consequences

- A contributor adding a Run screen meets an obvious compile/build boundary: add
  an authored workspace variant and submit its scene object to the renderer.
- Provisional gameplay data remains outside `RunDocument`, while visible identity
  is addressable, reproducible, and director-owned.
- The architecture prevents the bug class at its ownership boundary instead of
  relying on z-index or a screenshot to notice a missing fade.
- The closed API adds deliberate ceremony for a new Run viewport. Local widgets
  inside an already-authored scene do not pay that cost.
