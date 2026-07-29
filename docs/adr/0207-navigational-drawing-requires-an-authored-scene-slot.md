---
status: "accepted"
date: 2026-07-29
deciders: Nelson, Codex
refines:
  - ADR-0205
  - ADR-0206
---

# ADR-0207: Navigational drawing requires an authored scene slot

## Context

Play was migrated to authored scenes while Settings still listened directly to
browser navigation, swapped local panel state immediately, and ran an unrelated
component-owned crossfade. This made correctness depend on remembering which
menu happened to have been migrated.

The system needs a classification rule that applies before implementation, not a
screen-by-screen request for loading behavior.

## Decision

Any click or history action that changes the identity of a navigable drawn region
must resolve to an authored `SceneInstance` in a named `SceneSlot`.

- The persistent parent owns navigation controls and the slot.
- The director exclusively owns outgoing exit, pending preparation,
  painted-frame acknowledgement, commit, entrance, cancellation, and failure.
- A child view renders only from the director-mounted `ScenePath`.
- A route-owning component may not subscribe to browser navigation or read
  `window.location` to change visible content.
- Component-local state remains correct for interactions *within* the committed
  scene: toggles, sliders, selections, dialogs, and other changes that do not
  replace a navigable drawn region.

Settings is a nested authored host. Its General, Audio, Gameplay, Creator Tools,
and Audio Tracks views occupy `settings-content`; the Settings rail remains the
persistent `settings-shell` parent.

## Consequences

Adding a navigable menu or sub-menu requires a scene definition and slot rather
than a local route effect or bespoke fade. Play and Settings source guards reject
navigation subscriptions and local visible-selection authorities. Existing
complex workspaces are migrated by authored navigational region; ordinary
in-scene control state does not become a scene.
