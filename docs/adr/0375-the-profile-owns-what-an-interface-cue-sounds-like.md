---
status: accepted
date: 2026-08-03
deciders: owner (Nelson) + Claude
refines:
  - "[ADR-0071](0071-the-deliverable-is-the-instrument.md)"
  - "[ADR-0057](0057-studio-tuning-surfaces-reset-to-authoritative-baseline.md)"
partially_supersedes:
  - "[ADR-0089](0089-sfx-runtime-profile-is-db-authoritative.md)'s enumeration of the profile as terrain assignments and arrival only"
  - "[ADR-0372](0372-a-card-sounds-like-a-card-when-it-is-handled.md)'s committed cue assignment and its asserted Cards/Lipsana asymmetry"
---

# ADR-0375: The profile owns what an interface cue sounds like

## Context

ADR-0089 moved the SFX runtime mix out of TypeScript because "changing a sound assignment
therefore still required a push even though the bytes were already live." It enumerated what the
document owns — sound-set metadata and gains, one assignment per landable terrain, and the arrival
thump — and stopped there. Interface feedback kept naming its recording in the component:
`data-ui-sfx="gold-sell"` on the Shop and sell controls.

ADR-0372 then added two more of them for card handling, and reported the work as done. That is a
direct breach of [ADR-0071](0071-the-deliverable-is-the-instrument.md):

- **Rule 2** — knobs on the surface, *not hardcoded defaults only an agent can change*.
- **Rule 3** — feel routes to the owner; *the agent never bakes a judgment call into code as a
  fait accompli*.
- **Rule 5** — a shortcut is legitimate only when its missing instrument is recorded as debt,
  *never silently as "done."*

Which sound a surface makes is feel. It is decided by ear, in the running app, at the moment the
owner is listening to it — and every committed assignment converts that into a request routed
through an agent. ADR-0372 was written after reading only the clause about the specific artifact;
the governing rule was never opened.

ADR-0372 additionally asserted that Cards being audibly distinct from Lipsana and Units "is the
intended asymmetry, not an inconsistency to be evened out later." The owner never said that. It
was inferred and written into the accepted record, which is the more damaging half of the mistake:
a fabricated preference in the ADRs teaches every later agent a decision that was never made.

## Decision

- **A control declares a cue; the document decides what it sounds like.** `data-ui-sfx` names an
  interface *event* — what kind of thing just happened — and never a recording. A control that
  declares nothing is the `activate` cue.
- The profile gains `interfaceAssignments`, exact-keyed over `INTERFACE_SFX_CUES`
  (`activate`, `card`, `gold`), each naming a declared sound set **or `null` for deliberate
  silence** — the same completeness rule ADR-0089 set for terrain. Silence is an assignment the
  owner makes, not an absent key. Schema version 2.
- **The SFX Studio gains Interface cues rows** beside the terrain rows it already owns: a select
  per cue, a ▶ preview at the assigned set's own gain, and a per-row ↺ back to the live value, per
  [ADR-0057](0057-studio-tuning-surfaces-reset-to-authoritative-baseline.md) rule 4. It is the same
  panel and the same primitives — not a parallel surface (ADR-0059).
- Migration 51 carries today's audible behaviour forward (`activate`→`click`, `card`→
  `card-purchase`, `gold`→`gold-sell`), so the migration itself changes nothing a player hears.
  What changes is who can change it next. A cue whose set is absent migrates to `null` rather than
  to an assignment the validator would refuse.
- **ADR-0372's asserted Cards/Lipsana asymmetry is withdrawn**, not restated here. Whether Lipsana
  and Units should also make a distinct sound is now a question the owner answers in the Studio by
  ear, and no ADR holds a position on it.
- No compatibility path: per `docs/migration-policy.md` a v1 document is unsupported, not adapted.
  An unmigrated database answers `schema_migration_required`, and a profile that fails validation
  is decorative silence and an unavailable editor exactly as ADR-0089 specified.

## Consequences

- The owner can change what any interface event sounds like — including silencing one — in the
  running app, without a commit, a deploy, or an agent.
- The five committed sound-set names are gone from the component tree, and a contract test fails
  if a new one appears. Adding a *cue* is still a code change; choosing its sound is not.
- Migration 51 is applied by the deployed backend on rollout, never by hand from a dev box — the
  schema-migration rule in `CLAUDE.md`. Until it runs, the backend answers
  `503 schema_migration_required` and interface sound is silent: ADR-0089's no-fallback rule
  working, and the expected state of any worktree whose registry is ahead of the database.
- The debt ADR-0372 should have recorded is discharged rather than carried: the instrument exists.
