---
status: "accepted"
date: 2026-07-04
deciders: Nelson
---

# ADR-0067: Board previews render on the level's world background, never a transparency checkerboard

## Context and Problem Statement

Board *preview* surfaces — the Campaign Editor's selected-level column, and any read-only
board viewer that isn't the live board — were rendering the board on the design Studio's
transparency-checker stage (`.tileset-view-stage`: a checkerboard fill over a dark tint,
plus a `10px` letterbox padding and a bordered box). That checker exists to answer one
question in the asset Studio — *"is this pixel transparent?"* — and it is meaningless for a
*level* preview: a level has a real world background (the night-sky scene the in-game board
already floats on, ADR-0032/ADR-0064). Shown behind a level, the checkerboard reads as
placeholder / unfinished art and misrepresents what the level actually looks like in play.

## Decision Drivers

- A preview must show the level *as it will actually look* — the board on its world
  background — not an asset-studio artifact leaking through.
- ADR-0032 already floats the live skirmish board AND the level-editor board on the world
  background; previews had silently drifted from that one truth.
- One answer to "what is behind a board", reused everywhere, not re-decided per surface.

## Considered Options

- Keep the transparency-checker stage in previews (status quo).
- Give the preview a bespoke solid tint behind the board.
- Strip the stage box (checker fill + padding + border) so the board floats on the world
  background, exactly like the in-game board.

## Decision Outcome

Chosen: **board previews render the board FILLING the box on the world (night-sky) background —
no checker, no letterbox padding, no empty buffer** — the same look the live skirmish board gets
(ADR-0032). The transparency checkerboard is **banned from any board/level preview**; it stays
only on the Studio's own transparency stages (`.al-checker`, catalog cards), where "is this pixel
transparent?" is genuinely the question being asked.

Rejected the bespoke tint (it invents a new bland surface behind the board — the exact thing
ADR-0032 forbids) and the status quo (a checkerboard behind a finished level reads as broken).

The Campaign Editor preview keeps its kit **box** (the panel 9-slice frame) — the box was never
the problem. The subtle part is the board's *shape*: an isometric board is a **diamond**, the box
is a **rectangle**, and a diamond cannot reach a rectangle's corners. So *fitting the whole board
into the box* — the obvious approach, and the one that burned hours — always leaves the diamond's
transparent corners (and the tile sprites' transparent relief-headroom) at the box corners, where
they show whatever is behind them as an empty buffer: the checker on the old stage, the dark
backdrop after it was stripped, either way a gap. **Fitting the board is the wrong model.** Instead
the preview renders a **baked raster of the board's dense SOLID region** and drops it into the box
with **`object-fit: cover`**: a fully-opaque image cover-fitting a box fills it edge-to-edge and
clips the overflow — exactly how the live skirmish board fills its view (you see the solid interior;
the board's edges spill past the frame). The board reaches the frame on every side, with no padding
and no transparent pixel left to reveal a backdrop or checker. The `.ce-level-viewer` box still
carries the world (night-sky) backdrop for correctness, but a solid crop leaves nothing to see it
through. The level info stacked beneath keeps a real kit panel surface (readability over the busy
backdrop) — it is content, not the board.

### Consequences

- Good: previews look like the game; a single source of truth for "what's behind a board";
  no placeholder-looking checker on shipped content.
- Cost: a preview inherits whatever is actually behind it (the continuous night-sky backdrop,
  ADR-0064). This is fine because board previews live inside the menu / editor family, which
  always carries that backdrop; a preview dropped onto a surface with no world background
  would show that surface, so new hosts must sit over the shared backdrop.

## Pros and Cons of the Options

### Baked solid-crop raster, cover-fit into the box (chosen)

- Good: fills the box edge-to-edge like the live board, with NO transparent corner to reveal a
  checker/backdrop (a diamond fitted into a rectangle always leaves those; a solid crop can't);
  a cheap static raster, no live pan/zoom/fit math to get wrong; reuses the bake pipeline the
  list thumbnails already use.
- Bad: shows the board's dense centre and clips its outermost edge tiles (the skirmish trade —
  fill over showing the whole outline); a one-time bake per selection.

### Strip the stage box → board floats on the world background (insufficient)

- Good: identical container to the in-game board (ADR-0032); kills the checker.
- Bad: does NOT fill the box — the board is still a diamond, so its transparent corners land at
  the box corners and show the (now dark, not checker) backdrop as an empty buffer. This is the
  version that looked "still not fixed"; it treats the symptom (checker) not the cause (fit).

### Bespoke solid tint behind the board

- Good: self-contained; no dependency on the backdrop.
- Bad: a new hand-rolled surface behind the board — an ADR-0032 violation — and still not
  what the level looks like in play.

### Keep the checkerboard

- Good: no work.
- Bad: reads as placeholder/unfinished; contradicts ADR-0032; the reported defect.

## More Information

Instance of **ADR-0032** (in-game boards float on the world background, not a bland/checker
surface) and sibling of **ADR-0064** (the homepage backdrop is one continuous instance behind
the whole menu/editor family). Reuses that canonical decision rather than a parallel one
(**ADR-0059**): the shared preview is `LevelPreviewColumn.tsx`, used by BOTH the Campaign Editor
and the play-side Campaign screen. Implementation:
`frontend/src/render/bakeBoardThumbnail.ts` — `largestSolidRect` (a summed-area table finds the
largest strictly-opaque rectangle of the board; unit-tested to be 100% opaque so a cover fill can
never expose a transparent corner) + `bakeBoardPaintedImage` (crops the board to that rect → a PNG
object URL). `LevelPreviewColumn.tsx` renders it as `.ce-level-viewer-board` with
`object-fit: cover`; `.ce-level-viewer` carries the world backdrop (`--skirmish-world-bg`) and its
kit frame (`.ce-preview-frame::after`) overlays the board's outer band. The Studio transparency
stages are untouched.
