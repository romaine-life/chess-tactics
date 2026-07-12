---
status: "accepted; asset-storage clauses superseded by ADR-0085"
date: 2026-07-04
deciders: Nelson, Claude
---

# ADR-0063: Section dividers are a 1-D horizontal "bar" kit primitive that tees into the frame rail; N per panel, placed by one shared rule

Extends the atom-assembled 9-slice kit ([ADR-0012](0012-nine-slice-frames-are-atom-assembled.md))
and its single-source registry ([ADR-0016](0016-single-source-nine-slice-registry.md)) to a
shape the 9-slice model can't express: a horizontal separator **inside** a frame. Reuses the
canonical primitive rather than a parallel one ([ADR-0059](0059-reuse-the-canonical-primitive-not-a-bespoke-parallel.md))
and honours "every visible surface is kit" ([ADR-0032](0032-no-bland-html-css-every-surface-is-kit.md)) —
a divider is a baked kit asset, never a raw `<hr>`/`border-top`.

## Context and Problem Statement

We wanted to split a framed panel into stacked sections with one or more horizontal
separator bars — a simple UI/UX divider, and ideally **N** of them at arbitrary positions.

CSS `border-image` (the mechanism the whole kit rides on, [ADR-0002](0002-nine-slice-border-image-for-pixel-art-chrome.md))
slices a source PNG into an immutable **3×3 grid**: four fixed corners, four tiled edges,
one center. That is the entire expressive range — there is no fourth row, no way to place a
bar at an interior offset. So a mid-frame separator **categorically cannot** be part of the
panel's own `border-image`, and baking dividers into a taller panel PNG is a non-starter (N
and their positions aren't known at bake time; it is the combinatorial per-variant trap
[ADR-0034](0034-nine-slice-line-frames-for-surface-fill.md) already rejected). A divider must
be its own rendered thing, layered into the panel.

The open question was **how the bar meets the frame** ("three-way" / tee junction). The first
instinct was to forge new corner atoms for the T. Inspecting the atoms showed that is
unnecessary: the panel rail is the 2px cool `edge` atom, and a tee is that same rail meeting
itself at a right angle — constructible, not paintable.

## Decision Drivers

- **N, arbitrary positions, at runtime** — not a fixed baked layout.
- **Reuse the canonical primitive** — a divider should ride the registry/bake/parity path,
  not a bespoke parallel ([ADR-0059](0059-reuse-the-canonical-primitive-not-a-bespoke-parallel.md)).
- **Rail-weight, consistent-by-construction** — the tee must share the frame's exact rail
  pixels so it can't drift, the same guarantee ADR-0012 gives corners.
- **One placement rule** — teeing into the rail must not become per-surface pixel-fiddling
  (the [ADR-0062](0062-settings-twin-rail-is-placed-by-one-shared-rule.md) instinct).

## Decision Outcome

A section divider is a **1-D horizontal "bar" kit asset** (`panel-divider`, registry
`kind: "bar"`), rendered as a **child element in the panel's content flow**, one per separator.

