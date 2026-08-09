---
status: accepted
date: 2026-08-01
deciders: owner (Nelson) + Codex
partially_superseded_by:
  - "[ADR-0462](0462-transition-choreography-is-derived-from-scene-ownership.md)"
---

# ADR-0307: Every replaceable region is a director-owned scene slot

## Context and Problem Statement

ADR-0205 through ADR-0214 established one application scene director, authored
scene paths, and director-owned transition lifetimes for navigable drawn-region
replacement. The implementation nevertheless treated browser location as the
only source of scene intent. A persisted state change could replace the same
amount of screen without entering the scene graph.

Run exposed the failure most clearly. **Begin Battle** first committed the Run
document's phase, then `RunScreen` immediately returned an unrelated Battle
tree. Other Run phases and workspaces used `RunWorkspaceStages`, a second local
retention/readiness/timer system. The screen was therefore neither forced to use
the authored transition language nor prevented from inventing bespoke
choreography. Similar local escape hatches remain possible anywhere a component
branches on state instead of projecting that state into the scene graph.

The distinction that matters is not URL-driven versus state-driven. It is
whether a user action replaces a meaningful drawn region.

## Decision Drivers

- One visual operation must have one owner and one lifecycle independent of the
  state source that requested it.
- A caller must not be able to opt out of transition language when it replaces a
  scene slot.
- A caller must not be able to retain, hide, reveal, time, or animate a competing
  outgoing/incoming scene pair.
- The outgoing scene must remain an exact committed snapshot while the pending
  scene prepares.
- Readiness must not independently reveal a scene.
- Battle clocks, input, and arrival motion must begin only after the new scene is
  committed and visible.
- Same-scene interaction and pixel/frame replacement must remain immediate and
  must not be misclassified as scene navigation.

## Decision Outcome

Chosen: **every replaceable region is an authored `PresentationDirector` scene
slot, and every authoritative source projects state into the same scene-request
protocol**.

### Scene requests and sources

- Browser location is one scene source. The active Run document is another.
  Settings sections, editor workspaces, Studio viewers, and future state-driven
  replacements use the same projection rule.
- A source projects a request with a stable authored instance identity and an
  immutable render snapshot. The director, not the source component, compares
  the request with the committed scene path.
- A request whose instance key is unchanged refreshes the live payload without a
  transition. A changed instance key freezes the outgoing payload and creates a
  pending scene in the declared slot.
- A scene key identifies presentation state, not merely a pathname. Persisted
  state capable of changing the drawn region is part of that key.

### Closed slots and lifecycle ownership

- Replaceable regions are rendered only through registered scene definitions and
  slots. Workflow components supply scene content; they do not choose whether a
  transition occurs.
- The director alone owns outgoing retention, pending lifetime, hidden/inert
  state, failure/retry, commit, and reveal.
- Readiness participants report whether their pixels and critical resources have
  painted. They do not control opacity, visibility, inertness, or reveal timing.
- Transition duration is a director implementation detail completed from actual
  animation events with a bounded failure timeout. Workflow code may not copy a
  duration or use a timer to approximate director completion.
- Low-level scene-boundary and transition-target components remain internal to
  the presentation system. Application screens cannot import them.

### Run scene graph

Run is one persistent gameplay shell with these authored nested slots:

```
run
  run-phase: hydrating | no-active | draft | deployment | battle | shop | victory
    run-workspace: primary | army | lipsana | sell | strategikon
```

- The active Run source supplies both phase and workspace identity. The URL may
  encode a Run workspace address, but it does not become a second visible-state
  authority.
- `RunScreen` renders the director's committed snapshot. It does not branch from
  the latest store value to replace a mounted phase.
- `RunWorkspaceStages` and its local fade/readiness state machine are retired.
- Deployment to Battle, Battle to Shop, victory, and Run workspace replacement
  follow the same director lifecycle as route-authored scenes.

### Battle activation

- **Begin Battle** may durably commit domain intent immediately, but that write
  only produces a pending Battle scene request.
- The outgoing Deployment scene remains mounted and inert only when the director
  begins its transition. Battle prepares hidden and inert and reports painted
  readiness through scene participants.
- Board input, battle clock start, and unit-arrival motion are activation effects
  tied to director commit. Preparation cannot start them.
- Preparation failure preserves a coherent outgoing scene and is retried through
  the director. It never reveals a partial Battle surface.
- Battle presentation state is instance-owned. Preparing one Battle must not
  mutate an outgoing or independently mounted Battle through a process-global
  singleton.

### Classification

- Region replacement/director-owned: Run phase changes, Run primary/Army/Lipsana/
  Sell/Strategikon changes, Settings sections, Level Editor workspaces, and
  Studio viewer replacements.
- Same-scene state reset: retrying the current Battle session while its board
  remains installed.
- Immediate local interaction: unit/HUD tabs, selections, toggles, focus, and
  controls that do not replace the authored region.
- Atomic pixel replacement: portrait/image frame changes through `AtomicFrame`.
- Renderer motion: unit movement and other within-board spatial animation.

### Enforcement and migration

- Static checks fail for local entering/departing scene CSS, copied scene fade
  constants, scene-lifetime timers, caller-controlled visibility/inertness, direct
  browser-history listeners outside navigation, production imports of internal
  transition primitives, unregistered replacement slots, and phase branches
  outside their scene registry.
- Runtime tests exercise the full Run transition matrix and assert committed and
  pending identities, exact outgoing retention, pending inertness, absence of a
  blank frame, persistent shell/title ownership, activation only after commit,
  cancellation, and failure/retry.
- Migration deletes competing paths rather than retaining opt-in or compatibility
  APIs. A screen that needs a new kind of replacement adds an authored slot; it
  does not receive a flag that disables the architecture.

### Consequences

- Good: a meaningful surface replacement cannot silently bypass the shared
  transition language because its render boundary is constructed by the scene
  graph.
- Good: URL and persisted-state changes receive identical lifecycle behavior.
- Good: readiness, transition, and domain activation are separately testable
  responsibilities.
- Good: future screens fail closed when no authored scene slot exists.
- Cost: sources must define stable presentation keys and immutable snapshots.
- Cost: stateful presentations such as Battle must be instance-owned instead of
  relying on an application-global session store.

## More Information

- Extends [ADR-0205](0205-navigation-loads-atomic-scenes-through-one-director.md),
  [ADR-0209](0209-routes-request-authored-scene-instances.md),
  [ADR-0211](0211-navigational-drawing-requires-an-authored-scene-slot.md),
  [ADR-0214](0214-the-scene-director-owns-transition-target-lifetime.md), and
  [ADR-0237](0237-run-destinations-fill-the-shell-workspace.md).
- Applies ADR-0059's canonical-primitive rule to presentation replacement and
  uses ADR-0297's closed shell construction as the model for closed scene slots.
