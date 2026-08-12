---
status: accepted
date: 2026-08-12
deciders: owner (Nelson) + Claude
refines:
  - "[ADR-0059](0059-reuse-the-canonical-primitive-not-a-bespoke-parallel.md)"
  - "[ADR-0318](0318-plagued-and-pestiferous-use-separate-owner-selected-icons.md)"
  - "[ADR-0552](0552-athetize-is-a-card-struck-through.md)"
---

# ADR-0591: The Event Log replaces its classifying words with marks

## Context

The Battle's Event Log is a score sheet. Its move rows already read fast — a notated `Nxb5+`
says capture, mover, square and check at once, and its side rail says who played it.

Its **prose** rows were sentences. "Check!", "Defeat — your clock ran out." and "Knight's
fork — 5 gold claimed." are three shades of the same muted grey at the same indent, and every
one of them opens by spending its most prominent position on a word whose only job is to
classify the line: *Check*, *Defeat*, *Draw*, *Victory*, *Skirmish begins*.

**A reader takes a glyph faster than a word.** A glyph arrives whole, without being spelled
out, and a column of them can be scanned instead of read. That is the reason, and it is a
reason about the reader rather than about the log.

A first pass got this backwards. It added marks to three lines and kept every word, on the
theory that marking only the interesting rows preserves their contrast. That is a restraint
argument, not a legibility one, and it produces a log the reader must still read in order to
find out which rows are the interesting ones.

## Decision

**A mark REPLACES the words that classified its line.** Not decoration beside prose that still
says the same thing — the classifier moves into the column the move numbers take, and the text
keeps only what the marks cannot say.

The vocabulary is in two halves, and an ending takes one from each: an **outcome** (victory,
defeat, draw) and a **cause** (checkmate, stalemate, resign, clock). Together they finish the
sentence with no words in it at all, and those rows carry an EMPTY text deliberately — an empty
line is the marks doing their whole job, not a hole.

| Line, before | Mark | Line, now |
| --- | --- | --- |
| `Skirmish begins — capture the rival King.` | objective | `Capture the rival King` |
| `Check!` | check | *(nothing — the mark is the line)* |
| `Your King is in check!` | check | `Your King` |
| `Knight's fork — 5 gold claimed.` | gold | `Knight's fork — 5` |
| `Move undone — 10 gold paid.` | gold-loss | `Move undone — 10` |
| `Checkmate — victory!` | victory + checkmate | *(nothing)* |
| `Checkmate — defeat.` | defeat + checkmate | *(nothing)* |
| `Defeat — your clock ran out.` | defeat + clock | *(nothing)* |
| `Defeat — you resigned.` | defeat + resign | *(nothing)* |
| `Victory — your opponent resigned.` | victory + resign | *(nothing)* |
| `Stalemate — the skirmish is a draw.` | draw + stalemate | *(nothing)* |
| `Draw — the same position has occurred three times.` | draw | `The same position, three times` |

