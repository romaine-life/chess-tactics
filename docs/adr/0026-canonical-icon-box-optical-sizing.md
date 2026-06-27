---
status: "accepted"
date: 2026-06-27
deciders: Nelson, Claude
---

# ADR-0026: Canonical main-menu icon bounding-box and per-shape optical sizing

Gives the menu icons the governance they had none of: a **fixed authoring box** and
an **optical-size rule**, so a set of icons reads at equal visual weight in one slot.
Generalizes the per-component sizing discipline of
[ADR-0021](0021-settings-button-label-sizing.md) /
[ADR-0022](0022-settings-nav-tabs-typography.md) (sizes are role-governed, optical,
**never floating un-backed**) from settings text to menu icons, and complements
[ADR-0014](0014-ui-chrome-low-fidelity-aesthetic.md) (native-footprint / low-fi look)
and [ADR-0019](0019-dev-only-nine-slice-editor-save.md) (the consumption-side slot /
padding).

## Context and Problem Statement

The five carved-stone main-menu icons (blade, route-map, scroll, pawns, keys —
the first consumer; their subject/theme is governed by
[ADR-0025](0025-world-scene-art-anti-story-lore.md)) were forged **trimmed-to-content**,
so they shipped at five different footprints — blade `26×44`, route-map `44×42`,
scroll `34×38`, pawns `36×31`, keys `27×46` — and five different optical weights.
Dropped into one slot and centered, the blade and keys tower, the pawns shrink to a
smudge, the route-map dominates.

No ADR governed the icon bounding box: there was no canonical canvas, no
live-area / padding convention, and no optical-size rule. This is the same
un-backed-size drift settings just corrected (ADR-0022 supersedes an un-ADR'd
"larger labels & icons" bump from #148). It is exactly the failure that
Material / Carbon / Apple solve with a **fixed canvas + per-shape keylines**.

## Decision Drivers

- **Equal OPTICAL weight, not equal box-fill** — a tall thin shape and a wide shape
  must not both just fill the box (Material / Carbon / Apple keyline canon).
- **Native footprint, no fractional downscale** of pixel art (ADR-0014).
- **One role-governed size, never floating** (ADR-0021 / ADR-0022).
- **Position logic stays consumption-side**; the asset owns only its own internal
  centering (ADR-0019).
- **Pin by mock-and-measure, then don't reopen** (ADR-0007).

## Decision Outcome

A canonical icon box for main-menu mode-button icons.

### A. Canvas — every icon PNG is exactly `72×72`

All five identical file dimensions, transparent background. `72` because: `72 → 36`
(the live display) is an **exact integer 2× halving** so the small render stays
crisp; `72` sits in a 1–2× band of real display sizes (≈36–80px) rather than a 10×
blow-up; and it avoids authoring at the old `220px` source, whose `220 → 36` is a
`6.1×` **fractional downscale** — the precise over-smooth render ADR-0014 rejects.
Square, because the slot is square and it lets the optical nudge be stored as
symmetric/asymmetric padding without aspect distortion.

### B. Live area + padding (Material-keyline model)

| Box | Size | Per-side |
|---|---|---|
| Canvas / bounding box | `72×72` | — |
| Trim / padding ring | — | `6px` |
| Live area (art fills here) | `60×60` | centered |

`6 / 72 = 8.3%` per side — Material's 2-on-24 live-area : padding ratio, held
constant. Art only crosses into the trim ring when a shape genuinely needs the reach
(a blade tip, a key bow).

### C. Per-shape optical keylines — the core rule

Each icon is scaled to its **shape-class keyline**, not to fill the live area, so all
five carry **equal optical mass**. (Material templates a circle larger than a square
on the same grid because equal-width shapes don't read equal-weight.)

| Icon | Shape class | Keyline (within 60px live area) |
|---|---|---|
| route-map | **full / square** | fill **60** on the long axis (largest — a full form reads lightest) |
| blade | **tall / pointed** | grow height to **58** (pointed forms may reach into padding) |
| keys | **tall** | grow height to **56** (tall-thin reads less massive) |
| pawns | **wide** | hold **width** to **54** (a wide cluster reads heavier → shrink) |
| scroll | **upright / blocky** | conservative **54** (blocky forms held back) |

Rule: full/round grows largest; tall/pointed gain **height, never width**; wide is
held back on width; blocky is conservative.

### D. Optical centering frozen as padding

Each icon's **optical** center (not its bbox center) is placed on the canvas center,
and that nudge is baked into the `72×72` PNG's transparent padding (Apple HIG:
optical centering is geometric centering of a padded asset). Downstream centers the
asset by naive math and gets optical centering for free — **no per-icon offset config**.

### E. Pixel discipline

Whole-pixel coordinates only (round keyline fractions before placing);
nearest-neighbour resampling and `image-rendering: pixelated` at render (never
bilinear — preserves the ADR-0014 chunky edge); one stroke weight family-wide.

### F. Consumption — applies when the stone chrome is wired into the live menu

The carved icons are not yet wired into the live menu (the "Wet Stone & Cold Iron"
chrome is still being workshopped). When wired:

- A single role token **`--menu-icon-size`** declares the display size **once**
  (ADR-0021 / ADR-0022 discipline); the slot paints the whole `72×72` asset at that
  size and **never re-sizes per icon**.
- The `iconSlot` rect stays the layout contract (ADR-0019, consumption-side); the
  `button-icon.main-menu.*` entries in `asset-catalog.json` move `220 → 72`.
- Active/hover emphasis is by color/fill, **never resize**.

### Method — re-pack, not re-forge

`frontend/scripts/pack-menu-icons.mjs` is a deterministic compositor: it scales each
forged icon's high-res **despilled `-smooth` source** to its keyline by a LANCZOS
**down**scale (the downscale *is* the pixelation — ADR-0014), MEDIANCUT-quantizes to
a limited palette, and optical-centers it on a fresh `72×72` transparent canvas. The
forged art is good low-fi pixel art; only its scale + placement were wrong, so no
regeneration is needed. Re-forge only if a source itself fails the low-fi check.

### Consequences

- **Good:** a set of icons reads at one weight; a new icon picks a box + keyline
  class instead of re-inventing a size; the display size lives in one token.
- **Cost:** the keyline table is hand-tuned per shape class (~5 classes); a genuinely
  new shape may need a new keyline — extend the table and mock-and-measure (ADR-0007),
  don't eyeball.
- The carved set is re-packed to `72×72` and conforms today.

## More Information

- **Canon:** Material — [System icons](https://m2.material.io/design/iconography/system-icons.html)
  and [icon keylines](https://m1.material.io/style/icons.html); Helena Zhang —
  [Icon grids & keylines demystified](https://medium.com/@helenazhang/icon-grids-keylines-demystified-4ba07d8b5c63);
  Apple — [HIG: Icons](https://developer.apple.com/design/human-interface-guidelines/icons);
  IBM Carbon — [Icons usage / pixel-grid](https://carbondesignsystem.com/elements/icons/usage/).
- **Related:** ADR-0014 (low-fi / native footprint), ADR-0019 (slot / padding),
  ADR-0007 (mock-and-measure sizing), ADR-0021 / ADR-0022 (role-governed sizes),
  ADR-0016 (single-source registry), ADR-0025 (icon subject/theme).
- **Script:** `frontend/scripts/pack-menu-icons.mjs`.
- **Assets:** `frontend/public/assets/ui/main-menu/icons-carved/{solo-skirmish,campaign-editor,level-editor,lobbies,settings}.png` (each `72×72`).
