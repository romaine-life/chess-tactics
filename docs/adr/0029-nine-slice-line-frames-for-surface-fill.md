---
status: "accepted"
date: 2026-06-27
deciders: Nelson, Claude
---

# ADR-0029: A surface behind kit chrome uses a transparent-interior "line" frame, not a per-material baked frame

Extends the atom-assembled 9-slice kit ([ADR-0012](0012-nine-slice-frames-are-atom-assembled.md))
and the low-fidelity chrome aesthetic ([ADR-0014](0014-ui-chrome-low-fidelity-aesthetic.md)).
It answers a recurring question: **how do you put a texture (a stone / wood surface)
*behind* a piece of kit chrome — a panel, a tab button, a row — when the chrome is a
9-slice that bakes its own fill colour in?** This came up building the settings
"dressing room" (the surface-placement tool on the Studio page) and will recur every
time we want a surface to read through a framed element.

## Context and Problem Statement

Every kit frame is an atom-assembled 9-slice (ADR-0012): `corner` + `edge` + `fill`
atoms composed into one PNG, applied with CSS `border-image: url(frame.png) <slice>
fill / <width>`. The `fill` keyword paints the frame's **center** slice — that is
where the navy interior of `panel.png` / `mode-button.png` / `row.png` comes from.

To reveal a surface behind such an element the obvious move — **drop the `fill`
keyword** — does not work. A 9-slice has **eight edge slices plus the center**, and
the navy is baked into the *edge* slices too (the rail's inner band). Dropping `fill`
removes only the center; the eight edge slices still ring the element navy. The
result is a navy frame/ring around the surface — the "fill problem." It bit us first
on the settings panels and again, identically, on the tab buttons and rows.

The tempting wrong fix is a **dedicated per-material frame** — bake a "wood button,"
a "stone panel," etc. That explodes combinatorially (every frame × every material),
and a baked-in fill is a fixed bitmap: it cannot tile, cannot share one continuous
surface across regions, and cannot take a zoom/offset — it undoes the whole
surface-as-a-separate-layer model.

## Decision Drivers

- **One surface layer, many frames** — the texture is authored once and tiles; the
  frame is just ornament over it. Never bake the surface into the frame.
- **Reproducible, not hand-carved** — the transparent-interior frame must regenerate
  from the same atoms as its filled twin, so the two can't drift (ADR-0012).
- **Low-fi, native pixels** — masking is whole-pixel, `image-rendering: pixelated`
  (ADR-0014).
- **Cover the 9-slice, not just the center** — the fix must remove the *edge*-slice
  bleed, which is the actual cause.

## Decision Outcome

A surfaced element is **transparent-interior "line" frame (ornament only) + the
surface as a separate `background` layer**. Never a per-material baked frame.

### A. The "line" frame — ornament only

For any frame that needs to sit over a surface, bake a **line** twin from the *same*
corner + edge atoms with a **transparent fill**, then mask every remaining dark/navy
pixel back to transparent (max-channel `< 45` → α 0) so only the bright rail /
ornament survives. This kills both the center fill and the edge-slice bleed.
`bakeLine(assetId)` in `frontend/scripts/nine-slice-kit.mjs` is the single
implementation; it reuses the asset's committed corner tune, so the line twin can
never diverge from the filled frame's geometry.

### B. First-class, registry-declared, parity-tested

A frame opts in with a **`line: "<name>.png"`** field in
`config/nine-slice-registry.json`. `buildAsset` (so `apply-nine-slice.mjs`) and the
focused `bake-line-frames.mjs` both write it to
`public/assets/ui/explore/frames/`, and the bake-parity test
(`src/ui/design/nineSliceBake.test.ts`) re-bakes it and asserts it equals the
committed PNG — exactly as for the filled variants. So a line frame is a normal,
regenerable kit output, not a one-off. Today `panel` and `row` carry the flag;
`panel.png === mode-button.png` (identical atoms), so **`panel-line.png` serves both
the panels and the tab buttons**, and `row-line.png` serves the rows.

### C. The surface is a separate background layer

The element keeps the line frame as `border-image` and paints the surface as its own
`background`, reaching the edge with `background-clip / -origin: border-box`, and
`background-attachment: fixed` so multiple regions sample **one continuous sheet**
(the texture flows unbroken across panel / button / row seams rather than restarting
per element).

### D. Choose the ornament for see-through

A frame whose ornament is **corner brackets** (panel / mode-button) reads cleanly
when its interior is see-through. A frame whose ornament is a **continuous keyline**
(the steel row rail) renders as a thin rectangle that hugs the element's edge and
reads as a *stray boundary* on a surface. So a surfaced **row takes no frame** — the
surface fills it edge-to-edge and row spacing + content provide separation. Match the
ornament to the use: brackets survive transparency, full keylines do not.

### Consequences

- **Good:** any element can be surfaced with `line-frame + surface-background`; no
  navy ring; one texture tiles continuously behind all of them; new frames get a line
  twin by adding one registry field, covered by the existing parity test.
- **Good:** the hand-made `panel-line.png` is replaced by the baked one (byte-pinned
  by the test), so it is regenerable like everything else.
- **Cost:** the dark-pixel mask threshold (`< 45`) is a heuristic tuned for the
  navy-on-bright kit palette; a frame with intentionally dark ornament would need a
  different mask. Re-tune in `bakeLine` and mock-and-measure if that ever happens.
- **Cost:** a continuous-keyline frame can't be made see-through attractively — such
  an element drops its frame instead (the row), a deliberate exception.

## More Information

- **Where it bit:** the settings dressing room (`frontend/src/ui/SurfaceDressingRoom.tsx`)
  — surfaces behind the title bar, tabs box, buttons, rows box, and rows.
- **Implementation:** `bakeLine` + `LINE_DIR` + the `line` registry field in
  `frontend/scripts/nine-slice-kit.mjs`; `frontend/scripts/bake-line-frames.mjs`;
  parity in `frontend/src/ui/design/nineSliceBake.test.ts`.
- **Assets:** `frontend/public/assets/ui/explore/frames/{panel-line,row-line}.png`.
- **Related:** ADR-0012 (atom-assembled 9-slice frames — the line twin reuses the
  atoms), ADR-0014 (low-fi / native pixels / pixelated render).
