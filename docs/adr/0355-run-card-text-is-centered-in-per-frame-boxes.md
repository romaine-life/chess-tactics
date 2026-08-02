---
status: accepted
date: 2026-08-02
deciders: owner (Nelson) + Claude
extends:
  - "[ADR-0057](0057-studio-tuning-surfaces-reset-to-authoritative-baseline.md)"
  - "[ADR-0071](0071-the-deliverable-is-the-instrument.md)"
  - "[ADR-0283](0283-run-card-face-is-one-shared-live-runtime-component.md)"
  - "[ADR-0329](0329-concinnous-and-tactical-use-distinct-frames-and-one-shared-coin.md)"
---

# ADR-0355: Run-card text is centered in per-frame boxes, never nudged per card

## Context

Five frame images now back the Run card face, each an independently generated
painting or forging: the standard, Pestiferous, Concinnous, Tactical and
Hieratic frames. Every one of them draws its own title plate, coin socket and
type plate, and no two of them draw those plates at exactly the same height.

The face did not model that. One geometry served four of the five frames — the
lookup was keyed by the frame's SHA-256, so any frame whose pixels were not
individually recorded silently inherited the Standard boxes — and the residual
error was absorbed by a global `typeY` offset applied to the text on top of the
box. The result was exactly what a per-card fudge produces: the type line sat at
a slightly different height inside each card's plate, the coin reading sat
slightly differently in each socket, and the frame-box overlay in the Studio drew
the box in one place while the text rendered 1.2cqw below it, so the one
instrument that should have exposed the problem concealed it.

The offsets were also unattributable. Nobody could see where a plate actually was
in an image, so a plate that read wrong and a text offset that read wrong were
indistinguishable, and each new frame arrived needing another hand-found number.

## Decision

**A box is the frame's, and it is the whole answer.** Every frame owns its five
boxes — title, cost, art, type, contents — in native 1060x1484 frame pixels,
addressed by the live-media slot the frame is served from rather than by the
pixels currently published there. A regenerated frame keeps its own boxes instead
of inheriting Standard's.

**A box is the drawn opening, on all four edges.** A text box is the whole
opening the frame paints — including the rounded ends and corner studs no text
will ever reach — because that opening is the visual unit the reader sees the
text sitting inside. It is not the rectangle the text happens to occupy. Padding
is then expressed against that unit: the shared inset measures from the plate's
real edge, so one value reads the same on a thin painted border and on Hieratic's
thicker steel one, instead of every frame sharing a column that belongs to none
of them.

**Text placement is derived, not authored.** A line is centered vertically in its
box. Title and type text is inset from both plate edges by one shared value; the
coin reading is centered on both axes. Two shared numbers — `insetInline` and
`opticalBlock` — are the only placement values in the system, and they apply to
every line on every frame at once. `RunCardFaceTuning` therefore carries text
*sizes* and those two shared values; a host cannot express a position. A line
that reads wrong means its box is wrong.

**The owner places the boxes; the renderer places the text.** The Card Layout
Studio instrument tunes one frame's boxes at a time by eye: pick a box, move its
top, height, left and width in native frame pixels, and watch the live face
re-center its text as the box moves. The overlay marks the box under the hand and
dims the rest. Per-slider and per-frame resets return to the committed baseline
(ADR-0057), and the handoff emits all five frames' boxes together with the exact
frame SHA-256 each was tuned against.

**Unmeasured boxes say so.** A geometry records `measuredSha256` only once its
boxes were tuned against those exact pixels; until then the instrument reports
the boxes as seeded rather than measured, instead of presenting an inherited
guess as a measurement.

## Consequences

- Retuning boxes is layout, not identity: it reaches the live face immediately
  and never triggers the media crossfade the face runs for a card change.
- The committed boxes are seeded to reproduce the previous pixels exactly — the
  removed global type offset is folded into each frame's type box — so the change
  lands invisible and the by-eye pass is what moves the text. The one deliberate
  pixel change is the type-plate property icon, which now sits inset from the
  plate's right edge instead of overhanging it by the old global offset.
- A sixth frame costs one by-eye pass, not another found offset.
- Studio review of a card's text placement is now trustworthy: the overlay and
  the text agree by construction, because they read the same box.
