---
status: accepted
date: 2026-08-01
deciders: owner (Nelson) + Codex
partially_supersedes:
  - "[ADR-0237](0237-run-destinations-fill-the-shell-workspace.md)'s classification of Deployment as a non-Battle Run workspace"
partially_superseded_by:
  - "[ADR-0348](0348-discipline-resolves-before-automatic-deployment.md)'s Discipline-before-formation projection order"
  - "[ADR-0349](0349-the-final-deployment-choice-commits-and-camera-authority-follows-the-active-scene.md)'s final-choice commit and active-scene camera ownership"
  - "[ADR-0350](0350-run-deployment-promotes-the-mounted-battlefield-in-place.md)'s continuous mounted battlefield lifecycle"
---

# ADR-0346: Run deployment is a battlefield state with conditional input

## Context and Problem Statement

Run Deployment currently replaces the battlefield with a two-column workspace:
form-like choices sit beside the editor's miniature read-only Level preview. In
the ordinary case no choice exists, so the complete screen becomes a repeated
level manifest followed by a second confirmation after the Shop's explicit
Continue action. When Discipline does exist, exact spatial placement is reduced
to a coordinate dropdown away from the battlefield it affects.

The persisted Deployment phase remains necessary: placement choices must save
before Battle activation, and clocks, move input, opponent actions, and arrival
motion must not begin while those choices are incomplete. That domain boundary
does not require a separate visual destination.

## Decision Drivers

- Discipline is an exact spatial choice and should use the board directly.
- The full battlefield, not a miniature manifest, is the primary Run surface.
- A phase with no player choice should not require a redundant confirmation.
- Opponent deployment is not current player information; revealing it first is
  a possible later upgrade, not baseline behavior.
- Deployment must retain durable choices and the director-owned Battle
  activation boundary.
- Controls may change composition by phase while the shared Controls rail stays
  invariant.

## Decision Outcome

Chosen: **Deployment is a conditional battlefield state whose workflow lives in
Controls.**

- Deployment renders the full canonical battlefield in the persistent gameplay
  shell. It does not render `RunWorkspace`, `LevelPreviewColumn`, board facts, or
  duplicate headings over the level.
- The title bar owns orientation: War identity, Ataraxia, Conflict/Battle
  progress, authored Level name, and the Deployment phase. Conflict and Battle
  numbers are never substitutes for the authored Level name.
- Opponent pieces are unresolved and absent during Deployment. Battle
  activation resolves and presents them through the ordinary Battle lifecycle.
  Showing opponent placement before the player's is explicitly deferred as a
  future information upgrade.
- Controls owns the phase-specific workflow. Discipline selects a named unit,
  highlights every legal player-zone square, previews the unit under pointer or
  focus, and commits by clicking the square. The remaining formation is
  provisional and recomputes around every committed exact placement.
- Multiple Disciplined units form a visible placed/remaining sequence. A placed
  unit can be selected again and repositioned before Battle begins. One legal
  square resolves automatically; a unit excluded into reserve requires no
  placement.
- Muster Roll and Surveyor's Compass remain Controls-owned choices and update the
  same battlefield immediately. Controls keeps Army, Relics, and Run abandonment
  available without rebuilding Battle Controls.
- **Begin Battle** appears only when Deployment contains a meaningful player
  choice and enables only when all required choices are complete. If no
  meaningful choice exists, Shop Continue prepares the deterministic formation
  and commits directly to Battle; a resumed no-choice Deployment does the same.
- Reload restores committed deployment choices. Retry preserves the committed
  formation and returns directly to Battle.
- Deployment remains an authored `run-phase` scene. Committing it requests the
  Battle scene; clocks, move input, opponent actions, and arrival motion still
  activate only after the director commits the painted Battle scene.

### Consequences

- Good: placement reads as a game action on the terrain it affects.
- Good: ordinary Runs lose a redundant interstitial and confirmation click.
- Good: opponent information remains a deliberate upgrade surface instead of
  leaking through a setup preview.
- Good: the domain and scene boundaries remain durable even when no Deployment
  screen becomes visible.
- Cost: Deployment needs an interaction adapter over the canonical board
  renderer rather than reusing the generic selected-Level preview.
- Cost: the Controls composition is deliberately different before and during
  Battle, so both states need live responsive verification.

## More Information

- [ADR-0193](0193-runs-are-persistent-wars-around-unchanged-chess-battles.md)
- [ADR-0237](0237-run-destinations-fill-the-shell-workspace.md)
- [ADR-0259](0259-the-live-play-composition-is-the-authority-derived-views-conform.md)
- [ADR-0307](0307-every-replaceable-region-is-a-director-owned-scene-slot.md)
- [UI Kit Standard](../ui-kit-standard.md)
- [Game concept](../game-concept.md)
