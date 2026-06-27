> ⚠ **SUPERSEDED — do not follow the extraction method below.** Chrome art is now
> **generated** (codex img2img, method-verified) or assembled from generated atoms,
> not extracted from concept crops. See [ADR-0011](../../adr/0011-chrome-art-generated-not-extracted.md).
> Kept for history.

# Kit Art Brief — Panel (9-slice, EXTRACTED from the original)

Produce ONE reusable, transparent, 9-slice panel frame. **Do NOT procedurally
redraw the corner hardware.** The original concept art already has the corners
right; lift the real pixels and assemble a faithful 9-slice. Regeneration is
only allowed where a region is genuinely unusable (e.g. overlaps baked text).

This single asset must serve every panel size — large content panels AND narrow
rails. Do not make separate "content" and "rail" panels.

## Source (read the actual PNG and crop real pixels)

- Source image: `docs/art/ui-screen-concepts/generated/settings-general-concept-v1.png`
  (1586 × 992). Read it with pngjs and crop real pixels — do not eyeball-redraw.
- The main content panel occupies approximately **x=354, y=150, w=1224, h=812**
  in that image. Its four gold corner brackets are at the four corners of that
  rectangle. The narrow rail panel occupies approx **x=7, y=150, w=326, h=812**
  (same frame language, useful as a cross-check).

## Method (this is the whole point)

Build the 9-slice from extracted regions:

1. **Corners (fixed):** crop the four real corner regions (~36 px) from the
   content-panel rectangle corners. Use them verbatim. Mirror only if a corner
   is occluded; prefer the real pixels for each corner.
2. **Edges (tile 1D):** crop a thin clean strip from the middle of each side
   (top, bottom, left, right) — a region with no baked text — to use as the
   tileable edge.
3. **Center (tile 2D):** crop a clean patch of the textured navy interior (away
   from any baked text/content) to use as the tileable fill.
4. **Assemble** into a single 9-slice PNG: corners in the corners, edge strips
   along the sides, center patch in the middle. Keep the area *outside* the
   panel frame transparent.

## Deliverables

- `frontend/public/assets/ui/kit/panel.png` (≈128 × 128) and `panel@2x.png`.
- `frontend/scripts/generate-kit-panel.mjs` — the deterministic
  crop+assemble script (reads the concept PNG, writes the assets).

## Acceptance criteria (how I will QA)

- The corners are visibly the **same crafted gold brackets as the concept** —
  not a simplified redraw.
- Transparent outside the frame; opaque textured interior (not hollow).
- 9-slice with `border-image … fill / Npx round`: stretched wide AND tall, no
  seam on edges, interior texture tiles with no visible repeat line, corners
  undistorted and identical to the concept.

## Constraints

Create ONLY `panel.png`, `panel@2x.png`, and `generate-kit-panel.mjs`
(overwrite the existing ones). Do NOT modify, delete, or reformat any other
file. Do NOT start servers or install packages. List the files when done.