> **Prior art, kept distinct.** The settings kit already had `section-divider-frame.png` — a
> **baked, stretched horizontal rule with an end ornament** (an inline decorative rule under a
> heading; kit-standard type 10's "source today"). That is a *different* element from what was
> asked for here: a **structural rail-weight crossbar that tees into the panel's own frame** and
> divides it into rows. So `panel-divider` is a **new** asset, not a rename of that one, and does
> not touch it. (An unrelated 10×12 `divider.png` also predates this and is left alone — hence the
> `panel-` prefix.)

### A. A rail-junction family, derived from the `corner` atom

The frame's `corner` atom IS the full junction treatment — steel rail turning + notch + gold
bracket — for ONE concave angle. Higher-order junctions are just that atom **mirrored into each
concave angle they contain**, sharing the through-rails. So the kit gains a **rail-junction
family**, every member derived from the one `corner` atom and matching the frame corners *by
construction* (same rail, same notch, same gold — no separately-painted or forged junction atom
to drift):

- **`corner`** — 2-way (L), one concave angle. The frame's own corner (exists).
- **`tee`** — 3-way (T), two concave angles = `corner` + `flipV(corner)` sharing a through-rail
  (`composeTee`). Registry `kind: "junction"`, `sides: "NSE"`.
- **`cross`** — 4-way (+), four concave angles = the corner in all four quadrants (`composeCross`).
  `kind: "junction"`, `sides: "NSEW"`. Banked for the first grid/table that needs it.

This is ADR-0012's one-corner-mirrored, generalized from a box (four *convex* corners) to
interior junctions. `junction` assets carry no per-corner/pipe geometry, so they keep a
self-contained bake path (`bakeJunction`) and never touch the frame normalizer.

### B. The divider seats a three-way **tee atom** at each end

`buildBarFromTee(edge, tee, W)` — the `panel-divider` (`kind: "bar"`) — is a full-width branch
rail (the top-middle `panel-line.png` slice, scaled to the host frame width) carrying a three-way
**tee atom** at each end (the tee + its `flipH`). The tee uses the full authored atom coordinate
frame, transparent padding included, so the divider tees into the panel's side rail exactly as a
frame corner reads, just branched. The bar's height is the tuned `dividerH`, never less than the
scaled tee height.

> **Revision (2026-07-04): the tee is authored, not derived.** The tee was first *derived* from the
> `corner` atom by mirroring (`composeTee` = `corner` + `flipV`, §A). In review the derivation never
> read as a clean 3-way: mirroring the corner's 90° gold bracket reproduced the corner **flair** (the
> outer-vertex nub) at a junction that has no outer vertex, and rescaling it to the rail weight broke
> the pixels. So the divider's cap is now a **hand-authored atom** — `corner-t.png` (24px source):
> the frame's gold corner made **symmetric with the flair removed**, used in its full authored atom
> coordinate frame (mirrored L/R), not composed.
> `buildBarFromTee` uses it directly (registry `atoms.tee: "corner-t"`); `composeTee`/`composeCross`
> remain only for the standalone derived `tee`/`cross` glyphs (§A). The cap width is the full
> authored atom width after the tuned `scale` is applied, so preview and production share one
> coordinate system.

### C. Registry-declared, parity-tested (ADR-0016)

`panel-divider`, `tee`, and `cross` are each one registry entry; `buildAsset` bakes their PNGs and
the bake-parity test (`src/ui/design/nineSliceBake.test.ts`) re-bakes and asserts byte-equality
like every other kit output. The divider also has a **geometry guard** (a **tall vertical spine** in
each cap — the authored spine tapers at its tips, so it spans most, not all, of the height — the
branch spanning the full width, a hollow interior, a **gold tee in each cap** and none in the middle,
and **horizontal** mirror symmetry so the two ends are twins) — so a change to `buildBarFromTee` or
the `edge`/`corner-t` atom can't silently break the junction. Because `bar`/`junction` assets have no
per-corner degrees of freedom, they are **excluded from the 4-corner 9-slice editor and its catalog
edit-link** (nothing to nudge); the divider is calibrated as a live in-panel preview instead
(`frontend/public/kit-portfolio/divider-preview.html`).

### D. Consumed as a 1-D border-image, placed by ONE rule

The consumer is the `.kit-divider` class (`src/style.css`): a horizontal 1-D `border-image`
(`url(panel-divider.png) 0 cap 0 cap fill / 0 cap`), the 90°-rotate of the scrollbar's vertical
1-D slice. The cap is `barCapWidth('panel-divider')` = the full authored T atom width after applying
the tuned scale, matching the Divider Studio's authored-atom coordinate system. The transparent
padding around `corner-t.png` is part of the seating coordinate, just like the corner atom's
transparent padding is part of the corner/frame relationship. The shipped tuning comes from
`config/nine-slice/panel-divider.json`: `frameWidth` is the host frame width the preview was tuned
against, `reach` is the horizontal bleed from the host content box to the rail, `scale` sizes the
authored tee, `jx` seats the authored atom horizontally over the branch rail, `jy` seats the tee
vertically against the branch, and `dividerH` preserves the tuned strip height.

