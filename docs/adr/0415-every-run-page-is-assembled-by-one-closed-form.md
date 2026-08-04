---
status: accepted
date: 2026-08-04
deciders: owner (Nelson) + Codex
partially_supersedes:
  - "[ADR-0335](0335-the-strategikon-is-a-run-wide-reference-not-a-battle-only-workspace.md)'s split RunScreen/Skirmish ownership of the Run-wide Strategikon"
refines:
  - "[ADR-0059](0059-reuse-the-canonical-primitive-not-a-bespoke-parallel.md)"
  - "[ADR-0307](0307-every-replaceable-region-is-a-director-owned-scene-slot.md)"
  - "[ADR-0350](0350-run-deployment-promotes-the-mounted-battlefield-in-place.md)"
  - "[ADR-0355](0355-a-rail-of-sections-is-a-registry-entry.md)"
---

# ADR-0415: Every Run page is assembled by one closed form

## Context and Problem Statement

The Run had consistent visual rules but no constructor that made those rules structural.
`RunScreen` assembled its ordinary phases through the persistent Run shell, while Deployment and
Battle took an early return into `Skirmish`. The Strategikon was consequently owned once by
`RunScreen` and again by `Skirmish`, and the Battle-facing props made its Run identity, title,
held lipsana, and reference workspace optional contributions.

That made an invalid page easy to construct. A new retained battlefield could render a complete
Run route without the Run-wide Strategikon because the registry described scene identity and
transition ownership, not the complete page anatomy. Source-presence tests still passed: correct
Strategikon JSX existed in the ordinary-phase branch even though the battlefield branch could
bypass it. The missing boundary was object construction, not another conditional assertion.

## Decision Drivers

- A Run activity must be unable to omit or replace Run-wide structure.
- Deployment and Battle must keep ADR-0350's one mounted battlefield and instance-owned stores.
- Feature code still needs bounded control, viewport, and overlay contributions.
- A repeated form should be cheap to extract and reuse after its second real consumer appears.
- Tests should guard the boundary, not be the mechanism that creates it.

## Decision

- `RunScreen` constructs exactly one branded `RunForm` for the active scene. Every phase enters
  that form through `form.add(runActivity({ ... }))`; Deployment and Battle receive the same form
  and add their retained battlefield activity through `Skirmish`.
- `RunForm` permanently owns the Run's gameplay shell, title contribution, Controls surface,
  Strategikon navigation and workspace, held-lipsanon strip, and workspace swap. A Run activity
  cannot provide or suppress those structural parts.
- `runActivity` is a branded contribution with bounded slots: Controls content, HUD behavior that
  is not Strategikon identity, the primary viewport, persistent viewport content, and overlays
  before or after that viewport. React markup and local styling are allowed inside those slots;
  they are not accepted as replacements for the form itself.
- The brand symbols remain private to the module. `RunForm.add` accepts only a branded
  `RunActivity` at the type boundary and rejects an unbranded value at runtime.
- `Skirmish` has discriminated standalone and Run modes. Run mode requires both `RunForm` and the
  Run battlefield presentation; it cannot be invoked with a loose collection of optional Run
  chrome props. Standalone play retains its own non-Run `SkirmishShell` construction path.
- `SkirmishShell` is structural infrastructure. Only `RunForm` and standalone `Skirmish` may
  import it. Run features cannot import it, mount a parallel shell, portal around the form, or
  directly mount a Run Strategikon.
- The old Run battlefield early return and duplicate Strategikon path are deleted. There is no
  compatibility flag or fallback constructor.
- This is the first concrete closed page form. It remains Run-specific. When a second page family
  repeats the same shape, the common form boundary may be extracted as a shared object without
  changing the contribution model.

## Enforcement

- TypeScript enforces the branded activity and discriminated `Skirmish` props.
- The presentation architecture check rejects a direct `SkirmishShell` import outside its two
  owners, requires the form's structural seats, and rejects `SkirmishShell` or `Strategikon` JSX
  in `RunScreen`.
- Source-structure tests pin the one-form construction and retained-field handoff as secondary
  regression evidence.
- The real application remains the completion gate: ordinary Run phases, Deployment, Battle,
  and the Strategikon routes must be exercised on the named development environment.

## Consequences

- `form.add(thing)` is now the ordinary way to introduce Run work. Omitting the Strategikon is
  not an option on the activity object.
- Editing a feature's controls or viewport remains direct, but changing Run-wide chrome requires
  an explicit change to `RunForm`, making structural deviations visible and reviewable.
- A future repeated composition can be remediated by extracting its activity factory rather than
  rediscovering and replacing many hand-built page trees.
- The retained Deployment/Battle board remains one activity and one store; the form wraps that
  activity instead of rebuilding it.
