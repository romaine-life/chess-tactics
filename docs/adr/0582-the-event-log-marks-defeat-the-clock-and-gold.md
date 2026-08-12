---
status: accepted
date: 2026-08-11
deciders: owner (Nelson) + Claude
refines:
  - "[ADR-0059](0059-reuse-the-canonical-primitive-not-a-bespoke-parallel.md)"
  - "[ADR-0318](0318-plagued-and-pestiferous-use-separate-owner-selected-icons.md)"
  - "[ADR-0552](0552-athetize-is-a-card-struck-through.md)"
---

# ADR-0582: The Event Log marks defeat, the clock, and gold

## Context

The Battle's Event Log is a score sheet, and a score sheet is **scanned before it is read**.
Its move rows already carry that: a notated `Nxb5+` says capture, mover, square and check at
once, and its side rail says who played it.

Its **prose** rows carry nothing. "Check!", "Defeat — your clock ran out." and "Knight's fork
— 5 gold claimed." are three shades of the same muted grey at the same indent, so the two
facts a player actually looks back for — *how did this end* and *did anything pay* — are
found by reading every line. That is the whole failure: the log records those facts
faithfully and presents them at a weight that says they are all interchangeable.

## Decision

**A prose line wears the marks for what it is about, in the column the move numbers take.**
The vocabulary is exactly three, because these are the three things a scan is looking for:

| Mark | Lines that wear it |
| --- | --- |
| `defeat` | Every line that says this Battle was lost: checkmate, resignation, a victory rule going the other way, a flag fall, a netplay result from the losing seat. |
| `clock` | The flag fall. |
| `gold` | Every line where the Run's economy moved: a Manubium paid on the board, and the ten gold a paid Undo costs. |

- **A line may wear two, because outcome and cause are different facts.** "Defeat — your
  clock ran out." is a defeat AND it is the clock, and dropping either mark loses something
  the row actually says. Marked only as a defeat it scans like any other loss; marked only as
  the clock it does not say the Battle ended. This is why the marks are a list rather than a
  field.

- **A victory wears nothing, and neither does an ordinary prose line.** If every outcome were
  marked there would be nothing for the scan to find. The unmarked row is the common case,
  which is what makes a mark worth looking for.

- **The mark is set WHERE THE LINE IS WRITTEN**, never re-derived by matching the rendered
  prose. `logNote(text, ...marks)` takes them, and the two places that decide an outcome
  decide its mark in the same breath — `adjudicationEntry` for a settled position and
  `netOutcomeEntry` for a concluded lobby match — so a defeat cannot be written without being
  marked as one. A regex over the copy would go quietly wrong at exactly the moment the
  wording improves, and no test catches a mark that stopped appearing.

- **`gold` is read off `RunBattleNotice.goldTenths`**, which is already the field that decides
  whether the board seats a rising `+gold` marker. One fact drives both, so the line and the
  marker over the square cannot disagree.

- **Only ONE of the three is new art.** The clock is the persistent title bar's installed
  hourglass (`ui/kit/icons/game/wait.png`) and the coin is the Run's own `RunGoldIcon` — the
  same component `BattleGoldNotice` draws over the board. Forging a second hourglass or a
  second coin for this seat is exactly the bespoke parallel [ADR-0059](0059-reuse-the-canonical-primitive-not-a-bespoke-parallel.md)
  forbids, and it would let the log and the screen beside it show two different coins.

- **Defeat is the one mark with no existing home**, so it gets its own slot in the kit's
  game-icon family at `ui/kit/icons/game/defeat.png`, under a new `battle-log-mark` runtime
  component. Like the Run-position and action marks it ships **trimmed to its own ink** and
  padded to the square that bounds it: the seat is 18px and draws with `contain`, which scales
  the canvas, so transparent margin left on a 64×64 frame would come straight off the drawn
  glyph and no CSS compensation could keep it in step with the art.

- **The defeat seat is RESERVED, not fail-closed** ([ADR-0318](0318-plagued-and-pestiferous-use-separate-owner-selected-icons.md)):
  it holds its 18px box before any art decision exists, so installing a mark later cannot
  shift the line beside it. The clock and the coin fail closed, because they are already
  installed chrome.

- **The row's second column is 40px, not the 32 a move number needs.** Two 18px seats plus
  their gap is exactly 40. The alternative was shrinking the marks until two fit in 32, which
  would have made both unreadable to save eight pixels off a column that is right-aligned
  anyway — the numbers have not moved relative to the notation beside them.

**The pixels are the owner's call, not the agent's.** Candidates are uploaded to the slot and
judged in **Studio → Log Marks**, a catalog category reached by clicking its tab
([ADR-0058](0058-every-route-is-click-reachable.md)) — every candidate on one page, each drawn
on the **real log rows at the real 18px seat**, beside the clock it shares a row with and the
coin below it. A mark this small cannot be judged from its 64px art: a headstone that reads
beautifully at native size can arrive at the seat as a grey lozenge, and that is precisely
what the page exists to show. Nothing is installed until the owner installs one.

## Consequences

- A finished Battle can be read at a glance: the losses and the payouts stand out of the
  prose without any line changing its words.
- `LogEntry.marks` is additive and optional, so a persisted match resumes with its old rows
  unmarked. No `PersistedMatch` version bump and no Run save migration follows — this is
  presentation plus one additive live-media slot, recoverable by retiring it.
- The vocabulary is a list, so a fourth mark is a variant rather than a second seat. Whatever
  is added must pass the same test the three did: is this a thing a player SCANS for, and does
  the game already draw it somewhere else?
- Sixteen candidates are uploaded on batch `battle-log-defeat-mark-2026-08-11-v1` and none is
  accepted, so every defeat line renders its reserved empty seat until the owner picks one.
  That is the contract working, not a missing asset.

## More Information

- Candidates were generated with PixelLab `create_image_pro` (job
  `d67713af…64369d`, seed 7301) against `ui/kit/icons/game/objective.png` as the style
  image, with `attack`, `defend` and `objective` as labelled references, then trimmed by
  `frontend/scripts/bake-icon-stroke.mjs`'s `trimToInkSquare` — crop and pad only, so the
  bytes stay honestly native 1× under [ADR-0076](0076-scaling-is-calibration-production-art-is-native-1x.md).
- A second concept was generated and is **not** offered: a toppled chess king, which is
  chess's own sign of resignation. The family rendered cleanly at 64px and failed at the seat
  — a horizontal piece collapsed into 18px reads as a blue smear with a gold blob, where the
  headstone keeps a legible silhouette and a readable cross. That is a legibility fact about
  this seat, not a judgement about the art, and it is recorded here so the idea is not
  re-attempted at this size without re-checking it.
