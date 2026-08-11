---
status: accepted
date: 2026-08-10
deciders: owner (Nelson) + Claude
refines:
  - "[ADR-0377](0377-a-won-battle-is-reported-on-its-own-screen.md)"
  - "[ADR-0452](0452-a-won-run-battle-pauses-on-its-visible-board-before-rewards.md)"
  - "[ADR-0455](0455-aftermath-retains-a-reversible-terminal-board-review.md)"
---

# ADR-0567: The Sectio hands the player back to its Victory

## Context

A won Run Battle reports on its own screen — gold won, turns, time, Deditio, who was wounded — and
Continue banks that gold and opens the Sectio (ADR-0377). Continue was a one-way door. The report
was discarded at the transition, and the player standing in the Sectio pricing a formation card had
no way back to the only screen that says what the fight paid. That is exactly the moment the
question is asked, and the answer had already been thrown away.

ADR-0455 solved the same shape one screen earlier: the report gained **Back** to the exact won
board, and it did so as a *review* — the Run stays durably in `aftermath`, nothing is recomputed,
and the way out returns to the same captured report. It also stated the trap: reversing the
persisted Run into the phase it came from "would be the wrong repair", because it discards captured
values and lets them change on the way back.

Reversing `sectio` into `aftermath` has a sharper version of that problem. Leaving the report
BANKS the reward, DRAWS the Sectio's card offers off a hidden seed-derived pile, and may REVEAL the
After-Hours Key's paid lipsanon. By the time the player wants to look back, they may also have
admitted a card and struck another. A rewind would have to un-bank gold that has been partly spent
and put back cards the player chose to buy — undoing decisions nobody asked to undo.

## Decision

- **A Battle's report outlives its own screen.** `run.aftermath` is retained through the phases
  where that Battle's result is still the subject — `aftermath`, the Conflict's `bona-vacantia`,
  and the `sectio` its gold is spent in — and is retired when the Run leaves for the next Battle's
  Deployment. A retained report may only ever describe the Battle its screen followed; one naming
  another Battle is dropped by the normalizer and refused by the server.
- **The Sectio carries `Back to Victory`,** seated with `Continue to next Battle`, because they are
  the same pair the Victory screen itself offers. It reopens the report as the whole screen, on its
  own artwork, with the title bar reading `Run › Victory`.
- **It is a review and never a rewind.** The Run's gold, Chartulary, offer row, admissions and
  struck card are untouched, and the Sectio STANDS behind the report being read. `leaveAftermath`
  on a report whose Sectio already exists RETURNS to that Sectio rather than re-running the
  transition: the reward is banked once, the pile is drawn from once, and the round trip may be
  made any number of times.
- **The won-board review is retired one screen later.** ADR-0455 retired the terminal-board
  snapshot at the report's Continue; it is now retired when the Sectio is left, so the report
  reached back to still presents its own **Back** to the exact won board. Abandonment and final War
  victory retire it as before.
- **The server's phase-shaped invariants gain exactly one paired exception.** A `sectio` may stand
  in phase `aftermath`, and that reviewed report alone may carry no `battleRuntime` — but only when
  the report and the Sectio name the same Battle. Every other phase still forbids both outright.
- **A crafted Sectio lands holding the Victory it followed.** The crafter closes each
  fast-forwarded Battle and leaves its report rather than fast-forwarding past it, so a `craft=sectio`
  link can be pressed straight through to the report. Accounting is unchanged — nothing was taken,
  so nothing surrendered, and the clock reads the instant it already read; only the turn count is
  dressed, and turns pay nothing (ADR-0539).

## Consequences

- The player can move between the Sectio, its Victory report and the won board that produced it
  without changing a single number, and can do it while deciding what to buy.
- No RunSaveVersion bump, database migration, reward formula or Battle rule change. A document
  written by an older client simply carries no report, and says so with an unpressable control
  rather than by dropping one out of the rail.
- `phase` no longer determines a Run document's sub-state on its own. That is a real loss of
  invariant strength, bounded to one pairing the server checks by identity: the exception is
  `aftermath` + the Sectio for the same Battle, and nothing else.
