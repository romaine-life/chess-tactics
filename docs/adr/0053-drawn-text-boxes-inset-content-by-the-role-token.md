---
status: "accepted"
date: 2026-07-02
deciders: Nelson, Claude
---

# ADR-0053: Drawn text boxes inset their content by the role token, never flush

## Context and Problem Statement

The level editor's control rail is built from **frameless sections** (`.skirmish-card`,
`padding: 0`) inside the one kit panel frame on `.skirmish-hud` (ADR-0032/0033) — for
those, zero padding is correct: the panel frame owns the outer inset. But some rail
members additionally **draw their own surface** around text (a background fill, border,
or inset line), and each hand-picked its content inset independently:

- `.le-violations` (the "Fix before saving" list) drew a 1px accent outline around a
  zero-padding card — **its text sat flush against the drawn edge** (the owner flagged
  it: "doesn't even fit").
- `.le-status-current` padded 10px, `.le-status-entry` 8px, `.le-board-link-input`
  `0 10px` — three more answers to the same question, two of them off the ADR-0031
  spacing scale.

ADR-0031 already defines the mechanism — `--ds-inset` is *the* padding-inside-a-surface
role token (16px comfortable, 8px on compact in-game surfaces like this rail) and bans
hand-picked px — and ADR-0028 requires symmetric side insets for row content. What was
missing is the binding rule that a **drawn edge always triggers the inset**.

## Decision Outcome

**Any element that paints a visible surface or outline around text content must inset
that content symmetrically with `padding: var(--ds-inset)`. Text never sits flush
against a drawn edge.**

- **Trigger** = a visible painted boundary of any kind: background fill, `border`,
  `outline`, an inset `box-shadow` line, or a kit 9-slice/line frame (ADR-0034).
- **Single-line form controls** (inputs like `.le-board-link-input`): horizontal inset
  `0 var(--ds-inset)`; vertical centering comes from `min-height`, not padding.
- **Frameless sections stay zero-padding** (`.skirmish-card` et al.) — their inset is
  owned by the container that draws the frame. This rule adds no double-padding.
- **Density stays token-driven**: the value comes from the screen's role-token override
  (ADR-0031 compact/comfortable), never per-element px.
- **Exemption — sprite/icon tiles** (`.le-swatch` and kin): their caption geometry
  follows the sprite-grid economy (dense palette grids); they are picture cells, not
  text boxes.

Applied now to the level-editor rail (`.le-violations`, `.le-status-current`,
`.le-status-entry`, `.le-board-link-input`, plus tokenizing the touched gaps); other
screens migrate as they're touched, per the ADR-0024 staged-migration precedent.

## Considered Options

- **Per-element "optical" padding.** Rejected: that is the status quo that produced
  0 / 8px / 10px drift within one rail — the zero-padding case shipped to the owner.
- **Standardize on 10px** (the most common hand-picked value). Rejected: off the
  ADR-0031 scale; raw px on spacing is already banned.
- **Pad every `.skirmish-card`.** Rejected: frameless sections would double-inset
  against the panel frame's own padding and shrink the usable rail width for no
  visible edge.

## Notes

- WHAT may draw a box is governed elsewhere (ADR-0032: visible surfaces are kit chrome;
  ADR-0034: line frames). The rail's raw-CSS boxes (`.le-status-current`,
  `.le-status-entry`, `.le-violations`' outline) predate those and are standing debt —
  re-chroming them to kit line frames is tracked as separate work; this ADR governs only
  the content inset and applies identically before and after that swap.
