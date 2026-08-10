---
status: accepted
date: 2026-08-09
deciders: owner (Nelson) + Claude
supersedes:
  - "[ADR-0027](0027-icon-optical-keylines.md)'s per-shape keyline table, for the main-menu set"
refines:
  - "[ADR-0026](0026-ui-kit-icon-canvas.md)"
  - "[ADR-0035](0035-semantic-ui-icons-carry-a-private-anti-story-anchor.md)"
  - "[ADR-0433](0433-leaf-chrome-uses-oak-over-structural-teal-fields.md)"
---

# ADR-0556: Main-menu marks share one ink box and one centre line

## Context

The five carved main-menu marks were placed by [ADR-0027](0027-icon-optical-keylines.md)'s
per-shape optical **keylines**: each glyph scaled to a target picked from its shape class
(blade 56, route-map 52, scroll 48, pawns 48, gear 52 on the 64px canvas). Keylines equalize
optical *mass*, which is the Material/Carbon canon for a dense functional icon set read as
symbols scattered across a screen.

On this rail it produced a column that reads as five different sizes. The installed set
measured 33×56, 52×49, 48×40, 40×40 and 52×50 — a 40px glyph standing directly above a 56px
one. The main menu stacks these five marks in a single vertical column at a fixed 40px seat,
so every mark's nearest neighbour is another mark of the same set: the column IS a size
reference, and any difference reads as an error rather than as equalized weight. The
Enchiridion tab made it worse by drawing a borrowed kit glyph (`ui/kit/icons/design-index.png`)
that belongs to no shape class here at all.

Separately, the marks were carved in dark blue stone. That is the **structural field**
material [ADR-0433](0433-leaf-chrome-uses-oak-over-structural-teal-fields.md) retired from
terminal controls — and a menu mode button is the definition of a leaf control. The marks were
wearing the material of the surface they sit on rather than the material of the thing they are.
[ADR-0035](0035-semantic-ui-icons-carry-a-private-anti-story-anchor.md) already forbids "a
forced UI-blue" for semantic icons; the carved set was the last place still doing it.

## Decision

**Every mark in the main-menu set is fitted to one ink box and one centre line, and the set is
carved in a lore material rather than the structural blue.**

- **One box.** A mark's ink is scaled until its **long axis is exactly 52px** on
  [ADR-0026](0026-ui-kit-icon-canvas.md)'s canonical 64×64 canvas. 52/64 = 0.8125 sits inside
  the 62–84% band `ApparatusRailTab`'s `'inset'` mark canvas assumes, so the seat keeps drawing
  the whole asset at `--settings-tab-icon-size` and gains no new rule. It is also where the two
  largest marks of the retired set already sat — the small ones grow to meet them rather than
  the whole rail changing size.
- **One centre.** The ink box is centred on the canvas centre on **both** axes. Vertical
  placement is derived from the glyph's own pixels, never from a hand-tuned nudge; the old
  `nudgeY` column is deleted. Centring is frozen as the asset's transparent padding, so
  downstream centres naively and gets it for free (this clause of ADR-0027 §D stands).
- **Verified on the written bytes.** `pack-menu-icons.mjs` measures every file it produces with
  the same `inkBounds` primitive `trim-icon-margin.mjs` and the title-bar seat gate use, and
  fails when a long axis is not exactly 52px or a box is off centre by more than half a pixel.
  A fit nobody can check is a fit that drifts on the next regeneration.
- **Material.** The set leaves structural blue. Candidates are generated per
  ADR-0035's material vocabulary — stone, bronze, pewter — one material across all five marks,
  so the rail reads as one family.
- **Enchiridion gets a mark of its own family**, at
  `ui/main-menu/icons-carved/enchiridion.png`, instead of borrowing the shared kit
  blueprint glyph that other surfaces also draw.
- **The set is the unit of review and of installation.** A mark can only be judged against the
  other four it stands beside, so candidates are mounted as whole rails through the real
  `ApparatusRailColumn`/`ApparatusRailTab` primitive at `/studio?menuIconReview=1`, and
  installing accepts all five slots in one act.

### What this costs, stated plainly

A single box does **not** equalize optical mass, and ADR-0027 was right that it does not. A wide
subject fitted to 52px of width is short: three pawns in a row land near 52×29 beside a sword at
39×52, so the Lobbies mark carries visibly less ink than its neighbours. That is the accepted
trade — an exactly equal box, judged on the rail. If the owner later wants the mass back, the
lever is the **subject** (a taller arrangement of the same three pawns), not a return to
per-icon target numbers, because those are what made the column read as five sizes.

## Consequences

- The rail reads at one size and one centre line, and a regenerated mark cannot silently change
  either without failing the packer.
- ADR-0027's canvas (§A), safe area (§B), optical-centring-as-padding (§D), pixel discipline
  (§E) and consumption rules (§F) all stand. Only its §C keyline table is retired, and only for
  this set — a dense functional set on the same canvas still keeps keylines.
- One number, `--box`, now governs the whole set's size; changing it is one edit and one re-pack.
- Marks are no longer a special case of the structural material, so ADR-0433's hierarchy holds
  all the way down to the glyph.

## More Information

- **Packer / gate:** `frontend/scripts/pack-menu-icons.mjs` (fit + verify),
  `frontend/scripts/trim-icon-margin.mjs` (`inkBounds`, shared).
- **Review surface:** `frontend/src/ui/MenuIconReview.tsx`, `/studio?menuIconReview=1`.
- **Slots:** `ui/main-menu/icons-carved/{solo-skirmish,campaign-editor,lobbies,enchiridion,settings}.png`.
- **Related:** ADR-0026 (canvas), ADR-0027 (the keylines this narrows), ADR-0014 (low-fi /
  the downscale is the pixelation), ADR-0035 (subject + material, no forced UI-blue),
  ADR-0433 (leaf vs structural material), ADR-0076 (native 1× production art).
