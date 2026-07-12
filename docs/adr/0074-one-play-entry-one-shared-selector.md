---
status: accepted
date: 2026-07-10
deciders: owner (Nelson) + Codex
---

# ADR-0074: One Play entry opens one shared selector

## Context

The main menu exposed Campaign and Solo Skirmish as separate top-level buttons. Each
opened a settings-twin destination with its own second-column navigator even though
both read the same campaign/level store and led to the same live board. The duplicated
entry points consumed menu space and made the two selectors drift as parallel screens.

Exact `/play` is already the heavy live-board route under ADR-0049, so a selector must
not take that address. Campaign and Solo Skirmish also remain distinct gameplay concepts
under `game-concept.md`; this decision consolidates their navigation and does not merge
their gameplay rules or progress. Implementing the shared selector also exposed the
client-created `Classic Skirmish` Level as a shadow content source forbidden by ADR-0070.
Retiring that fallback is an explicit compliance consequence below, not a redefinition of
Skirmish gameplay.

## Decision

The main-menu rail has one **Play** entry, followed by Editor, Lobbies, and Settings.
Play opens one light-art selector in the persistent menu shell:

- `/play/select/skirmish`
- `/play/select/levels`
- `/play/select/campaign/<campaignId>`

Exact `/play?...` remains the live board. The old player-facing selector addresses
`/skirmish`, `/campaign`, and `/campaign/<id>` and their separate
`SkirmishMapPicker.tsx` / `Campaign.tsx`
implementations are retired, not retained as aliases.
Bare `/play/select`, malformed selector paths, and campaign ids that are absent after both
content sources finish loading canonicalize to `/play/select/skirmish`; the address bar
must not retain a selector state that the Play rail cannot produce.

The selector's second column has two pinned entries at the top, **Skirmish** and
**Levels**, and one unbounded **Campaign** collection below in the canonical `KitScroll`.
Campaigns retain official/user grouping. The selected item drives the existing action
column; a selected campaign level may add the shared `LevelPreviewColumn`. Stone
continuity indices are data-owned and continuous: Skirmish `0`, Levels `1`, campaigns
`2+`, with headings consuming no index.

One `PlayMenu` owns hydration for all three sections. It tracks official and private
workspace availability independently, so an unavailable source is never presented as an
honestly empty collection. Playing stays anonymous: public official campaigns remain the
anonymous source under ADR-0038/0060.

The old client-created `Classic Skirmish` Level and missing-level procedural fallback are
removed. A board shown in Play must resolve from the canonical content store or from an
explicit authored board/map/lobby link (ADR-0070). An empty Skirmish section is honest; this
ADR does not silently seed gameplay content. Existing persisted `skirmish-profile-*` levels
continue to appear. The current content system has no owner-operable way to classify and
publish an official profile, so adding explicit profile metadata, authoring controls, and an
admin publish is a separate content decision rather than hidden inside this navigation work.

## Consequences

- The main menu uses less space and every play selection shares one stable column layout.
- Campaign progress/unlocks and Skirmish one-off behavior remain separate beneath Play.
- Back/forward and deep links reach only states the selector's buttons can produce.
- The settings-twin placement remains governed solely by the shared shell (ADR-0062); this
  decision adds internal flow, not a Play-specific offset.
- Publishing a public Skirmish profile is a separate content-authoring decision. Until that
  instrument exists and an admin publishes a profile through the canonical API, anonymous
  users can still play public Campaigns and see an honest empty Skirmish state; the retired
  compiled-in profile no longer disguises that content gap.

## Related decisions

Refines ADR-0049 (selector versus live-board routes), ADR-0062/0063 (shared rail placement
and data-indexed stone continuity), and ADR-0065 (the scrolling dynamic-rail precedent).
Instances ADR-0059 (reuse the shared shell), ADR-0060 (anonymous reads), and ADR-0070
(one canonical content system).
