---
status: accepted
date: 2026-08-04
deciders: owner (Nelson) + Codex
refines:
  - "[ADR-0205](0205-one-application-scene-director.md)"
  - "[ADR-0307](0307-every-replaceable-region-is-a-director-owned-scene-slot.md)"
  - "[ADR-0415](0415-every-run-page-is-assembled-by-one-closed-form.md)"
  - "[ADR-0419](0419-deployment-draws-a-hidden-card-stack-in-play-order.md)"
---

# ADR-0421: A preparing scene has no permission to perform

## Context

The scene director mounts an incoming scene before reveal so its declared participants, decoded
pixels, layout, and live geometry can become ready without exposing an incomplete frame. React
mounting also runs component layout effects and effects. The presentation system distinguished
**preparing** from **active**, but functional motion could still call the browser animation API
directly from a mount effect and spend its entire duration while the destination remained hidden.

Deployment exposed the contradiction. Its face-down cards correctly measured the persistent
Chartulary mark and the Controls stack, but the incoming overlap mounted during the outgoing exit
was given a caller-supplied `preparing = false`. The framework consequently labelled that hidden
layer current and granted its mount effect functional time. The card transfer and scene entrance
ran on independent clocks; when the battlefield became visible, the deal had already landed. A
component-local activation check would repair that one transfer while leaving every future author
responsible for remembering an architectural rule.

ADR-0307 already requires Battle clocks, input, and unit arrivals to begin only after director
commit. Functional animation needs the same structural authority.

## Decision

- A preparing scene may render, load, decode, and measure. Mount is not permission to start
  functional time, mutate gameplay through a presentation completion, or accept input.
- Every SceneBoundary constructs one **SceneActivity** authority. It remains inactive throughout
  startup, loading, and entrance, and activates only when the director has finished the entrance
  and committed that scene as current.
- SceneBoundary derives `preparing`, `revealing`, and `deactivating` from the director phase and
  the layer's typed role. App code cannot grant an incoming layer current-scene permission with a
  caller-supplied preparation boolean. In particular, an incoming overlap mounted during the
  outgoing exit remains preparing.
- One destination authority survives from preparation through commit, so it releases the exact
  motion it held. A new director generation creates a new authority; an outgoing authority cannot
  be carried into the destination merely because React retains a boundary with the same key.
- Entry choreography registers with `useSceneEnteredAction`. The director invokes the registered
  action after activation and owns its animation, frame, timer, cancellation, deactivation, and
  unmount lifetime. Workflow components do not approximate entrance completion with copied
  durations, timeouts, or local activation conditions.
- Entry motion registers with `useSceneEntryMotion`. It is constructed while the destination is
  preparing and frozen at time zero, so its authored first keyframe owns the element before any
  reveal. Commit releases that same animation. Creating the animation only after commit is
  forbidden because destination layout would be visible for a frame before snapping to its origin.
- Imperative Web Animations require the authority's `SceneMotion` capability. Feature code cannot
  call `Element.animate` directly. If imperative motion is created before activation, the authority
  holds it at its first frame and releases it only after commit.
- SceneBoundary also holds descendant CSS animations and transitions discovered during preparation,
  excluding the director's own transition target and any host the transition explicitly preserves.
  Those motions begin or resume only with the visible committed scene.
- Deactivation cancels entered-action resources and authority-owned motion. Interrupted preparation
  cannot complete a hidden functional boundary; returning to the still-persisted state registers a
  fresh action in its new scene generation.
- A presentation-architecture check rejects production calls to raw `.animate(...)` outside the
  SceneActivity implementation. Runtime tests prove actions remain dormant and motion remains held
  before activation.
- Deployment's deal, card reveal, and discard completion move from mount-driven layout effects to
  entered actions. Sectio's surviving-card FLIP uses the same scene-owned motion capability.

## Consequences

- Incoming scenes remain fully measurable without becoming behaviorally live.
- A functional animation cannot disappear behind the scene fade merely because its component was
  mounted for preparation.
- An entry animation cannot flash at its destination and then snap backward when the scene commits;
  its first frame is already installed throughout preparation and entrance.
- New scene-entry choreography declares what should happen; it does not rediscover when the scene is
  visible or add another delay.
- The Deployment deal starts after the battlefield is visibly committed, so its completion still
  gates the pace controls and persists the same information boundary.

## More Information

- [ADR-0307](0307-every-replaceable-region-is-a-director-owned-scene-slot.md)
- [ADR-0419](0419-deployment-draws-a-hidden-card-stack-in-play-order.md)
- [Shared UI primitive registry](../shared-ui-primitives.md)
