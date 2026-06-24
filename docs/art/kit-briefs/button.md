# Kit Art Brief — Button (pilot component)

Self-contained brief for the art generator. Needs no context beyond this file
and the referenced image. Goal: produce a clean, transparent, **9-slice-ready**
button frame in the accepted Settings art style — NOT a crop of the concept.

## Style reference — ATTACH THESE IMAGES TO CODEX

Do not rely on this text description alone. The generator must be **shown** the
actual pixels. Attach/paste all of these into the codex request:

- Full accepted pages (overall style, palette, lighting):
  - `docs/art/ui-screen-concepts/generated/settings-general-concept-v1.png`
  - `docs/art/ui-screen-concepts/generated/settings-audio-concept-v1.png`
- Tight crops of the exact target buttons:
  - `docs/art/kit-briefs/button-ref-general.png` — **Sign In** (= primary) and
    **Reset to Defaults** (= danger). Note: same frame, two colors.
  - `docs/art/kit-briefs/button-ref-audio.png` — **View Tracks** (= neutral).

The target IS those three buttons, isolated and recolored. They are one beveled
rounded-rectangle: brighter top edge / soft top gloss, thin darker outline,
subtle inner highlight, slightly rounded corners, dark-navy UI palette. No gold
corner brackets (those belong to panels, not buttons).

## What to produce

Three PNGs — the **same button frame, recolored** (identical geometry, only hue
differs):

| File | Intent | Color |
|---|---|---|
| `button-neutral.png` | secondary / neutral | dark slate (as "View Tracks") |
| `button-primary.png` | primary | blue (as "Sign In") |
| `button-danger.png` | destructive | red (as "Reset to Defaults") |

## Hard requirements (these are why the last batch failed)

1. **Transparent background.** Fully transparent outside the button silhouette —
   no baked panel/background pixels.
2. **No baked content.** No label text, no icon, no chevron — the frame only.
   Live text is composited at runtime.
3. **Identical geometry across all three.** Same width, height, corner radius,
   bevel thickness — a recolor, not three different buttons. (The old batch had
   3 sizes and a stray chevron; that is the failure to avoid.)
4. **9-slice ready.** Designed to stretch from a single source:
   - Fixed, non-distorting corners (~14 px each side).
   - Top edge (the gloss band) must tile horizontally with **no seam**.
   - Left/right edges tile vertically with no seam.
   - Center is a flat, fully tileable fill of the intent color.
5. **Size:** author at **120 × 64 px**, 1× (wide enough to expose a clean
   stretchable center). Also emit a 2× (`@2x`) variant.
6. **Crisp, not upscaled-blurry.** Sharp edges; no resampling artifacts.

## States (this pass)

`normal` only, for all three intents. (`pressed`/`hover` come in a later pass —
do not block on them now.)

## Acceptance criteria (how I will QA the result)

- Transparent everywhere outside the button shape (checked per-pixel).
- The three files are pixel-identical in geometry; only hue differs.
- Stretching the center 3–4× horizontally and vertically shows no seam and no
  corner distortion (I will test this in the kit board).
- Side-by-side against the concept buttons, the bevel/palette read as the same
  family.

## Deliverables

Drop the PNGs in `frontend/public/assets/ui/kit/` (create it). I will then
define patch margins, register them in the catalog, and place them in the kit
board next to the concept for your sign-off.
