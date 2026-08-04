---
status: accepted
date: 2026-07-29
deciders: owner (Nelson) + Codex
supersedes: 0194-admin-playtest-controls-are-a-hidden-settings-destination.md
---

# ADR-0195: Admin playtest controls open in place from the Battle HUD

## Context

ADR-0194 put administrator playtest controls behind a hidden Settings destination.
Live owner review showed that leaving the board screen to arm a board intervention is
not human-oriented: the administrator is looking at the position they want to manipulate
and should not have to navigate away from that context.

The existing Battle HUD already has a Controls panel with scenario actions. It is the
natural place to discover playtest controls while keeping the board mounted and visible.

## Decision

- Every active local Battle shows an **Administration** section at the bottom of the
  existing HUD Controls panel, but only for an authenticated allowlisted administrator.
- **Admin Controls** opens a dedicated in-HUD subview. It is not added to the normal
  five-icon HUD tab strip, so player navigation remains uncluttered.
- The in-HUD subview exposes the complete approved control set: Free Move, Kill Unit,
  Win Battle, Gain Gold, and Gain Lipsanon.
- Free Move and Kill Unit authorize and arm in place, return the HUD to its ordinary Unit
  view, and leave the Battle visible for the administrator's next board click. Win Battle
  resolves against the already-mounted Battle. No route transition is involved.
- The hidden Settings destination remains a secondary way to grant Run state or reach the
  same controls, but it is no longer the primary Battle workflow.
- Backend authorization remains mandatory for every intervention. Live multiplayer remains
  server-sequenced and does not accept client-only board interventions.
- The control semantics and exclusions established by ADR-0194 remain unchanged.

## Consequences

- The administrator can inspect a position, open controls, arm an intervention, and act on
  that exact position without losing spatial context.
- The Battle HUD performs a lightweight administrator access check so the entry never
  appears for ordinary players.
- Settings and Battle presentations share one control implementation and one backend
  authorization path, avoiding parallel cheat behavior.
