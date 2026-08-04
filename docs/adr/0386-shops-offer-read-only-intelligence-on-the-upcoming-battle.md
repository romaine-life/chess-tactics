---
status: accepted
date: 2026-08-03
deciders: owner (Nelson) + Codex
partially_superseded_by:
  - "[ADR-0390](0390-sectio-is-the-run-disposal-and-acquisition-phase.md)'s replacement of the Shop terminology with Sectio"
partially_supersedes:
  - "[ADR-0230](0230-run-shops-separate-buying-army-inspection-and-selling.md)'s three-destination Shop inventory"
  - "[ADR-0346](0346-run-deployment-is-a-battlefield-state-with-conditional-input.md)'s deferral of pre-Battle opponent information"
refines:
  - "[ADR-0193](0193-runs-are-persistent-wars-around-unchanged-chess-battles.md)"
  - "[ADR-0237](0237-run-destinations-fill-the-shell-workspace.md)"
  - "[ADR-0383](0383-run-viewport-dom-is-a-scene-contribution.md)"
---

# ADR-0386: Shops offer read-only intelligence on the upcoming Battle

## Context

The Shop asks the player to spend a persistent army's limited gold without showing the
Battle those purchases are for. Hiding the upcoming Level does not preserve a meaningful
uncertainty: a player who has reached it before already knows the map and enemy force, while
a first-time player is asked to make the same purchase with less useful information.

ADR-0346 deliberately kept opponents unresolved during the Deployment phase and named
pre-Battle opponent visibility as a possible later information upgrade. The owner now chooses
that upgrade at the Shop, before the player commits to leaving it.

## Decision

- Every opening and post-Battle Shop adds **View Battle** to its Shop views in Controls.
  It opens a distinct, deep-linkable main-pane destination at
  `/run?view=battle-preview`; returning to **Shop** preserves the same visit and offers.
- The destination reads the next Level only from
  `run.war.battles[run.battleIndex].level`. It does not synthesize a preview board, mutate
  the Run, prepare Deployment, resolve a setup event, start a clock, or create a Battle
  session.
- The upcoming Level is shown through the shared canonical read-only board renderer and
  `ViewPane` camera framing. It supports drag-to-pan and wheel-to-zoom and renders the
  authored terrain, scenery, and fixed units. The installed Shop scene is a persistent
  shell-viewport layer outside the director-faded workspace region. It remains mounted and
  fully opaque across Shop, View Battle, and Sell Units transitions so reconnaissance reads
  as another Shop view, not a room change.
- The shared Level information ledger appears beside the map. It reports board facts,
  objective, time control, zones, and force composition. Enemy setup-event rosters count as
  known forces even though their exact dealt squares remain unresolved; the preview explains
  that distinction instead of fabricating placements.
- The persistent Run army is not projected onto the preview. The copy says that it deploys
  after leaving the Shop. Authored allied Level units remain visible and remain part of the
  Level ledger.
- Shop Controls remain live in the preview, including Reset Shop, Continue, and Run
  abandonment. **View Battle** is reconnaissance, not a second way to begin the Battle.
- `battle-preview` is a Shop-only workspace identity. The same query in Deployment, Battle,
  Aftermath, Bona Vacantia, Victory, loading, or no-Run state resolves to the primary
  workspace.

## Consequences

- Purchases can be judged against the map and opponent they are meant to answer.
- Repeat players gain no information advantage over first-time players merely from memory.
- Randomized setup placement remains legitimately unresolved while its known roster is no
  longer hidden.
- Deployment still owns formation choices and Battle activation; its retained battlefield
  lifecycle is unchanged.
- The Shop gains a fourth task-oriented destination without growing a second board renderer
  or a shadow Level-data path.
