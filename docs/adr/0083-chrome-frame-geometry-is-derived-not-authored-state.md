---
status: "accepted; outer-only divider clauses superseded by ADR-0092"
date: 2026-07-10
deciders: Nelson, Codex
partially_superseded_by: "[ADR-0092](0092-dividers-inherit-their-host-chrome-role.md)"
---

# ADR-0083: Chrome frame geometry is derived, not authored state

## Context and Problem Statement

Chrome Lab exposed a `frameWidth` value inherited from an implementation detail of
the generated nine-slice canvas. Once exposed as a slider, that single value was
made responsible for several unrelated effects: generated slice size, rendered
border width, rail seating, atom targets, divider height, and content clearance.
Changing it visibly changed the chrome, but there was no coherent visual object
called "frame width" for an art director to tune.

The same model also exposed `railX` and `railY` seats. Those offsets were often
clamped away by the generated slice, so saved values could exist without having a
stable visible meaning. Fill and content boundaries were then derived partly from
that hidden geometry, making one control fight several other controls.

## Decision Drivers

- Every Chrome Lab control must correspond to one visible, inspectable decision.
- Art scale, atom placement, fill placement, and content placement must be
  independently tunable.
- Generated nine-slice canvas dimensions are renderer bookkeeping, not authored
  design state.
- Existing useful tuning must survive migration; obsolete fields must not.
- Live consumers and audit previews must use the same derived geometry.

## Decision Outcome

Chosen: **the chrome family persists visible authored decisions and derives all
frame-canvas geometry from them**.

The authored controls are:

- **Rail:** source, rendered thickness, fit mode, and corner overlap.
- **Atom:** source, rendered size, orientation, alignment mode, anchors/covers,
  and explicit per-side offsets.
- **Fill Box:** four independent edge insets plus fill material, tint, scale, and
  opacity.
- **Contents Box:** one explicit content inset for ordinary panel children.
- **Divider atom:** source, rendered size, alignment, and per-end offsets. Its rail
  always belongs to the outer role.

The renderer derives:

- nine-slice slice size from the rendered rail thickness;
- generated frame-canvas size from two slices plus one normalized rail period;
- CSS border-image width from the rendered rail thickness;
- divider rail art and thickness from the selected outer rail;
- divider reach from the outer Contents Box inset.

`frameWidth`, `railX`, and `railY` are prohibited authored or persisted fields.
There is no independent frame-footprint slider and no invisible rail seat. Source
percentages may be displayed as context, but the authored value is the visible
rendered pixel size.

The Fill Box and Contents Box do not derive from rail thickness or from each
other. The Fill Box places the explicit fill layer. The Contents Box places
ordinary content. Named full-bleed structures such as the title fill and section
divider may bridge those boundaries according to ADR-0082, but they may not
invent a replacement inset.

Validation may bound a field to a supported numeric range. Derived geometry must
not silently clamp or reposition another authored field merely to fit an internal
canvas. If an asset cannot satisfy the selected fit or overlap, that mismatch must
remain visible or be rejected explicitly.

Chrome Lab storage version 3 implements this contract. Version 2 state is read
once, recognized visible fields are retained, and obsolete `frameWidth`, `railX`,
and `railY` values are dropped. New exports contain only the version 3 model.

## Consequences

- Good: each slider now names one visible thing and changing it has one category
  of effect.
- Good: rail art scale can change without moving content or fill boundaries.
- Good: Contents Box and Fill Box remain understandable even when chrome art is
  replaced.
- Good: generated frame geometry can evolve without invalidating saved art
  direction.
- Cost: old v2 exports lose the three obsolete implementation fields on import.
- Cost: consumers that relied on frame width as accidental padding must adopt the
  Contents Box contract explicitly.

## More Information

- Amends [ADR-0081](0081-empty-control-panel-frames-are-overlays-not-layout-borders.md)
  by making Fill Box and Contents Box direct authored boundaries.
- Amends [ADR-0082](0082-control-panel-chrome-has-outer-and-inner-roles.md)
  by defining how each role's geometry is authored and derived.
- The contract is enforced by `frontend/scripts/check-empty-panel-frame-overlay.mjs`
  and `frontend/src/ui/chromeFamilyRuntime.test.ts`.
- Amended by [ADR-0084](0084-accepted-chrome-rails-are-native-size-directional-families.md):
  accepted installed rail art must match the authored thickness at 100% and
  provide native directional sources.
- Outer-only divider derivation is superseded by
  [ADR-0092](0092-dividers-inherit-their-host-chrome-role.md): each divider now
  derives its rail and reach from its own host role.
