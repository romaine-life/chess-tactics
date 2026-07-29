---
status: "accepted"
date: 2026-07-29
deciders: Nelson, Codex
refines:
  - ADR-0205
  - ADR-0207
---

# ADR-0209: Routes request authored scene instances

## Context

The director, manifests, and nested hosts established one transition lifecycle,
but route-owning components could still listen to browser navigation and change
their visible local selection immediately. Play did this: campaign imagery could
appear during the exit phase, before the director presented Loading and before
the destination had acknowledged paint.

A host name and resource manifest describe transition metadata, but do not yet
author the screen hierarchy. Without authored identity and ownership, every new
area can accidentally invent another source of visible truth.

## Decision

Navigable UI is authored as a compositional scene graph.

- `SceneDefinition` declares stable identity, parent, owning slot, and view.
- Route intent resolves to a `ScenePath` of immutable `SceneInstance` objects.
- Each named `SceneSlot` has a committed instance and, during navigation, an
  independently inspectable pending instance.
- `SceneDirector.current` is the committed authored path.
  `SceneDirector.destination` is the pending authored path.
- Browser URLs, history events, links, and buttons may request a destination,
  but cannot directly choose visible scene content.
- A scene view renders from the director-mounted scene path. It may not subscribe
  to navigation events or reread `window.location` to update visible selection.
- Pending content remains unrevealed until the director accepts the current
  generation's complete painted-frame acknowledgement.
- Persistent parents remain mounted by comparing the authored paths; replacement
  occurs at their deepest differing slot.

Scene composition is preferred over an inheritance hierarchy. A scene may own
React components, data/resource preparation, paint participants, children, and
slots without requiring those components to subclass a scene base class.

## Consequences

“Make this area a scene” now has a concrete guarantee: it acquires one identity,
owner, slot, pending/committed lifecycle, cancellation generation, paint gate,
and transition policy. New screens extend the registry and render from the
director rather than adding route-local loading effects.

The first migrated vertical path is Main Menu → Play → Skirmish, Levels, and
Campaign. Other route families remain enrolled through their manifests and are
migrated into authored definitions without creating a parallel transition
authority.
