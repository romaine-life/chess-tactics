---
status: accepted
date: 2026-08-05
deciders: owner (Nelson) + Codex
partially_superseded_by:
  - "[ADR-0482](0482-expunctio-owns-card-aware-alienatio.md)'s removal of Alienatio from the separate Sectio-workspace inventory"
partially_supersedes:
  - "[ADR-0205](0205-navigation-loads-atomic-scenes-through-one-director.md)'s universal fade-to-background sequence"
  - "[ADR-0307](0307-every-replaceable-region-is-a-director-owned-scene-slot.md)'s treatment of every slot change as one visual class"
  - "[ADR-0355](0355-a-rail-of-sections-is-a-registry-entry.md)'s state-driven Run overlap clause"
  - "[ADR-0454](0454-run-phases-retire-before-their-successors-reveal.md)'s same-phase workspace crossfade clause"
refines:
  - "[ADR-0206](0206-scenes-declare-persistent-visual-hosts.md)"
  - "[ADR-0207](0207-persistent-scene-hosts-form-a-nested-path.md)"
  - "[ADR-0461](0461-aftermath-crossfades-directly-without-a-homepage-floor.md)"
---

# ADR-0462: Transition choreography is derived from scene ownership

## Context

The scene director used ancestry as choreography. A destination with no shared host overlapped
the outgoing scene and crossfaded directly, while a destination under a shared host faded its
region out, replaced it, and faded the successor in. Run state changes were then exempted from
that rule: every Run phase and workspace change overlapped two complete Run layers, with a second
scope mechanism to fade only the viewport when the phase stayed the same.

Those mechanisms confused two visually different relationships. Victory and its aftermath report
are complete scenes; showing a background between them is an unrelated fallback. Sectio and its
Alienatio, Expunctio, Army, and preview workspaces are selections inside one stable scene; passing
through Sectio's own deselected state is existing, meaningful interface language. Whether state or
an address requested the destination does not decide which relationship it has.

## Decision

- The scene graph derives one semantic relationship for every changed authored destination:
  `scene-replacement` or `selection-change`. This relationship is presentation ownership, not an
  animation mode that a feature, button, or route may choose.
- A `scene-replacement` changes the owner of the complete composition. The outgoing scene remains
  its exact painted snapshot while the incoming scene prepares hidden and inert. Once prepared,
  outgoing and incoming scenes crossfade directly over the same interval. No background-only,
  loading-only, Main Menu, or generic fallback frame may separate them.
- A `selection-change` changes one authored region under the same scene owner. The owner and all
  chrome outside that region remain painted and active. The selected region may fade to the
  owner's real neutral/deselected state, prepare its successor, and then fade that successor in.
  That midpoint belongs to the same scene; it may not expose another scene or a universal floor.
- Run phase identity owns a complete scene. Ordinary Run workspaces—including Sectio operations,
  Army/unit selection, Lipsana, Bona targeting, Battle inspection, and opening Strategikon—are
  selections inside that phase. The aftermath `battle-review` workspace is an explicit exception
  in identity because it restores the complete won Battle scene, so report/review remains a scene
  replacement in both directions.
- The gameplay viewport is a named selection region distinct from the Run's outer scene target.
  Its deselection cannot fade the Controls panel, title bar, lipsanon rail, or other retained scene
  chrome.
- Cold startup has no outgoing owner and retains its ordered reveal. Replacing a populated
  selection with an intentionally empty slot may end after deselection. Immediate local state
  changes remain outside the scene lifecycle.

## Enforcement

- `sceneTransitionRelationship` is the single graph-level classifier consumed by the director.
  Application features receive no transition-kind or animation-mode prop.
- Every registered rail pair must classify as `selection-change` in its declared retained region.
  Run tests cover every workspace pair, phase-owner changes, and the aftermath review boundary.
- Complete replacements render two director-owned scene boundaries; selections render one retained
  owner and activate only the declared region. Obsolete Run overlap-scope attributes and CSS are
  removed rather than retained as a second path.
- Live transition gates must assert that replacements contain overlapping outgoing/incoming frames
  with no transparent or non-owned fallback frame, while selections enter an observable deselected
  midpoint without changing the opacity of retained chrome.

## Consequences

- Scene changes and selection changes now have different, legible visual grammar derived from the
  same authored graph.
- A new rail automatically receives selection behavior; a new scene owner automatically receives
  direct crossfade behavior. Neither can silently opt into the other with feature-local CSS.
- Run workspace transitions no longer need two complete scene trees or viewport-scoped overlap
  CSS, and they retain one mounted phase owner across deselection and selection.
