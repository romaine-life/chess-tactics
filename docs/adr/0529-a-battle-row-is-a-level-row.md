---
status: accepted
date: 2026-08-08
deciders: owner (Nelson) + Claude
refines:
  - "[ADR-0059](0059-reuse-the-canonical-primitive-not-a-bespoke-parallel.md)"
  - "[ADR-0091](0091-unsaved-drafts-belong-to-the-unassigned-editor-collection.md)"
  - "[ADR-0280](0280-campaign-and-war-libraries-are-peer-editor-rail-destinations.md)"
partially_supersedes:
  - "[ADR-0074](0074-one-play-entry-one-shared-selector.md)'s Skirmish profile collection"
  - "[ADR-0514](0514-play-opens-run-without-a-mode-rail.md)'s dormant Skirmish mode entry"
---

# ADR-0529: A Battle row is a level row, and Skirmish profiles are retired

## Context

The Editor rail lists four collections. Campaigns and Unassigned levels drew a
level as a board thumbnail, an ordinal, a name, a goal line, and carved
edit / reorder / delete controls. Wars drew the same thing as a hand-rolled
parallel: a bare ordinal digit, no thumbnail, no way to open the board or remove
the Battle from the row, and typed `↑` / `↓` characters where every sibling
surface draws installed carved chevrons. Judged side by side the War library
looked like a lesser screen, because it was one.

Two content facts moved at the same time. Campaigns are no longer how the game
is played — a Run is — so an ordered Campaign is not the container those levels
belong in. And Skirmish profiles, a level class identified only by a
`skirmish-profile-` id prefix, had a rail tab in the Editor and a tab in Play
that no longer served anything: its Play entry was already dormant under
ADR-0514, and its content was one level.

## Decision

- **One editor level row.** `ui/shared/EditorLevelRow` is the single row for an
  authored level inside any container: thumbnail, ordinal, name, fact line, and
  the capability-scoped verbs. Campaign levels, War Battles, unassigned levels,
  and unsaved drafts all mount it. A container supplies only the verbs it has —
  a War has no campaign ordering, an unassigned level has no position — and the
  row omits the rest rather than each library growing its own.
- **A War Battle is one of those rows.** It gains the board thumbnail, Edit
  board, Delete Battle, and the carved chevrons, keeps its own fact line
  (`Battle` / `Loot Battle` / `Final Battle · War ends here`) ahead of the goal
  line, and disables reorder at the ends instead of hiding it. Its Battle
  thumbnails join the Editor's paint gate through the same `ThumbnailSurface`
  the Campaign library uses, and its preview column carries Edit Board and Test
  Play like every other library.
- **Campaign levels are unassigned.** Both official campaigns were published
  with empty level lists, so all 30 of their levels now live in Unassigned
  levels. No level document was deleted and the War's Battles are untouched.
  The two campaign shells remain as empty containers; the Campaigns collection
  is not itself retired by this decision.
- **Skirmish profiles are retired.** The `skirmish-profile-` level class, the
  Editor's Skirmish profiles collection, the Play Skirmish panel, the
  `/play/select/skirmish` address, and the `skirmish` mode entry are all gone.
  The `mode=skirmish` gameplay address that standalone Levels use is unchanged.
  Existing `skirmish-profile-*` levels are not touched: with nothing filtering
  them out they appear as ordinary unassigned and standalone levels.
- **A retired address lands somewhere real.** `?collection=skirmish-profiles`
  resolves to Campaigns and `/play/select/skirmish` resolves to Run, rather than
  producing a dead panel or a 404.

## Consequences

- The War library is judged on the same row the Campaign library is, and a
  change to that row reaches both.
- The Editor rail carries three workspace collections instead of four, and both
  campaigns read `0 levels` while Unassigned levels holds 34.
- `verify:unit-arrival` can no longer reach a board by clicking a level row in
  Crown of Valoria, because that campaign lists none. Its documented campaign
  invocation moves to the Run continue path. `/play?campaignId=…&levelId=…`
  still loads the level, so `verify:board-selection`, the Strategikon transition
  gate, and board captures keep working unchanged.
- Reintroducing Skirmish profiles would mean reconstructing the level class and
  both surfaces; unlike ADR-0514's dormant modes, this one is not held in
  reserve.
