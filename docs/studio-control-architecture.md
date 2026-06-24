# Studio control architecture

The studio is **one tool** with a single, consistent control architecture across
every mode and category. New things added to it (assets, portraits, …) inherit
this shape rather than inventing their own. This is the spec; the UI must match it.

## Intent (the why everything else serves)

The studio is a **continuous, direct-manipulation workspace**, not a set of
screens you toggle. A **surface** is the persistent thing you work on (the board;
the asset stage). **Focus** is what you're currently attending to within that
surface — and the **controls follow your focus**, they come to *you*. Clicking a
tile on the board focuses you on tiles and brings up the tile controls; the board
never goes away. You never jump between disjoint views:

> **Navigation (mode → surface) decides *where you are*. Focus and its controls
> flow from *what you touch* there.**

So "does picking a focus change the view or the controls?" is the wrong question —
the surface stays put, and the controls are simply what follows focus. Every rule
below serves this: one Controls panel that reflows to your focus, a persistent
surface, and no sub-headers or mode-jumps to break the continuity.

## Stability — the frame never moves

The topbar, the Controls panel, and the main pane are **fixed structural
regions**. Switching mode / category / surface / focus changes what is *inside*
those regions — never their position, size, or whether they exist. The
"Controls" heading sits at the **same place** in Catalog and in Lab. Nothing
slides down; nothing appears in one mode that displaces what's below it in
another. The cascade reflows the *contents* of the Controls panel **in place**;
the panel itself is anchored.

A sub-header — or any element present in one mode and absent in another — is
forbidden, because it shifts everything below it. That displacement is the single
clearest tell of an amateur UI. A serious instrument holds still: you operate it;
it does not rearrange itself under you. **If the layout jumps when you change
modes, it is wrong**, no matter how correct the contents are.

## Layout — the same in every mode

- **Topbar:** brand · **breadcrumb** (where you are) · the **mode** toggle.
- **One Controls panel** (right, fixed width) — the single cascading control unit.
- **Main pane:** content only. The catalog grid, or the lab surface.
- **No sub-headers, no per-pane titles, no "Back" button.** The breadcrumb
  conveys location; the Catalog tab *is* back. A sub-header is always a bug here.

## The control system is a namespaced cascade

Every control is **owned by exactly one node** in the tree below. The Controls
panel renders only the controls along the **active path**. Nothing is a sibling
of the mode toggle except itself, so no control can leak or duplicate across
modes. Depth varies per branch — that's fine; namespacing, not symmetry, is the
rule.

```
mode  (Catalog | Lab)                          ← topbar · tier-1 · always present
│
├─ Catalog
│   └─ category (Tiles | Units | Assets)       ← tier-2 · top of Controls
│       ├─ Tiles  → search · family/collection filters · zoom
│       ├─ Units  → search
│       └─ Assets → search · process filter (All/Forged/Unverified)
│
└─ Lab
    └─ surface (Board | Asset)                 ← tier-2 · top of Controls
        ├─ Board → focus (Board | Tile | Unit) ← tier-3 · each focus = a control set
        │   ├─ Board focus → board-level controls (tools, layers, zoom)
        │   ├─ Tile focus  → tile controls (brush, picker, …)
        │   └─ Unit focus  → unit controls (brush, facing, …)
        └─ Asset → the asset's controls (backdrops, gate/provenance details)
```

## The concepts, named

- **Mode** — Catalog (browse) or Lab (work on a thing). Tier-1, lives in the topbar.
- **Category** — the *kind of thing* you're browsing in Catalog (Tiles, Units, Assets).
- **Surface** — the *workbench* in the Lab. Surfaces group by workbench, **not by
  category**: tiles and units share the **Board** surface (you place both on one
  board), so the Lab has fewer surfaces than the Catalog has categories. Assets
  get their own **Asset** surface.
- **Focus** — *within a surface*, a set of controls scoped to one thing. The Board
  surface has three focuses — **Board / Tile / Unit** — each its own control set
  on the same board. They are **not** surfaces and **not** separate views; they
  are control sets that share the surface.

## Visual standard — instrument-grade, not boxes

Dense and restrained. A tier selector is a tight **segmented control** — one
cohesive unit, small — never a stack of fat full-width buttons that wrap to two
rows. Chrome is quiet: thin borders, compact spacing, a clear figure/ground where
the **surface is the star** and the controls recede around it. Hierarchy comes
from weight, grouping, and whitespace — not from giant boxes all shouting at the
same volume. The reference is a serious instrument (Grafana, a DAW, Figma's
panels), not a form made of big buttons. If a control is large enough to dominate
the surface it serves, it's wrong.

## Adding to the studio

A new thing (e.g. portraits) is: a new **category** in Catalog, and — if it has
its own workbench — a new **surface** in Lab with its own focuses. It inherits
the topbar, breadcrumb, Controls panel, and content-only main automatically. If
adding it requires a new layout, the architecture (not the new thing) is wrong.

**Mechanism — the catalog category registry.** Parity is enforced by code, not
discipline. The Catalog is driven by a single `catalogCategories` array in
`TilePreview.tsx`; each entry is `{ id, label, searchValue, onSearch,
searchPlaceholder, onViewSelected, filter, main }`. The selector tabs, Search,
Zoom, and View Selected are all rendered **by mapping over that array / reading
the active entry** — never by per-category `if`/ternary branches. So adding a
category means adding **one entry**: you supply its `main` (the grid) and an
optional `filter` (its taxonomy control), and you get the selector tab, Search,
Zoom, View Selected, and the stable frame for free. There is no second place to
update, which is the whole point — a category cannot ship missing a shared
control. If you find yourself writing `category === '…'` in the catalog
controls, that's the regression this registry exists to prevent.
