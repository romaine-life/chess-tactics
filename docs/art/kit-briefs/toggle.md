# Kit Art Brief — Toggle (on / off)

Self-contained brief for the art generator. Needs no context beyond this file
and the referenced images. Goal: produce two clean, **transparent, crisp**
toggle pills in the accepted Settings art style — NOT a soft crop of the
concept. The current `toggle-on/off.png` failed because they are soft-edged
(~45% anti-aliased pixels), authored at 96×44, and stretched to 150×45 (a
non-integer upscale). Replace them with crisp, native-size art.

## Style reference — ATTACH THESE IMAGES TO CODEX

- `docs/art/ui-screen-concepts/generated/settings-audio-concept-v1.png` — full
  accepted page (palette, lighting, the toggles in context).
- `docs/art/kit-briefs/toggle-ref.png` — tight crop of the exact target toggle
  (the **ON** pill: cyan glowing border with small corner ticks, white "ON"
  label on the left, bright blue knob filling the right third).

## What to produce

Two PNGs — the **same pill geometry**, two states:

| File | State | Knob | Label |
|---|---|---|---|
| `toggle-on.png`  | on  | bright blue, **right** third | white `ON`, left-center |
| `toggle-off.png` | off | dim slate, **left** third   | muted grey `OFF`, right-center |

The OFF state is the ON state with the knob slid left, the fill dimmed, and the
border/label desaturated — same outer pill, mirrored knob.

## Hard requirements (these are why the current pair failed)

1. **Transparent background.** Fully transparent outside the rounded-pill
   silhouette — no baked panel/row pixels behind it.
2. **Crisp, hard-alpha pixel art.** Sharp 1px edges; **no anti-aliasing halo**,
   no soft/blurry resampled edges. Alpha should be near-binary: a pixel is
   inside the pill or it is not. (The QA gate counts semi-transparent pixels.)
3. **Native size, no upscale.** Author at **152 × 48 px**, 1×, rendered 1:1 —
   the exact on-screen size. Also emit `@2x` (304 × 96). Do NOT author small and
   upscale.
4. **Identical geometry across both states.** Same outer pill width, height,
   corner radius, border thickness — only the knob position, fill, and label
   change.
5. **Left/right symmetric pill.** The rounded ends and corner ticks must mirror
   left-to-right (the gate checks horizontal symmetry of the outer frame; only
   the interior knob/label break symmetry).
6. **Baked label is intended.** The `ON`/`OFF` text is part of the art (the
   runtime does NOT overlay text). Keep it crisp and centered in its half.

## Acceptance criteria (how I will QA)

- Transparent everywhere outside the pill (per-pixel).
- Semi-transparent pixel share well under 10% (crisp edges, not soft).
- Outer frame mirrors L/R within tolerance (gate symmetry check).
- 152×48 native; rendered 1:1 with no CSS stretch.
- Side-by-side with the concept, the bevel/palette/glow read as the same family.

## Deliverables

Overwrite `frontend/public/assets/ui/kit/toggle-on.png` and `toggle-off.png`
(plus `@2x`). I will run the gate, wire them in at native size, and screenshot
for sign-off.
