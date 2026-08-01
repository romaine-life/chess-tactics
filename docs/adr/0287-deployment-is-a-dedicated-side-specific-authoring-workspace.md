---
status: accepted
date: 2026-08-01
deciders: owner (Nelson) + Codex
partially_supersedes:
  - "[ADR-0050](0050-game-modes-placement-and-playability.md)"
refines:
  - "[ADR-0144](0144-level-editor-events-use-the-shell-workspace.md)"
  - "[ADR-0193](0193-runs-are-persistent-wars-around-unchanged-chess-battles.md)"
  - "[ADR-0279](0279-main-menu-insets-govern-full-workspace-content.md)"
partially_superseded_by:
  - "[ADR-0288](0288-new-deployment-authoring-uses-one-flexible-zone-per-side.md)"
---

# ADR-0287: Deployment is a dedicated side-specific authoring workspace

## Context

War Battles already consume typed Player Deployment zones implicitly: the active Run
supplies the persistent army, deployment abilities, blocked-unit choices, and seeded
placement. No authored setup event duplicates that runtime-owned roster. Enemy setup,
however, was available only through a generic Spawn event in Other Events, while the
older all-or-nothing random-placement contract prohibited combining a randomized force
with fixed authored pieces. The editor therefore neither explained the existing player
zone consumer nor offered a clear, War-oriented way to randomize only the enemy force.

## Decision

- The Level Editor Events workspace has three peer sections: **Victory Rules**,
  **Deployment**, and **Other Events**. Deployment exclusively authors setup-spawn
  actions; Other Events no longer offers or edits Spawn as a generic event kind.
- Deployment is side-specific. An explicit setup-spawn action randomizes only the side
  named by that action. Fixed painted pieces on either side remain anchored and occupy
  cells before randomized units are dealt. This partially supersedes ADR-0050's newer-
  authoring assumption that random placement must cover both sides and forbid every
  painted unit; its legacy `placement: random` reader retains that historical behavior.
- A randomized side owns one canonical roster and a pool of one or more zone ids. The
  selected zones pool and deduplicate their usable cells. Impassable terrain, blocking
  props, and fixed pieces consume capacity before the roster is placed. The existing
  seeded setup resolver remains the runtime authority.
- In a War Battle, the player card is informational and zone-oriented. It identifies
  the active Run as the roster source and exposes the typed `player-spawn` zones that
  the Run already consumes. It does not create a synthetic player setup event.
- The enemy card combines fixed enemy anchors with an optional randomized roster. A
  zero roster means **No randomized units** and serializes no enemy setup-spawn action.
  This is a valid fixed-only enemy setup.
- An Enemy Deployment zone is optional geometry, not an automatically present object.
  New or fixed-only Battles need none. Enabling a nonzero randomized enemy roster makes
  at least one selected, painted, sufficiently large enemy zone a save requirement.
  The author can create an empty typed `enemy-spawn` zone on demand and paint it in the
  ordinary Zones layer.
- Turning randomized deployment off removes the side's setup-spawn action but preserves
  its typed deployment zones and labels them unused. Deleting or emptying a zone that an
  enabled roster references leaves an editable invalid draft; validation blocks Save
  and explains the missing geometry. Neither action silently destroys the roster or
  unrelated zone work.
- In War Battles, enemy randomized pools may not overlap any typed Run-player
  deployment tile. Capacity and overlap checks use the same fixed-piece, terrain, and
  prop occupancy assumptions as runtime setup.

## Consequences

- Authors can express no randomized enemy units, a completely randomized enemy force,
  or fixed enemy anchors plus randomized reinforcements without configuring the player
  side twice.
- Existing setup-spawn data remains runtime-compatible and is surfaced through the new
  Deployment section. Multiple setup-spawn actions for one side are summarized together
  and consolidated into one canonical event on the next deployment edit.
- Deployment geometry has an independent lifecycle from the event that consumes it, so
  the editor can retain deliberate reusable zones without inventing an always-present
  enemy zone.
- Save remains the correctness boundary: incomplete zones and insufficient capacity are
  editable, visible states rather than destructive auto-repair cases.
