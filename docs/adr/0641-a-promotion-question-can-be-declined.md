---
status: accepted
date: 2026-08-14
deciders: owner (Nelson) + Claude
refines:
  - "[ADR-0559](0559-a-promotion-asks-as-the-move-is-played-not-as-it-lands.md)"
  - "[ADR-0541](0541-a-promotion-premove-is-asked-what-it-becomes-as-it-is-queued.md)"
  - "[ADR-0504](0504-promotion-choices-stay-with-the-arrived-pawn.md)"
---

# ADR-0641: A promotion question can be declined — the picker carries an Undo

## Context

The promotion picker asked four questions and accepted only four answers. Queen, Rook, Bishop,
Knight — and no way out. A Pawn played onto a promotion cell, or premoved onto one, opened a
blocking callout the player could only answer.

That is the one gesture on the board with no take-back, and it stands out because everything
around it has one. A queued premove chain is dropped with Escape or a right click
([ADR-0550](0550-a-right-click-that-never-panned-takes-the-premove-chain-back.md)); a selected piece is deselected
by clicking it again; a played move in a Run is rewound by the paid Undo
([ADR-0556](0556-undo-walks-a-battle-back-a-decision-at-a-time.md)). The promotion picker
alone said: you have started this, now finish it.

What makes it a defect rather than a strictness is WHEN the question is asked. Since
[ADR-0559](0559-a-promotion-asks-as-the-move-is-played-not-as-it-lands.md) the question opens in
the same frame the move is authored, ahead of the landing — and canonical `GameState` deliberately
stays at the pre-move position until the answer arrives. So at the moment the player is trapped,
**nothing has happened**: no `applyMove`, no turn handoff, no clock bank, no Run gold, no relayed
intent. The interface was refusing to give back something it had not taken.

The mis-click case is the ordinary one. A drag that lands one square off, onto a promotion cell,
is a whole move the player never meant to make — and the only way out was to promote anyway and
then either pay the Run's Undo or play on a move down.

## Decision

**The promotion picker carries an Undo, and pressing it withdraws the move that raised the
question.**

It is a text button standing under the four swatches, not a fifth swatch: the swatches answer
*what the Pawn becomes*, and this answers *not this move*. Its tip names what it takes back and
states that it costs nothing, so it cannot be read as the Run's paid Undo.

`undoPromotionMove` withdraws an INTENT. It is not `undoLastPlayerMove`, and the distinction is
the whole reason it can exist for free:

| | `undoPromotionMove` | `undoLastPlayerMove` (ADR-0556) |
|---|---|---|
| What it takes back | a move that was never applied | a move that was played |
| Price | nothing | 10 gold tenths |
| Where it works | any Battle, including netplay | a Run Battle only |
| Score sheet / clock | untouched — neither ever moved | truncated / restored |

Per mode:

- **`move`** — the projected arrival is dropped and the Pawn is back on its own square, still
  selected, with the turn and the clock still the player's. The premove chain does not come back:
  staging a manual promotion already dropped it, because a deliberate move takes the wheel.
- **`premove`** — the drained step is withdrawn, and the rest of the chain with it. That step was
  the head; everything behind it was planned from a move that is no longer being played.
- **`premove-queue`** — only the step the question was asked for is dropped, and the rest of the
  plan survives. This is deliberately narrower than Escape, which drops the whole chain
  ([ADR-0541](0541-a-promotion-premove-is-asked-what-it-becomes-as-it-is-queued.md)); the player
  asked to take back one step, not to abandon the plan.

A **submitted** netplay promotion is not withdrawable, and does not need to be: the seat submits
one complete `{ destination, promotion }` only WITH the answer, so an unanswered question has
relayed nothing and the picker is already gone once it has. There is no recall path, because there
is nothing in flight. This adds no rollback surface to netplay.

Escape is untouched. It still drops the whole premove chain and the unanswered question with it —
a plan-level gesture, where Undo is a step-level one.

## Consequences

- Good: the one blocking question on the board is answerable OR refusable, like everything else
  the player can start.
- Good: a mis-dropped Pawn costs nothing to take back — in a free skirmish, a Run, or a lobby.
- Good: no new state. The pending promotion was already the only thing standing between the
  gesture and the board, so declining it is a clear, not a rewind.
- Cost: one more control in a callout anchored beside the Pawn, so the box is taller. It stays
  inside the battlefield by the same placement rule
  ([ADR-0570](0570-a-board-anchored-callout-is-placed-in-screen-pixels-and-stays-inside-the-battlefield.md)), which measures the
  box rather than assuming its height.
- No save-shape, `RunSaveVersion`, database-schema or media change.

## Verification

- `store.test.ts` pins the withdrawn played move (Pawn back on its square, turn and selection
  kept, no undo checkpoint, no staged reply, and the square still playable afterwards), the queued
  step dropped while the rest of the chain still fires, the netplay undo relaying nothing, and a
  submitted netplay promotion left alone.
- `PawnPromotionPicker.test.tsx` pins both subjects' Undo copy and the control's unit and material.
- `skirmishChromeHierarchy.test.ts` pins it as a text button on the leaf material rather than a
  fifth swatch.
