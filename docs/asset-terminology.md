# Asset Terminology

Canonical vocabulary for the asset catalog (`frontend/src/asset-catalog.json`,
explored at `/design/assets`). Use these terms consistently in code, docs, and
the catalog UI. Pairs with `docs/asset-generation-contract.md` (which decides
*what* becomes an asset) and `docs/asset-pipeline-proposal.md` (how art is
normalized into assets).

## The core split: asset vs. assembly

- **Asset** — a reusable, catalogued piece the game *operates on*: it renders,
  state-switches, places, slots things into, or swaps it. Stored as data — an
  image plus a contract (states, slots, rules). **Frames and icons are assets.**
  The test for "is this an asset?" is the *Convert To Assets* rule in
  `asset-generation-contract.md`: if the game places, repeats, recolors, counts,
  selects, hides, state-changes, or layers it, it is an asset. A fixed backdrop
  nobody interacts with is *not* an asset — it is art (a picture).

- **Assembly** — what the player actually sees and clicks, built **at runtime**
  by combining assets with live data. It is **not** an asset; nothing stores it
  as a single image. A menu button is an assembly.

Rule of thumb: if you can put it in the catalog and the game renders it as a
unit, it's an asset. If it only exists once you combine assets + live values,
it's an assembly.

## Asset roles

Every asset has a **role**, encoded as the first segment of its id/type:

- **Frame** (`button-frame.*`) — a stateful **template**: the reusable body of a
  UI element. It owns the *shared* structure and behavior — **states**, a
  **hitbox**, and **slots** — but carries **no** per-instance content. It is the
  closest thing to "the element's class." Example: `button-frame.main-menu`.

- **Icon** (`button-icon.*`) — a self-contained **part** that *fills a slot*.
  Example: `button-icon.main-menu.sword`.

Frames are *containers*; icons are *fills*. Both are assets.

## Anatomy of a frame

- **State** — a named visual variant the game switches between: `unpressed`,
  `pressed` (later `disabled`, `hover`). One frame, many states.
- **Slot** — a named region filled at assembly time, by a part asset (icon) or
  by live text (label): `iconSlot`, `textInset`, `arrowSlot`.
- **Bounds** — a pixel rectangle `{x, y, w, h}`. States and slots are described
  by bounds. (In the JSON these fields are historically named `frame`,
  `textInset`, etc.; "bounds" is the generic word. Do not confuse a *state's*
  bounds with the *frame asset*.)
- **Hitbox** — the clickable bounds of the assembled element.

## Assembly = an instance of an element

A **menu button** is an assembly = a frame (in one state) + filled slots + an
action:

| Ingredient | Value (for "Solo Skirmish") | Kind |
| --- | --- | --- |
| frame | `button-frame.main-menu.frame` (state `pressed`) | asset |
| icon | `button-icon.main-menu.sword` | asset |
| label | "Solo Skirmish" | live text |
| action | `party` | code |

"Solo Skirmish" is an **instance** of the *Main Menu Button* element. Today the
instances live in code (`MENU_MODES` in `frontend/src/app.js`). They could later
become data ("recipes") in the catalog if we want non-developers to define or
rearrange buttons without touching code.

## Naming convention

`<role>.<domain>[.<member>]`

- `button-frame.main-menu.frame` — the main-menu button **frame** (template part).
- `button-icon.main-menu.sword` — a main-menu button **icon** (fill part).
- `button.main-menu` — **reserved** for the **assembly** (the whole button); not
  a stored asset today.

Parts use a hyphenated role (`button-frame`, `button-icon`); the bare family
(`button`) names the assembled whole. New part roles (`panel-frame`, `tile`,
`piece`, …) follow the same shape.

## Quick reference

| Term | Asset? | Lives in | Example |
| --- | --- | --- | --- |
| Frame (template) | yes | catalog (data) | `button-frame.main-menu.frame` |
| Icon (part) | yes | catalog (data) | `button-icon.main-menu.sword` |
| State | variant of a frame | the frame's `states` | `pressed` |
| Slot | region of a frame | the frame's `rules` | `iconSlot` |
| Assembly (button) | no | code today (maybe data later) | "Solo Skirmish" |

When in doubt: **frame and icon are assets; the button is an assembly of them.**