The branch rail is not the raw `edge.png` atom. It is the top-middle slice of `panel-line.png`
(`border-image-slice: 24`) scaled to `frameWidth`, then tiled. This is deliberately the same
horizontal pipe treatment as the surrounding panel frame; the tee is the authored junction cap
seated onto that pipe.

Those values are exported to `src/generated/nine-slice.css` as `--kit-panel-divider-*` variables.
The single placement rule: the divider **bleeds out horizontally by the tuned reach**
(`margin-inline: calc(-1 * var(--kit-divider-reach))`), falling back to `--frame-w` for older
consumers. A host opts in by declaring `--kit-divider-reach` (usually the generated
`--kit-panel-divider-reach`) and dropping `<div class="kit-divider">` between sections. N dividers =
N elements; DOM flow gives arbitrary count and vertical position for free.

### Consequences

- **Good:** any kit-framed panel gains N separators with one child element each and one
  `--kit-divider-reach` declaration; the junction can't drift (one authored `corner-t` atom, mirrored, parity
  + geometry tests) and the authored atom coordinate frame is preserved from Studio to production.
- **Good:** the payoff is a reusable rail-junction vocabulary (`corner`, the authored `corner-t`
  tee, the derived `tee`/`cross`) plus a general 1-D `bar` primitive; `cross` is banked for the
  first grid/table.
- **Cost:** the registry now has two composed-from-atoms shapes (`bar`, `junction`) beside the
  4-corner frame, so the consumers (bake, editor, catalog) branch on `kind` — the editor and
  catalog simply skip them. `--kit-divider-reach` is a small contract a host must honour to reach the rail.
- **Cost:** the tee is **hand-authored art** (`corner-t.png`), not derived — the one place the kit
  drew a junction glyph by hand rather than falling out of the corner. The trade bought a clean,
  flair-free, crisp 3-way that the mirror-derivation couldn't produce (§B revision).

## More Information

- **Junction family:** `composeTee` / `composeCross` (mirror the `corner` atom into each concave
  angle) + `bakeJunction` + the `kind: "junction"` branch in `frontend/scripts/nine-slice-kit.mjs`;
  assets `tee`, `cross` in `frontend/config/nine-slice-registry.json`.
- **Divider:** `buildBarFromTee` (authored cap) / `buildBar` (legacy derived) / `bakeBar` /
  `barCapWidth` + the `kind: "bar"` branch; asset `panel-divider` (`atoms.tee: "corner-t"`).
- **Assets:** `frontend/public/assets/ui/kit/{panel-divider,tee,cross}.png`; the authored tee atom
  `frontend/public/assets/ui/kit/atoms/corner-t.png`.
- **Consumer:** `.kit-divider` + the `--frame-w` contract in `frontend/src/style.css`.
- **Inspector:** the interactive divider Viewer (`frontend/src/ui/DividerViewer.tsx`, a Studio
  Viewer kind reached by clicking its asset card per [ADR-0058](0058-every-route-is-click-reachable.md))
  — assemble the panel, swap atom/codex caps, tune seat/align, export the placement.
- **Preview / calibration:** `frontend/public/kit-portfolio/divider-preview.html`.
- **Parity + geometry guard:** `frontend/src/ui/design/nineSliceBake.test.ts`.
- **Related:** ADR-0002 (border-image mechanism, and why it can't hold an interior bar),
  ADR-0012 (consistent-by-construction atoms — the tee is one), ADR-0016 (single-source
  registry — the bar is one entry), ADR-0034 (why not a per-variant baked frame),
  ADR-0059 (reuse the canonical primitive), ADR-0032 (every surface is kit).