- **Every kind of prose line gets a mark**, not just the ones worth stopping on. The two
  exceptions are the lines that classify nothing: a Run change narrating itself ("Roland
  answers the call…") and a browser-storage failure. Those keep their whole sentence.

- **A line may wear two**, because outcome and cause are different facts and one row can hold
  both: a flag fall is a defeat AND it is the clock.

- **A row whose whole meaning is its marks says nothing at all.** Six of the twelve line kinds
  end up with no text: `Check!` is the mark alone, and every standard ending is its outcome and
  its cause. An empty line is a legitimate result here rather than a hole, and the marks'
  `aria-label` is where those words still exist for a screen reader — "Defeat, Out of time".

- **The mark is set WHERE THE LINE IS WRITTEN**, never re-derived by matching the rendered
  prose. `logNote(text, ...marks)` takes them; `adjudicationEntry` and `netOutcomeEntry` decide
  the copy and its mark in one breath, so an outcome cannot be written without being marked as
  one. A regex over the copy would go quietly wrong at exactly the moment the wording improves.

- **`gold` is read off `RunBattleNotice.goldTenths`**, already the field that decides whether
  the board seats a rising marker — and its SIGN picks the coin, because the Run draws gaining
  and losing gold as two different installed marks and which way it went is the thing a reader
  most wants at a glance.

- **Half the vocabulary is borrowed, not forged.** `clock` is the title bar's installed
  hourglass, `objective` is its objective flag, and the two coins are the Run's own
  `RunGoldIcon` / `RunGoldTransactionIcon` — the same components the board's rising marker
  draws. Forging a second hourglass or a second coin for this seat is the bespoke parallel
  [ADR-0059](0059-reuse-the-canonical-primitive-not-a-bespoke-parallel.md) forbids, and it
  would let the log and the screen beside it show two different coins.

- **Seven marks had no existing home** — the three outcomes, the three causes that are not the
  clock, and `check` — and get their own slots in the kit's game-icon family under a new
  `battle-log-mark` runtime component.
  Like the Run-position and action marks they ship **trimmed to their own ink**: the seat is
  18px and draws with `contain`, which scales the canvas, so transparent margin left on a 64×64
  frame would come straight off the drawn glyph.

- **Every forged seat is RESERVED, not fail-closed**
  ([ADR-0318](0318-plagued-and-pestiferous-use-separate-owner-selected-icons.md)): it holds its
  18px box before any art decision exists, so installing one later cannot shift the line beside
  it. The borrowed marks fail closed, because they are already installed chrome.

- **Borrowing a title-bar mark inherits its compensation.** `objective.png` is untrimmed — ink
  fills 73% of its canvas — so the log's flag seat declares the same `--titlebar-mark-ink-fill`
  the title bar does, and **both seats are registered in `verify:icon-seats`**, which reads the
  installed bytes. Two declarations that a gate checks against the art cannot drift; two that
  nothing checks would.

- **The row's second column is 40px, not the 32 a move number needs.** Two 18px seats plus
  their gap is exactly 40. Shrinking the marks to fit 32 would have made both unreadable to
  save eight pixels off a column that is right-aligned anyway.

- **The row is one `EventLogRow` component.** The review surface has to mount the row the
  player actually gets; a page that re-types the markup can agree with itself while disagreeing
  with the log.

**The pixels are the owner's call, not the agent's.** Candidates are judged in **Studio → Log
Marks**, a catalog category reached by clicking its tab
([ADR-0058](0058-every-route-is-click-reachable.md)). A seat selector picks which of the seven
is being decided; every candidate for it is drawn on the **real log rows at the real 18px
seat**, beside the marks already installed for the others. A mark this small cannot be judged
from its 64px art — a headstone that reads beautifully at native size can arrive at the seat as
a grey lozenge, and that is precisely what the page exists to show. The page also carries the
before/after of the COPY, because dropping the classifying words is a second decision and it
should be judged by sight rather than described.

## Consequences

- A finished Battle can be read at a glance, and the log got materially shorter: eleven of its
  twelve line kinds lost their opening clause.
- `LogEntry.marks` is additive and optional, so a persisted match resumes with its old rows
  unmarked and shows their full original sentences. No `PersistedMatch` version bump and no Run
  save migration follows — this is presentation plus seven additive live-media slots, each
  recoverable by retiring it.
- **A gold row states its sign in the number** — `Knight’s fork — +5`, `Move undone — −10`.
  The Run HAS a directional gain mark (coins rising behind a green arrow, accepted under
  ADR-0486) but ADR-0511 retired it when no Run transaction paid gold in any more, so the gain
  row draws the neutral resource coin while the loss row draws a real transaction mark. A bare
  number under an undirected coin leaves the reader to guess whether five gold arrived or left.
  The Manubium row is now a gain consumer and is the reason to bring that mark back; its slot is
  retired in the database, so an upload is refused `media_slot_retired` and restoring it is a
  migration rather than an edit. The sign stays honest either way.
- **Defeat is decided and installed:** option 115 of the plain family, content
  `ce39f7df…282deeab9`, native 49x49, accepted into `ui/kit/icons/game/defeat.png` and bound
  to `ui-kit-icons-game-defeat-png`. Every defeat line in the Event Log paints it. Six seats
  remain open.
- Acceptance refuses bytes that do not state they are native 1x, and the first upload pass
  omitted `nativeEvidence` entirely — so EVERY seat would have failed at Install, not just the
  one that was tried first. All 128 candidates now carry it. The claim is true of these:
  PixelLab generates at 64x64 and `trimToInkSquare` only crops and pads, so the uploaded bytes
  are the source at 1x.
- Until the owner installs one per seat, every forged mark renders its reserved empty seat —
  and because an ending row’s whole text is now its marks, those rows are blank end to end.
  That is the contract working, and it is also why the review page previews the first candidate
  wherever nothing is installed: a page of empty boxes demonstrates nothing.
- The vocabulary is a list, so a fifth mark is a variant rather than a second seat. Whatever is
  added must pass the same test: does it REPLACE a word, and does the game already draw it?
- `verify:icon-seats` now covers four rules rather than two, and will fail if either untrimmed
  title-bar glyph is re-uploaded with different ink.

## More Information

- Candidates were generated with PixelLab `create_image_pro` against
  `ui/kit/icons/game/objective.png` as the style image, then trimmed by
  `frontend/scripts/bake-icon-stroke.mjs`'s `trimToInkSquare` — crop and pad only, so the bytes
  stay honestly native 1× under [ADR-0076](0076-scaling-is-calibration-production-art-is-native-1x.md).
  Batches: `battle-log-defeat-mark-2026-08-12-v2` (16 headstones) and
  `battle-log-marks-2026-08-12-v1` (16 chess plus signs and 16 threatened crowns for `check`,
  16 laurel wreaths, 16 balance scales).
- **Check is offered as two concepts deliberately.** The chess plus is the symbol the notation
  directly above the row already ends in; the threatened crown is the fact rather than its
  notation. Both read at 18px, and which one belongs in a log that is already full of `+` is a
  judgement about the whole surface, not about the art.
- The first headstone family carried a gold cross on every stone. The owner ruled the cross
  out, so that whole batch is retired from the review list rather than left up beside its
  replacement — a page that keeps showing a rejected family asks the same question twice. The
  bytes stay uploaded and unaccepted; `-v2` is plain weathered stone.
- A toppled chess king was generated for `defeat` and is **not** offered: it renders cleanly at
  64px and fails at the seat, where a horizontal piece collapses into a blue smear with a gold
  blob. That is a legibility fact about this seat, recorded so the idea is not re-attempted at
  this size without re-checking it.
