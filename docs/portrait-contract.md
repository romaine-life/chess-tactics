# Piece portrait contract

The **portrait** is the framed bust shown in the Skirmish HUD's "Selected Unit" card. It
is a **separate render contract from the true-isometric board sprite** — the board needs a
top-down gameplay projection; a portrait needs an eye-level, dimensional "hero" shot.

## Camera
- **Perspective** lens, 55mm on a 36mm sensor (mild, flattering portrait depth) — *not*
  orthographic.
- **Eye-level**: elevation **+10°** above the look-at point.
- **Frontal-¾**: azimuth **30°** off dead-front for **every** piece. The unit keeps its
  standard orientation (front → local −Y = in-game south, per the unit-facing
  convention); only the *camera* orbits, so every portrait faces south like the board
  sprite. No per-unit aesthetic facing offset — the knight is viewed frontal-¾ like the
  rest (its horse head reads fine at 30°), not turned to profile.
- **Adaptive full-figure framing**: from each unit's actual top (`topZ`), the camera looks
  at `Tz = 0.49·topZ` and frames a vertical span of `1.24·topZ`, so the **whole** piece —
  distinctive top (crown / mitre / tiara / helmet / horse head / battlements) *and* the
  base — sits inside the frame with a small floor margin (~5–8% top and bottom). The base
  is never sliced. The HUD anchors `object-position:center bottom`, so a clipped base reads
  as "cut off" and a big transparent floor reads as "floating"; the small even margin
  avoids both. The rook's wide keep base flares toward the camera and needs more floor
  room, so it uses `Tz = 0.42·topZ`, `span = 1.50·topZ` (set per-piece in `render_all.sh`
  via the `PORTRAIT_TZ` / `PORTRAIT_SPAN` env overrides). Adapts to each piece's height
  automatically.
- 512×512, transparent background (`film_transparent`), Cycles, Standard view transform.
  Lighting + materials come from the unit's source `.blend` (same look as the board).

## Hero yaw
All pieces (pawn, knight, bishop, rook, queen, king): `30°` (frontal-¾). The unit faces
in-game south; the camera orbits 30° off the front.

## Palettes
One portrait **per team palette** (`navy-blue`, `crimson`, `golden`, `emerald`) — same
material-swap recipe as the board sprites: the body "navy stone" material is recolored, gold
accents are kept, except `golden` which swaps accents to dark iron and makes the body a
polished metal. Body base colours (linear RGB) for `portrait_render.py`:

| palette   | body RGB (linear)       | accent | body metal |
|-----------|-------------------------|--------|------------|
| navy-blue | `0.045  0.10   0.16`    | keep   | –          |
| crimson   | `0.2925 0.0483 0.0509`  | keep   | –          |
| golden    | `0.566  0.392  0.088`   | iron   | `0.6`      |
| emerald   | `0.0332 0.1570 0.0808`  | keep   | –          |

(`navy-blue` is the canonical `navy stone` base from `pieces_claude.py`; crimson/golden/
emerald were recovered by calibrating against the navy renders, since the original ad-hoc
commands were never committed.) The knight is procedural and carries its own per-palette fur
tones in `knight_portrait.py`.

The piece blends are the **ornamented "production" set**, not the plainer `claude-pieces`
lathe set: helmeted pawn (`docs/art/archive/units/pawn/pawn_helmet.blend`), ornate mitre
(`bishop-mitre`), badass keep (`rook-badass-keep`), beaded tiara (`queen-tiara`), gold crown
(`king-crown`). See `render_all.sh` for the exact map.

## Asset path & wiring
- `/assets/units/<piece>/portrait/<palette>.png`
- `portraitPath(type, palette)` in `frontend/src/core/pieces.ts`; the HUD picks the palette
  from the selected piece's side (`PALETTE_FOR_SIDE`) and renders `<img class="skirmish-portrait">`,
  falling back to the badge glyph for non-roster pieces.

## Reproduce
- **All 24 at once** (the driver — encodes every blend, palette colour, and the rook/knight
  special-casing):
  `BLENDER="…/blender.exe" bash docs/art/unit-concepts/portraits/render_all.sh`
- Single blend piece: `blender -b --python docs/art/unit-concepts/portraits/portrait_render.py -- <blend> <outfile> <palette> <r> <g> <b> <keep|iron> <yaw> [metal] [rough]` (optionally `PORTRAIT_TZ`/`PORTRAIT_SPAN` to override framing)
- Knight (procedural): `blender -b --python docs/art/unit-concepts/portraits/knight_portrait.py -- <palette> <outfile> <yaw>`

Background art is intentionally **not** baked in — portraits ship transparent so a backdrop
can be composited behind them later.
