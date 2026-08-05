---
status: superseded by ADR-0452
date: 2026-08-03
deciders: owner (Nelson) + Claude
superseded_by:
  - "[ADR-0452](0452-a-won-run-battle-pauses-on-its-visible-board-before-rewards.md)"
refines:
  - "[ADR-0220](0220-run-victory-gold-scales-with-enemy-force-value.md)"
  - "[ADR-0338](0338-a-run-state-is-handed-over-as-a-link-that-crafts-it.md)"
---

# ADR-0377: A won Battle is reported on its own screen

## Context

A won Run Battle had no ending of its own. The board raised a small result card over the
still-live battlefield — "Victory", the level name, one Continue button — and that button
went straight to the Shop. What the Battle actually paid was then announced by a line at the
top of the Shop:

```
Victory  +  ⬤ 4.5
```

That put the result of the fight in the room where the money is spent, so the reward read as
an opening balance rather than as something won, and the fight itself was reported by a card
that overlaid the very board it had just finished with. Everything else the Battle cost — how
many turns it took, how long it ran, which units fell — was reported nowhere at all, because
nothing kept it: the turn count and the clock live in the board store, which unmounts with the
board, and `RunBattleRuntime` (which knows who fell) was torn down at the moment the Shop
opened.

Games end a fight on a victory screen. The Run already has one, for the whole War.

## Decision

- A won non-final Battle enters a new Run phase, **`aftermath`**, before the Shop. It is a
  phase of its own with its own workspace and its own artwork, not an overlay: the fight is
  finished, so the board behind it is no longer the thing being looked at.
- `closeBattle(run, report)` performs that transition and captures, on `run.aftermath`, what
  nothing else keeps: the gold the Battle awarded (and the part of it a lipsanon added), the turn
  count, the wall-clock elapsed, the surviving unit ids, and the units that fell.
- Wall-clock elapsed is measured from `RunBattleRuntime.startedAtMs`, recorded by `beginBattle`
  and re-recorded by `restartBattle` — a retry is a fresh Battle, not a continuation. Storing
  the start on the document rather than in the board's memory means a reload does not erase it.
- **The reward is reported here and banked on Continue.** `leaveAftermath` opens whatever
  follows the Battle (Bona Vacantia, or the Shop) through the unchanged `openShop` transition.
  What the screen says was won and what the Run then receives are one number read twice.
- The Shop no longer carries a victory-gold line. `RunShopState.victoryGoldTenths` is unchanged
  and still records the reward, per ADR-0220; only its restatement in the Shop's own copy is
  gone.
- **The final Battle has no aftermath screen.** It ends the War, whose victory screen is its
  report, and it grants no spendable reward — so an aftermath there would announce gold that is
  never banked. `closeBattle` hands it straight to `victory`.
- The title bar reads `Run › Victory` for the aftermath and `Run › War Won` for the War's
  victory, so the two endings are never the same word.
- Per ADR-0338 the state is craftable and therefore linkable: `craft=aftermath` stops at the
  report of the Battle it names. A crafted Battle is placed and not played, so `turns`,
  `seconds` and `fallen` write the result it could not produce — the fallen through
  `observeRunUnitDeath`, the clock by backdating the recorded start, so the report is still
  written by the transitions that write a played one.

The screen borrows the War victory workspace's installed background
(`ui/workspaces/run-victory/background.png`) until art of its own is generated. Its layout —
eyebrow, VICTORY, level name, a four-row ledger, Continue — is the first pass and is expected
to move.

## Consequences

- Run format 16, landing on top of ADR-0376's 15. In-progress Runs are unsupported; per the
  repo's standing policy the owner's active Run is disposable test state.
- Anything wanting to report more about a Battle later — material traded, a grade, a longest
  streak — now has a screen to put it on and a document field to carry it, instead of needing
  the board still mounted.
- Two screens now sit between a won Battle and the next one when a Conflict closes: the
  aftermath, then Bona Vacantia, then the Shop. That order is deliberate — the Battle is
  reported, then its lipsanon is chosen, then the money is spent.
- `openShop` accepts both `battle` and `aftermath` as its entry phase. The Battle entry is what
  the final Battle and the crafter's fast-forward use; the aftermath entry is the played path.
