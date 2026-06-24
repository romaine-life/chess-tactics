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
- **Adaptive bust framing**: from each unit's actual top (`topZ`), the camera looks at
  `Tz = 0.70·topZ` and frames a vertical span of `0.82·topZ`, so the distinctive upper
  form (crown / mitre / tiara / helmet / horse head / battlements) fills the frame and the
  base tapers off the bottom. This adapts to each piece's height automatically.
- 512×512, transparent background (`film_transparent`), Cycles, Standard view transform.
  Lighting + materials come from the unit's source `.blend` (same look as the board).

## Hero yaw
All pieces (pawn, knight, bishop, rook, queen, king): `30°` (frontal-¾). The unit faces
in-game south; the camera orbits 30° off the front.

## Palettes
One portrait **per team palette** (`navy-blue`, `crimson`, `golden`, `emerald`) — same
material-swap recipe as the board sprites (body "navy stone" recolored; gold accents kept,
or dark-iron on the golden body).

## Asset path & wiring
- `/assets/units/<piece>/portrait/<palette>.png`
- `portraitPath(type, palette)` in `frontend/src/core/pieces.ts`; the HUD picks the palette
  from the selected piece's side (`PALETTE_FOR_SIDE`) and renders `<img class="skirmish-portrait">`,
  falling back to the badge glyph for non-roster pieces.

## Reproduce
- Blend pieces: `blender -b --python docs/art/unit-concepts/portraits/portrait_render.py -- <blend> <outfile> <palette> <r> <g> <b> <keep|iron> <yaw> [metal] [rough]`
- Knight (procedural): `blender -b --python docs/art/unit-concepts/portraits/knight_portrait.py -- <palette> <outfile> <yaw>`

Background art is intentionally **not** baked in — portraits ship transparent so a backdrop
can be composited behind them later.
