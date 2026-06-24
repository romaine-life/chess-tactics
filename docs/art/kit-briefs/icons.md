# Kit Art Brief — Icon set (extract from the concept, clean to transparent)

Produce a uniform, transparent-background icon set into
`frontend/public/assets/ui/kit/icons/`. Extract the real glyphs from the
attached settings concept screens — do NOT redraw. Verify each result visually
(you have vision): no background remnants, correct glyph, nothing clipped.

## Source screens (attached)

- `settings-general-concept-v1.png`, `settings-audio-concept-v1.png`,
  `settings-gameplay-concept-v1.png`, `settings-creator-tools-concept-v1.png`

## The one trick that matters

The left **rail** tab icons sit inside tab frames. The **active** tab has a
bright blue glow background that will NOT clean to transparent; the **inactive**
tabs have a dark background that will. So extract each rail icon from a screen
where ITS tab is **inactive**:

| icon | take from a screen where this tab is inactive |
|---|---|
| gear (General) | audio / gameplay / creator-tools |
| speaker (Audio) | general / gameplay / creator-tools |
| knight (Gameplay) | general / audio / creator-tools |
| wrench (Creator Tools) | general / audio |

## Icons to produce

- Rail: `gear`, `speaker`, `knight`, `wrench`
- Inline row icons (remove the dark plate behind them too): `monitor`, `reset`,
  `save`, `music`, `effects`, `interface-sounds`, `info`
- Creator-tools row icons: `design-index`, `tileset-studio`, `unit-studio`,
  `tileset-review`
- Brand: `brand-shield` (the rook shield in the header)

## Output spec

- One transparent PNG per icon in `frontend/public/assets/ui/kit/icons/`.
- Crop tight to the glyph, then pad to a **uniform 64×64** canvas, centered.
- Fully transparent everywhere except the glyph (flood-fill the connected dark
  background from the edges; keep dark pixels that are INSIDE the glyph).
- No tab frame, no corner accents, no plate — glyph only.

## Constraints

Write ONLY into `frontend/public/assets/ui/kit/icons/` (plus, if you use one, a
single `frontend/scripts/generate-kit-icons.mjs`). Do NOT modify any other file,
start servers, or install packages. List the files you created when done.
