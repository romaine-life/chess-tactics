---
status: accepted
date: 2026-08-02
deciders: owner (Nelson) + Claude
partially_supersedes:
  - "[ADR-0294](0294-play-defaults-to-a-multi-mode-continue-surface.md)'s fixed four-mode inventory and its fourth-column detail"
refines:
  - "[ADR-0074](0074-one-play-entry-one-shared-selector.md)"
  - "[ADR-0334](0334-current-run-stays-visible-disabled-without-an-active-run.md)"
---

# ADR-0356: Continue resumes in place instead of re-listing the rail

## Context and Problem Statement

ADR-0294 made Continue the Play selector's default landing and gave its action
column a fixed inventory: Campaign, Skirmish, Run, and Levels, each naming its
resumable activity or saying **Nothing to continue**. Selecting the most recent
available one filled a fourth column with the activity's facts and the single
**Play** action.

On the live surface that inventory is a copy of the column immediately to its
left. The Play rail already offers Campaign, Skirmish, Run, and Levels as
permanent destinations, so Continue's list repeats those four names one column
over and spends its whole column doing it. It is also mostly dead: the app can
hold one active Run and one persisted board at a time, so at most two rows can
ever be available and the rest state *Nothing to continue* in a surface whose
entire subject is the thing there is to continue. The one piece of information
Continue actually owes the player — what they were last doing, and a way back
into it — was pushed into a fourth column behind a click on a list of mostly
disabled rows.

## Decision

- Continue's action column **is** the resume surface. The most recently updated
  resumable activity is presented directly in it: the activity title, its
  identifying facts, and one **Play** action. Continue mounts no fourth column.
- The inventory carries only genuinely resumable activities, ordered most
  recently updated first. A mode with nothing to resume contributes no row: the
  rail one column left is where those modes are offered.
- A second resumable activity is listed below the resume card under **Also
  unfinished**, naming its mode and its activity. Selecting it addresses
  `/play/select/continue/<mode>` and promotes it into the same resume card,
  which moves the previously selected activity into that list.
- With nothing to resume, the column states **Nothing to continue** once and
  names the rail's modes as the way to start something.
- Everything else in ADR-0294 stands: Continue remains the permanent, descriptor
  -free first rail entry; the installed `/play/select` entry still resolves to
  Continue and replace-canonicalizes to the most recent resumable mode after
  content and Run authority settle; activity identity is still derived from the
  Run document, campaign membership, canonical profile levels, and standalone
  boards; and Continue still never enters an activity without the explicit
  **Play** action.
- ADR-0334's visible-but-disabled **Current Run** row is unaffected. Run
  preparation's rows are a fixed choice between resuming and starting, and no
  other surface teaches where the resume point lives; Continue's rows were a
  restatement of the neighbouring rail, which teaches those destinations
  already.

## Consequences

- Continue answers its own question in one column: the player sees what they
  were last doing and presses Play, with no intermediate list.
- Nothing is unreachable. The at-most-one other unfinished activity keeps a row,
  and every mode keeps its ordinary rail destination.
- The Play surface no longer narrows its action column for a Continue detail
  column that no longer exists.
- Continue's empty state is one honest statement instead of four disabled rows.
