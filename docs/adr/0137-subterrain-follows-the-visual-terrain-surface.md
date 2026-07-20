---
status: accepted
date: 2026-07-19
deciders: Nelson, Codex
partially_supersedes: ADR-0105 playable-occupancy face eligibility
---

# ADR-0137: Subterrain follows the visual terrain surface

## Context

ADR-0105 made Subterrain independent explicit art, but its implementation validated anchors only
against playable `cells`. Scenic terrain added by ADR-0126 and ADR-0131 is rendered terrain outside
the gameplay projection. Rejecting Subterrain there conflated visual terrain existence with
playability and silently removed an owner authoring capability.

## Decision

Any active visual terrain coordinate may own explicitly authored Subterrain on an exposed south or
east face. The visual terrain surface is the union of playable cells, the active Scenic terrain
rectangle, and the sparse decorative footprint. Playability never determines eligibility.

Editor painting, persistence cleanup, browser rendering, and thumbnail rendering use this visual
surface rule. Occupancy continues to determine whether a face is exposed; it never chooses a
material. Subterrain remains visual-only and has no gameplay effect.

## Consequences

Authors can place Subterrain around scenic compositions and sparse visual terrain. Shrinking or
removing the active scenic surface removes placements that no longer have a visual anchor at the
persistence boundary, while retained hidden decorative material does not keep faces active.
