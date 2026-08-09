---
status: accepted
date: 2026-08-06
deciders: owner (Nelson) + Codex
refines:
  - "[ADR-0057](0057-studio-tuning-surfaces-reset-to-authoritative-baseline.md)"
  - "[ADR-0058](0058-every-route-is-click-reachable.md)"
  - "[ADR-0071](0071-the-deliverable-is-the-instrument.md)"
  - "[ADR-0506](0506-card-gold-groups-use-the-open-rail-divider.md)"
---

# ADR-0507: Card gold-divider fitting is a Studio Viewer

## Context

After selecting the generated open-rail divider, the owner wanted to hand-tune the live coin's
fit inside its cradle. The first implementation exposed a query-gated strip on the player-facing
Cards page. That strip mixed authoring controls into the product surface, remounted through route
navigation while it was being operated, and did not provide the durable owner instrument required
by the Studio contracts.

## Decision

- Card gold-divider fitting lives in the existing Studio as the click-reachable **Card Gold
  Divider** Catalog category and typed `carddivider` Viewer kind. The Cards and Chartulary product
  surfaces contain no tuning query, debug strip, or authoring controls.
- The Viewer uses Studio's stable main-stage plus right `tileset-view-controls` shell. Its stage
  renders the real shared `RunCardGoldTierDivider` at multiple canonical row widths and renders a
  four-times magnified crop of that same component for cradle inspection. It may not substitute a
  second illustrative or approximate renderer.
- Coin size and X/Y placement use the shared `SliderRow` controls. Each control and Reset all read
  their baseline from `runCardGoldTierDividerGeometry.json`, the same Git-owned geometry imported
  by the runtime primitive. A device-local draft may preserve unsaved work, but it is not a runtime
  default.
- **Save runtime defaults** writes only that fixed deterministic geometry file through a named-dev,
  loopback-only, administrator-gated backend operation. The client supplies values, never a path;
  the backend validates bounded integers and replaces the fixed file atomically. This operation
  changes no database history, live-media bytes, candidates, or accepted pointers.
- After Save, the confirmed values become the Viewer's reset baseline immediately, while Vite's
  normal module refresh updates the two runtime consumers from the same file.

## Consequences

- The owner can compare the gap and filled treatments, nudge exact pixels, reload without losing an
  unsaved draft, and promote the chosen geometry without asking an agent to translate screenshots.
- Product routes remain clean and stable; authoring affordances are discoverable in Studio rather
  than hidden behind a query parameter.
- Runtime and instrument cannot silently disagree about defaults because both consume one small,
  reviewable geometry record.
