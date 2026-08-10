---
status: accepted
date: 2026-08-09
deciders: owner (Nelson) + Claude
refines:
  - "[ADR-0548](0548-a-failed-scene-offers-the-act-that-can-fix-it.md)"
  - "[ADR-0369](0369-one-cold-load-ladder-builds-background-then-chrome-then-scene.md)"
---

# ADR-0558: A scene being replaced is not rebuilt on its way out

## Context

Pressing **Rewards** on a settled Victory flickered, badly. The reported symptom was "the reward
screen flashing"; it was not. The screen that flashed was the one being left.

The recorded transition, frame by frame:

1. Victory sits on the played battlefield. Board element identity `#1`, fully painted.
2. Rewards is pressed. The board becomes a **different element** — identity `#2`, opacity 0,
   collapsed to less than half its height. The battlefield is gone and its own
   **"Preparing battlefield… / Composing terrain, units, and controls"** card is on screen over the
   village backdrop, with the Victory heading and the Rewards button still sitting on top of it.
3. Roughly 200ms later the board re-reveals at full size. Everything is back.
4. *Only then* does the director's crossfade to the report begin, and run correctly.

Nothing was wrong with the destination, the report, or the crossfade. The outgoing scene was being
**destroyed and built again from scratch** at the start of its own replacement, and what the player
saw was a freshly-mounted battlefield walking through its entire loading contract in front of them.

The cause is one missing suffix. `App` renders one scene layer while settled and two while a
replacement overlaps, and those layers are keyed differently:

| | key |
|---|---|
| settled (single) | `` `${sceneLayerKey(mountedScene)}#${scene.retryEpoch}` `` |
| overlap — outgoing | `` sceneLayerKey(scene.current) `` |
| overlap — incoming | `` `${sceneLayerKey(scene.destination)}#${scene.retryEpoch}` `` |

The instant a replacement begins, the layer holding the visible scene goes from `A#0` to `A`. A
changed key is React's instruction to throw the subtree away and mount a new one, so it did —
every scene replacement in the application, on every route, for the whole life of the two-layer
overlap. Victory is simply where it was impossible to miss, because the battlefield is the most
expensive thing in the app to rebuild and it announces its own rebuild in words.

The incoming layer's `#retryEpoch` is deliberate and load-bearing: ADR-0548 keys a preparing
destination by the retry that built it, so pressing Retry rebuilds a screen holding its own failure
instead of re-driving the director around the instance still reporting it. That epoch belongs to the
**destination**. The committed scene cannot borrow it — a retry advances the number while the
committed scene is standing fully painted behind the failure presentation, and borrowing it would
destroy that screen too, on a worse surface than this one.

## Decision

**A scene keeps one React mount identity from the moment it is committed until the moment it is
replaced.** Beginning a transition is not a rebuild, and neither is a retry aimed at something else.

The director records `committedEpoch`: the `retryEpoch` the committed scene was mounted with. It
advances only where a destination is promoted to current — `entrance-finished` and
`empty-slot-committed` — which is the one moment the committed layer legitimately becomes a
different mount, and it lands on exactly the epoch the incoming layer was already keyed by, so the
key does not change as the overlap collapses back to a single layer.

Layer keys become:

| | key |
|---|---|
| single, mounting the destination | `` `${sceneLayerKey(destination)}#${retryEpoch}` `` |
| single, mounting the committed scene | `` `${sceneLayerKey(current)}#${committedEpoch}` `` |
| overlap — outgoing | `` `${sceneLayerKey(current)}#${committedEpoch}` `` |
| overlap — incoming | `` `${sceneLayerKey(destination)}#${retryEpoch}` `` |

Which epoch a layer carries follows from **which scene it is mounting**, not from which slot it
occupies. That also closes the same defect during `exiting`: a navigation issued while an earlier
retry was still in flight moved the single layer's key underneath the outgoing scene, rebuilding it
mid-exit.

This is a presentation-spine fix with no content, save-format, or gameplay surface. It changes what
the player watches during every scene replacement in the app.

## Consequences

- The battlefield is no longer torn down when a Run leaves it. Victory → Rewards is a single
  crossfade from the played board to the report, which is what the crossfade was always for.
- Every scene replacement gets the same benefit, and every one of them gets cheaper: the outgoing
  scene no longer re-runs its participant registration, image decode, and paint contract purely in
  order to be faded out.
- A retry no longer rebuilds the painted scene standing behind the failure it is retrying.
- `npm run verify:scene-retention -- <url> --click <selector>` is the live gate. It marks the
  committed scene's boundary element and fails if that element is not the one still there when the
  layer becomes `outgoing` — mount identity, not pixels, because a rebuilt scene is what the defect
  *is* and pixels would only say that something flashed. It also fails when a retained layer's
  participants go back to unresolved, which is the same defect wearing its loading card, and when
  the click drove no transition at all, so a rotted selector cannot pass silently.

  ```
  npm run verify:scene-retention -- '<battle-victory-craft-url>' --click '[data-testid="run-battle-rewards"]'
  ```

  The gate is route-agnostic on purpose: any settled screen plus something to press is a valid
  subject, because every replacement shared the bug.
- `SceneState` gains a field. It is director-internal and reaches no persisted document, so no
  RunSaveVersion moves.
