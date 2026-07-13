---
status: "accepted"
date: 2026-07-12
deciders: Nelson, Codex
partially_supersedes:
  - ADR-0082
  - ADR-0083
  - ADR-0084
---

# ADR-0092: Structural dividers inherit their host chrome role

## Context and Problem Statement

Chrome Lab could tune outer and inner box chrome, but its structural-divider
model was outer-only. One global divider record always derived its rail,
thickness, fit, and reach from the outer role. The Inner Box audit specimen could
change width and height but could not add dividers or tune their junction atoms.

That makes a common inner structure impossible to author honestly: one framed
box split into repeated rows. The Level Editor layer dropdown exposed the gap. It
had to render every option as another complete inner frame because the containing
inner box had no structural-divider capability.

The existing ADR-0063 bar primitive already supports an arbitrary number of
runtime dividers. The missing decision is ownership: which chrome role supplies
the divider rail and which tuning record supplies its visible band and joints.

The audit also found that Chrome Lab's **Save defaults** action posted to an
unimplemented development endpoint. The preview and local draft therefore
worked, but approved numeric geometry could not propagate to the committed
runtime defaults. An owner-operated instrument whose Save action is inert does
not satisfy ADR-0071.

## Decision Drivers

- Keep exactly two box roles, `outer` and `inner`; a divider must not become a
  third box role.
- Reuse ADR-0063's one structural bar primitive and arbitrary-N composition.
- A divider must match the rail of the box it visibly joins.
- Outer and inner divider geometry must be independently tunable.
- Every authored control must name a visible decision.
- Chrome Lab Save must durably write validated code-owned geometry while never
  writing media or changing live-media promotion state.

## Decision Outcome

Chosen: **a structural divider inherits the chrome role of its host box**.

- An outer divider derives rail art, rendered thickness, fit, and reach from the
  outer host.
- An inner divider derives those same properties from the inner host.
- A divider remains a child bar primitive, rendered once per separation point;
  it is not a box and does not add another role.
- The shared DOM contract is a role-bearing `ChromeDivider` component. Box
  components and consumers compose any number of those children instead of
  reproducing divider markup or CSS locally.

Divider authored geometry is role-keyed as `dividers.outer` and
`dividers.inner`. Each record owns the visible junction source selection,
orientation, rendered size, alignment, per-end offsets, and **band height**.
Band height is explicit because it is the visible amount of layout occupied by
the bar and its joint lane; the former global `34px` constant cannot describe a
compact inner list.

The rail is never divider-owned state. The renderer derives it from the selected
host role, and a consumer cannot substitute another rail source, thickness, or
fit. The divider's reach is the real distance from that host's content boundary
back to its rail.

The installed joint material remains the one canonical live-media slot
`ui/chrome/divider/joint.png`. Outer and inner have independent geometry and may
audition candidates independently in Chrome Lab, but saving installed defaults
normalizes both non-`none` source selections to that one slot. A separate inner
joint material would require a new canonical slot and a later explicit decision;
this ADR does not manufacture one or promote a candidate.

Chrome Lab storage and committed defaults move from the singular v3 `divider`
record to v4 `dividers: { outer, inner }`. The old singular value migrates to the
outer record; inner starts from its committed compact default. Both the Outer Box
and Inner Box editors expose the same Divider controls, and both audit specimens
can add zero through N dividers.

Chrome Lab's development Save boundary is part of the instrument. It accepts
only a strictly validated v4 numeric-tuning payload, writes
`config/chrome-lab-defaults.json` atomically, rejects candidate identifiers and
obsolete frame geometry, and cannot write media or alter promotion authority.

The first live inner consumer is the shared HouseSelect menu. Its options become
contained rows inside one framed inner box with N-1 role-owned dividers, instead
of N separately framed boxes. Keyboard, click, listbox, and scrolling semantics
remain unchanged.

This partially supersedes only the outer-only divider ownership clauses in
ADR-0082, ADR-0083, and ADR-0084. Their two-role box model, derived frame
geometry, native-size rail rules, and live-catalog ownership remain in force.

## Consequences

- Good: the owner can create and tune divided inner boxes in Chrome Lab and save
  that geometry to the runtime defaults.
- Good: outer and inner divider rails match their hosts by construction.
- Good: repeated menus can read as one cohesive framed object instead of a stack
  of independently cornered boxes.
- Good: arbitrary divider count remains runtime composition, not a baked frame
  variant.
- Cost: Chrome Lab state and config require a v4 migration and two divider
  renders instead of one.
- Constraint: installed outer and inner divider joints share one canonical media
  slot until a later decision adds a separately governed inner joint material.

## More Information

- Extends [ADR-0063](0063-section-dividers-are-a-1d-bar-primitive-teeing-into-the-rail.md).
- Partially supersedes divider ownership in
  [ADR-0082](0082-control-panel-chrome-has-outer-and-inner-roles.md),
  [ADR-0083](0083-chrome-frame-geometry-is-derived-not-authored-state.md), and
  [ADR-0084](0084-accepted-chrome-rails-are-native-size-directional-families.md).
- Upholds [ADR-0071](0071-the-deliverable-is-the-instrument.md),
  [ADR-0059](0059-reuse-the-canonical-primitive-not-a-bespoke-parallel.md), and
  [ADR-0088](0088-chrome-candidates-and-installed-roles-are-live-catalog-owned.md).
