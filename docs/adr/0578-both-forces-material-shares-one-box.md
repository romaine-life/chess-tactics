---
status: "accepted"
date: 2026-08-11
deciders: Nelson, Claude
---

# ADR-0578: Both forces' material shares one box

## Context

A player could not see what either army was still worth. The board shows the pieces, and the
HUD's "Remaining forces" pips show how MANY units each side has, but a count is not a value: a
side down to a Queen and a King has two units and nine points, and the pips read that as the
same as two Pawns.

The game already prices a unit, in exactly one place. `PIECE_VALUE` is Pawn 1, Knight 3, Bishop
3, Rook 5, Queen 9, King 0, and `manubiaeUnitWorth` is what every Run payment reads it through:
an advantageous capture pays per point of margin, and Deditio pays two gold per point of enemy
force left standing at the mate. So the enemy's material is already a live gold forecast in a
Run — the number was being computed and paid on without ever being shown.

The persistent title bar's centre region is where a Battle's live facts already live: the turn
plate, the battle clock, the objective.

This shipped first as a matched **pair** of boxes flanking the clock, chosen to protect a
documented property of that row: the two flank chips share one width, which was described as
putting the clock dead centre of the page over the title bar's nailhead diamond. Nelson rejected
it on sight, and correctly — *"that info needs to be close to one another, you can put them both
in the same box."* Splitting a comparison and then placing the clock between its two halves
makes the reader do the work the readout exists to do.

Rebalancing the flanks around a single box would have cost the objective chip 144px of empty box.
Before paying that, the alignment it was protecting was checked on the running app:
`.app-shell-titlebar-stud` and the retry stud that shares its seat both draw **nothing** on a
Battle route — captured at 4x, the seat is bare bar. The clock was being lined up with an
ornament the player cannot see there.

## Decision

Material is **one box holding both forces**, seated immediately ahead of the battle clock, on
every play surface that mounts a battlefield.

- One box because material is one FACT — who is ahead, and by how much. Nothing may stand
  between the two numbers being compared.
- Inside it, each force is a **live Pawn sprite in that army's own palette** followed by its
  points. With both numbers in one frame the marks are the only thing saying which is which, so
  they carry the distinction in real game art rather than in words. A Pawn is the right glyph
  twice over: a Pawn is the 1 the scale is denominated in.
- The gap BETWEEN the two forces is wider than the gap inside each, so the box reads as two
  pairs rather than four loose marks. That grouping is the whole structure the box needs, which
  is why there is no internal rail.
- One box, one frame, one hover/keyboard target that names itself, through `TitleBarStatusTip` —
  the standing rule for what earns a frame in the persistent bar. Its tip states the whole scale,
  derived from `PIECE_VALUE` so the words cannot drift from the arithmetic, and says where the
  reader stands in one sentence.
- The readout is a **pure function** (`battleMaterialReadout`) over the board and the seat this
  client commands, returning both forces with the reader's own first via `clientSideOrder`. A
  lobby guest commanding `enemy` sees their own force in the first seat, not the host's.
- One reader prices both sides: `standingForceValue(pieces, side)`, with
  `standingEnemyForceValue` now that function with the enemy filled in. The number a player
  watches during a Battle is therefore the same number the mate is priced on.
- The box is seated exactly where the clock is seated, and rides in and out with it. A force's
  points exist only while there is a board to count them on, so in the Run's bar it is not among
  the durable measures (Ataraxia, gold, Conflict, Battle) that show in every phase.

What the row keeps, and what it gives up:

- Kept, because it is visible: the status cluster is page-centred as a whole, and the two
  labelled panels (turn plate, objective) still share one width so they read as a mirrored pair.
- Given up, because it was not: the clock is no longer the row's midpoint. It now sits 72px right
  of the stud at 1440 — a stud that draws nothing on this route.

Narrow widths shed material, never something that was in the bar first:

- At ≤1180 the Run's bar tightens the box with the measures beside it — same smaller face, same
  tight gaps — and drops the stable two-digit readout. The between-forces gap stays wider than
  the within-force gap, because that grouping is load-bearing at every size.
- At ≤860 the Run's bar drops the box. This is marginal rather than obvious and was measured: at
  740 the row without material is 332px against a 440px budget and the tightened box is ~90px,
  which fits by about 14px — the entire margin, gone as soon as both forces read two digits. The
  shed buys certainty instead of a Run measure sliding under the control lane on a board nobody
  thought to test. The Skirmish bar's whole status row is already gone at that width, its summary
  moved into Controls, so both bars give the same answer.

## Consequences

- Material can never disagree with what a mate pays, because both read `standingForceValue`.
- The row's shared-flank-width rule now buys a mirrored pair of copy panels rather than a centred
  clock, and its comment says so — including the measurement that retired the old claim, so the
  next reader does not restore it on the strength of a stale sentence.
- Below 860 a Run shows no material in the title bar. If that becomes a real complaint, the fix
  is a home for it in the HUD beside "Remaining forces" — which already presents both sides —
  not a wider box in a bar that was full at five.
- The readout being pure is what makes it testable: the component reads the mounted session
  store, and under `renderToStaticMarkup` zustand answers from the store's initial state, so a
  seeded board is invisible to a rendered chip.

## More Information

- Piece values and the shared reader: `packages/board-render/src/run/model.ts`.
- The one control lane and the typed contribution API are untouched: ADR-0104. This is the centre
  status region, which ADR-0104 keeps as a separate owned facility.
- Boxed status tips as one-target frames: ADR-0569, and `TitleBarStatusTip`.
- Deditio, which the enemy number forecasts: ADR-0543.
