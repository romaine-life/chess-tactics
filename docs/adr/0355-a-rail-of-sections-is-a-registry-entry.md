---
status: accepted
date: 2026-08-02
deciders: owner (Nelson) + Claude
partially_superseded_by:
  - "[ADR-0462](0462-transition-choreography-is-derived-from-scene-ownership.md)"
refines:
  - ADR-0207
  - ADR-0307
---

# ADR-0355: A rail of sections is a registry entry, not a hand-written mapping

## Context and Problem Statement

ADR-0207 gave shells a nested host path and ADR-0307 closed the remaining escape
hatches: every replaceable region is a director-owned scene slot, and a source
projects state into scene identity rather than replacing a region itself.

The rule held only where someone remembered to write it down. Whether a
navigation transitions is decided entirely by `sceneManifest`: an id-equal
navigation takes `App`'s same-scene branch, the director never leaves
`is-current`, and the pane swaps with no exit, no entrance, and no fade. Each
family — Settings, the main-menu Enchiridion, the Campaign Editor, the Play
selector — derived that identity in its own `if` branch, with its own copy of the
resolved-section comment, its own one-line slot component, and its own entries in
two parallel maps (`HOST_REGION_BY_DEFINITION`, `DESTINATION_SLOT_BY_REGION`) plus
a third hand-typed slot list in `sceneSlots`. That third list had already drifted:
it was missing `run-detail-content`.

The Strategikon never wrote the mapping at all, and got it wrong in both
directions at once:

- Under `/run`, `runSceneSnapshot` collapsed all eight of its addresses onto the
  single workspace value `'strategikon'`. Every section shared one manifest id and
  one instance chain, so its rail swapped instantly — it had never transitioned.
- Under `/play`, it keyed on the raw pathname, so sections *were* distinct scenes,
  but the retained region resolved to `gameplay-shell` whose target wrapped the
  Strategikon's own rail. The whole panel faded, rail included.

Meanwhile the component parsed its own addresses through two private helpers, one
of which (`endsWith`) disagreed with the canonical `enchiridionRoute` parser. The
section the screen branched on was invisible to the scene graph.

The guards could not catch this. They are source-level `expect(...).toContain(...)`
assertions, which can confirm a family pasted the pattern but cannot notice a
family that never wrote it.

## Decision Drivers

- One visual pattern must have one implementation, not one per screen.
- The retained/replaced boundary must be structural, not a convention each screen
  re-establishes by placing its rail outside its slot and hoping.
- A guard must fail for a rail nobody has thought of yet.
- Address grammar genuinely differs between families (path segments, query
  parameters, opaque ids) and must stay per-family.

## Decision Outcome

Chosen: **every rail of sections inside a retained shell is an entry in
`sectionedShells.ts`**, which derives scene identity, the authored instance chain,
the retained region, and the content slot from one declaration.

- An entry declares its shell definition, region, content slot, ordered sections,
  manifest fields, identity prefix, and two grammar hooks (`resolve`,
  `sectionPath`). Grammar stays in each family's route module; the registry is the
  only consumer that turns it into scene identity.
- A section whose definition is another entry's shell continues the walk. That is
  how the main menu reaches Settings' sections and how the Strategikon reaches its
  Enchiridion reference sections, so nesting needs no per-level code.
- `HOST_REGION_BY_DEFINITION`, `DESTINATION_SLOT_BY_REGION`, and the slot
  projection are generated from the entries. A new rail cannot land in one map and
  be forgotten in another.
- Scene types and definitions move to `sceneGraph.ts` so the registry can declare
  scenes without importing the resolver that consumes it. `sceneManifest`
  re-exports them; what remains in it are the standalone screens and the two
  gameplay roots.

### The Strategikon

It becomes one entry mounted under two ancestries — Battle's `gameplay` root and
the Run's `run/workspace` slot — with a nested entry for its Enchiridion reference
rail. Its section rail is retained outside `strategikon-content`; the reference
rail sits inside that slot (it belongs to the Enchiridion section and leaves with
it) but outside `strategikon-reference-content`, so paging through records keeps
both rails anchored. Both hosts now behave identically, and identically to
Settings.

Two consequences follow from mounting over a live Battle:

- The Strategikon's slots are identity-only for `sceneLayerKey`, alongside the
  Play run-detail slot. Re-keying the layer would unmount the board behind the
  workspace.
- `overlapsStateDrivenRunScene` narrows to the Run's own state identity (root,
  phase, workspace). A phase or workspace change still overlaps as two complete
  layers with a viewport-scoped crossfade; a change *beneath* the workspace is
  address-driven inside one committed workspace and takes the ordinary
  region-preserving path.

A rail is chrome, not body content: inside the pane it steps back out of the
shell's body inset so it docks to the workspace edge exactly as it did when it was
a workspace column. That one lane is the whole exemption; the shell keeps owning
the body perimeter for the record pane and for sections with no rail (ADR-0297).

### Enforcement

`sectionedShells.test.ts` walks the registry. For every entry it requires an
address per section, then asserts for every ordered pair that the two scenes have
distinct identities, that `deepestSharedSceneRegion` is the entry's region, and
that the first divergence in the instance chain sits in the entry's content slot.
Adding a section without an address fails the coverage check.

`scripts/check-strategikon-transition.mjs` (`npm run verify:strategikon`) drives
the real rails on the real route and fails unless each click runs exactly one
`exiting -> loading -> entering -> current` cycle, marks only the rail's own region
active, and leaves the Battle board mounted.

## Consequences

- Good: a rail added later fails closed. The structural guard covers families that
  do not exist yet, which no `toContain` can.
- Good: one statement of the resolved-section rule instead of four, and the region
  and slot maps cannot disagree.
- Good: the Strategikon behaves the same on both hosts, and like every other rail.
- Cost: nesting is expressed through the registry's walk rather than read straight
  off a branch, so following one address means reading an entry and its grammar
  hook rather than a single `if`.
- Cost: an entry must supply manifest fields even when it inherits most of them
  from the family it nests inside.

## More Information

- Extends [ADR-0207](0207-persistent-scene-hosts-form-a-nested-path.md) and
  [ADR-0307](0307-every-replaceable-region-is-a-director-owned-scene-slot.md).
- Applies [ADR-0059](0059-reuse-the-canonical-primitive-not-a-bespoke-parallel.md) to the route-to-scene
  mapping, which was the last part of this pattern still copied per screen.
