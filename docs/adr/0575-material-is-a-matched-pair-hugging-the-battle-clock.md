---
status: "accepted"
date: 2026-08-11
deciders: Nelson, Claude
---

# ADR-0575: Material is a matched pair hugging the battle clock

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
plate, the battle clock, the objective. That row carries a geometric invariant which is easy to
break by accident and was measured on the running app before this change: the two flank chips
share one width (`min-inline-size: 150px`), which puts the CLOCK — the middle chip — dead centre
of the page, directly over the title bar's nailhead diamond. At 1440 the page centre, the row
centre, the clock centre and the stud centre are all 720.

Adding a single combined material box to that row would have shifted the clock off the diamond by
half a box. The Run's bar has already given that invariant up (its identity chip and four
measures are asymmetric by design), but the Skirmish bar has not.

## Decision

Material is **two boxes, one per force, immediately flanking the battle clock** — your force, the
clock, their force — on every play surface that mounts a battlefield.

- A matched pair is what preserves the row's symmetry: the clock stays over the nailhead diamond
  because an equal box was added on each side of it. This is the reason for the pair, not a
  presentational preference, and it is why a single combined box is refused.
- Each box carries a live **Pawn sprite in that army's own palette** and that force's points. The
  sprite says whose force it is without spending width on words, and a Pawn is the correct glyph
  twice over: a Pawn is the 1 the scale is denominated in.
- Each box is one hover/keyboard target that names itself, through `TitleBarStatusTip` — the
  standing rule for what earns a frame in the persistent bar. Its tip states the whole scale,
  derived from `PIECE_VALUE` so the words cannot drift from the arithmetic, and says where the
  reader stands in one sentence from either box.
- The readout is a **pure function** (`battleMaterialReadout`) over the board and the seat this
  client commands. "Your material" means the force the reader is actually playing, so a lobby
  guest commanding `enemy` is not shown the host's force under their own name.
- One reader prices both sides: `standingForceValue(pieces, side)`, with
  `standingEnemyForceValue` now that function with the enemy filled in. The number a player
  watches during a Battle is therefore the same number the mate is priced on.
- The pair is seated exactly where the clock is seated, and rides in and out with it. A force's
  points exist only while there is a board to count them on, so in the Run's bar they are not
  among the durable measures (Ataraxia, gold, Conflict, Battle) that show in every phase.

Narrow widths shed in this order, and the pair is what pays the bill it created:

- At ≤1180 the Run's bar tightens the pair with the measures beside it — same smaller face, same
  tight gap — and drops the stable two-digit readout, which buys nothing in a bar whose clock
  already left the diamond with the identity chip. The Skirmish bar keeps both.
- At ≤860 the Run's bar drops the pair. The clock and the four measures were already AT the
  documented floor for that width before material existed, so nothing that was there first is
  asked to give up a box to make room. The Skirmish bar's whole status row is already gone at
  that width, its summary moved into Controls, so both bars give the same answer: a stacked
  narrow Battle reads its forces off the board and its Controls.

## Consequences

- The clock's position over the nailhead diamond survives the addition, and is now asserted
  against the row's shared-flank-width mechanism rather than resting on a CSS comment.
- Material can never disagree with what a mate pays, because both read `standingForceValue`.
- Adding a further box to the Skirmish status row is a symmetry question, not a free action: an
  odd addition moves the clock off the diamond and has to say why that is acceptable.
- Below 860 a Run shows no material in the title bar. If that becomes a real complaint, the fix
  is a home for it in the HUD beside "Remaining forces" — which already presents both sides —
  not a seventh box in a bar that was full at five.
- The readout being pure is what makes it testable: the component reads the mounted session
  store, and under `renderToStaticMarkup` zustand answers from the store's initial state, so a
  seeded board is invisible to a rendered chip.

## More Information

- Piece values and the shared reader: `packages/board-render/src/run/model.ts`.
- The one control lane and the typed contribution API are untouched: ADR-0104. This is the centre
  status region, which ADR-0104 keeps as a separate owned facility.
- Boxed status tips as one-target frames: ADR-0569, and `TitleBarStatusTip`.
- Deditio, which the enemy number forecasts: ADR-0543.
