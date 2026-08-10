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

# ADR-0556: Main-menu marks share one ink height and one centre line

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

**Every mark in the main-menu set is fitted to one ink HEIGHT and one centre line, and the set
is carved in a lore material rather than the structural blue.**

- **One height.** A mark's ink is scaled until it is **exactly 52px tall** on
  [ADR-0026](0026-ui-kit-icon-canvas.md)'s canonical 64×64 canvas. Width follows the aspect and
  is bounded only by the canvas. 52/64 = 0.8125 sits inside the 62–84% band
  `ApparatusRailTab`'s `'inset'` mark canvas assumes, so the seat keeps drawing the whole asset
  at `--settings-tab-icon-size` and gains no new rule.

  Height, and **not** the long axis. Pinning the long axis equalizes size but not vertical
  padding: a mark wider than it is tall spends the box on its width and comes back short, so it
  sits with more air above and below it than its neighbours. Measured on the live rail, that was
  14.6px of padding on the wide Lobbies mark against 5.6px on its neighbours, and 6.3px on the
  slightly-wide Editor. The rail stacks five marks in a column against a shared button frame, so
  the gap above and below each mark is the thing the eye compares. Pinning the height makes that
  gap identical for every mark in the set by construction — measured 5.625px above and below,
  on every mark.
- **A subject too wide for that height is refused, not shrunk.** Shrinking it is exactly the
  unequal padding this rule exists to remove. Three marks in a row become three upright marks;
  the packer names the file and the width it came out at.
- **One centre.** The ink box is centred on the canvas centre on **both** axes, and both ink
  dimensions are pinned **even** so that division is exact — an odd dimension against an even
  canvas resolves half a pixel off and leaves one more row of margin on one side. Vertical
  placement is derived from the glyph's own pixels, never from a hand-tuned nudge; the old
  `nudgeY` column is deleted. Centring is frozen as the asset's transparent padding, so
  downstream centres naively and gets it for free (this clause of ADR-0027 §D stands).
- **The button centres its own row.** Both rail heights were computed against a 2px border —
  "border(4) + 2·padding + icon slot(40)" — but the panel-line border-image resolves to **7px** a
  side, leaving a 30px content box around a 40px icon row. The row overflowed the whole 10px
  downward, seating every mark and label 5px below its button's centre line on every rail in the
  family. `.settings-tab` now centres its track (`align-content: center`) rather than re-deriving
  a padding number, because the border-image width is the thing that moved once already.
- **Verified on the written bytes and on the live rail.** `pack-menu-icons.mjs` measures every
  file it produces with the same `inkBounds` primitive `trim-icon-margin.mjs` and the title-bar
  seat gate use, and fails when the ink is not exactly 52px tall or when the margins above and
  below (or left and right) differ at all. A fit nobody can check is a fit that drifts on the
  next regeneration.
- **Material is per-object, and that is the whole of the rule.** The set leaves structural blue,
  and each mark is then drawn in the materials its own object is actually made of — steel and
  brass on the sword, parchment and wood on the map, bone and ebony on the pawns, leather and
  brass on the handbook, iron on the cog. This is
  [ADR-0035](0035-semantic-ui-icons-carry-a-private-anti-story-anchor.md)'s standing rule
  ("material palette **per-image** … never a forced UI-blue"), and the precedent the kit's
  wooden `lyre` beside its bronze `bell` already set.

  Written down because the first pass got it backwards: the marks were regenerated as one
  material across all five (a limestone set, a bronze set, a pewter set), which is the same
  constraint the retired blue stone imposed, in a different hue. A family made of one material
  is not what holds this set together — the canvas, the ink height, the centre line and the
  low-fi treatment are. **A uniform material across the set is a defect, not a style.**
- **Enchiridion gets a mark of its own family**, at
  `ui/main-menu/icons-carved/enchiridion.png`, instead of borrowing the shared kit
  blueprint glyph that other surfaces also draw.
- **The set is the unit of review and of installation.** A mark can only be judged against the
  other four it stands beside, so candidates are mounted as whole rails through the real
  `ApparatusRailColumn`/`ApparatusRailTab` primitive at `/studio?menuIconReview=1`, and
  installing accepts all five slots in one act.

### What this costs, stated plainly

One height does **not** equalize optical mass, and ADR-0027 was right that it does not: a wide
mark at the same height carries more ink than a narrow one. That is the accepted trade — equal
size and equal padding, judged on the rail, over equal mass computed per shape.

The rule also **constrains the subjects**. A mark's arrangement now has to fit roughly inside the
canvas at 52px tall, which is why Lobbies is three upright marks rather than three in a row: the
row is 108px wide at that height and the packer refuses it. This is the intended direction of
pressure — the lever is the subject, never a per-icon target number, because per-icon numbers are
what made the column read as five sizes.

## Consequences

- The rail reads at one size and one centre line, every mark carries the same 5.6px above and
  below it, and a regenerated mark cannot silently change either without failing the packer.
- Centring the rail button's own row fixes the same 5px drop on every rail in the family —
  Settings, Editor, Play, Enchiridion and the Strategikon rails all move their mark and label
  onto the button centre line, which is what their fixed heights always meant.
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
