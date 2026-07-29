---
status: superseded by ADR-0195
date: 2026-07-29
deciders: owner (Nelson) + Codex
superseded_by: 0195-admin-playtest-controls-open-in-place-from-the-battle-hud.md
---

# ADR-0194: Admin playtest controls are a hidden Settings destination

## Context

Run development needs fast, deliberate state setup without exposing cheat controls to
players or crowding the normal Settings navigation. Existing Restart controls already
own retrying a Battle, while normal Run screens already own deployment, shops, and
progression. The playtest surface should exercise those established lifecycles rather
than duplicate them.

## Decision

- Authenticated allowlisted administrators see one **Admin Controls** entry in Settings.
  It opens `/settings/admin`, a dedicated Settings destination that is not another
  persistent rail tab. The backend's existing `ADMIN_EMAILS` authority must approve
  every intervention before the client applies it; hiding the entry is not authority.
- The initial control set is exactly:
  - **Free Move** — arm one unrestricted move for the side whose turn it is. The chosen
    piece may land on any rendered board square except one occupied by a friendly or
    neutral unit; landing on an enemy captures it through the normal committed-move
    pipeline. The mode clears after that move.
  - **Kill Unit** — arm one board click that kills any living unit. The normal death
    observation and committed-position lifecycle still run, including Run Reservists.
  - **Win Battle** — award the current Battle to the player, count every currently
    living player unit as a survivor, and expose the normal result/progression surface.
  - **Gain Gold** — add an administrator-entered positive amount to the active Run.
  - **Gain Relic** — choose any registry relic not currently held, including a relic
    already seen by a shop, and apply its normal acquisition and immediate effects.
- Free Move and Kill Unit return automatically to the active Battle with their one-shot
  board mode armed. Win Battle returns to the Battle and resolves there so route
  remounting cannot replace the just-completed state.
- Battle controls apply to every local playtest Battle surface, including Run,
  Campaign, authored test play, shared maps, and free Skirmish. They do not create a
  second chess ruleset: unrestricted movement is an explicit administrator
  intervention outside legal-move generation.
- Restart Battle, Open Shop, advance/return progression shortcuts, Remove Relic,
  intervention history, and Undo are excluded. Existing product controls and lifecycle
  paths continue to own those concerns.

## Consequences

- The shared Skirmish store owns one-shot administrator modes so they survive the
  Settings round trip but clear after use, cancellation, or a new Battle.
- Scalar Run interventions use the canonical Run model and persistence store.
- Live multiplayer remains server-sequenced and cannot accept client-only board
  interventions; the controls report that authority boundary rather than desynchronizing
  a match.
