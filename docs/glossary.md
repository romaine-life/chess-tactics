# Glossary

Canonical, engine-attested vocabulary for the asset catalog
(`frontend/src/asset-catalog.json`, browsed at `/design/assets`). Every term is
backed by Unity, Unreal, or Godot documentation (or marked *project* where it is
our own organizational term). See `docs/asset-terminology.md` for longer
explanations and citations.

**Two structures, kept separate:**

- The **catalog** is an **inventory of assets sorted by type** (Buttons, Icons,
  Board, Pieces…). It holds *assets*, not buttons.
- A **button** is a **widget** — a *composition* of assets (9-slice + icon +
  label + action), assembled at runtime. A widget is **not** an inventory item.

| Term | Asset? | Definition | Authority |
|---|---|---|---|
| **asset** | — | A reusable image + contract the game operates on (renders, state-switches, slots into, swaps). | Unity / Unreal |
| **9-slice** | yes | A texture that scales while its corners stay fixed and the middle stretches; the reusable, icon-less button/panel background. | Unity "9-slicing" / Godot `NinePatchRect` |
| **icon** | yes | A standalone image composited into a slot. | universal |
| **sprite atlas** | yes | One image packing several unrelated sprites (our source `*.png` sheets). | Unity "Sprite Atlas" |
| **catalog** (asset inventory) | — | The library of all assets, browsed sorted by type. Holds assets, not widgets. | project (cf. Unreal Content Browser) |
| **type** (category) | — | An inventory shelf — a kind of asset (9-slice, icon…); the catalog tree's top levels. | project |
| **state** | — | A named visual variant of a 9-slice/widget: `normal`, `pressed` (later `highlighted`, `selected`, `disabled`). | Unity UI transitions |
| **slot** (named slot) | — | A labelled region of a 9-slice filled at runtime by an asset (icon) or live text: `iconSlot`, `textInset`, `arrowSlot`. | Unreal UMG |
| **rect** | — | A pixel rectangle `{x, y, w, h}`; a state's or slot's bounds. | Unity `Rect` / Godot `region_rect` |
| **patch margins** | — | The fixed border thicknesses of a 9-slice — the parts that don't stretch. | Unity / Godot |
| **widget** | no | An interactive element the player manipulates (a button); assembled at runtime from assets — not a stored asset. Also "control". | Unreal UMG / Wikipedia |
| **template** | no | The reusable definition a widget instance is built from. | Unreal "UI Template" / Unity "Prefab" |
| **instance** | no | A specific live widget produced from a template (the on-screen "Solo Skirmish" button). | all engines |

## Worked example

The on-screen **"Solo Skirmish"** button is a **widget** =

- the `button-9slice.main-menu` **9-slice** (in its `pressed` **state**), plus
- the `button-icon.main-menu.sword` **icon** (in the `iconSlot`), plus
- the live **label** "Solo Skirmish" (in the `textInset`), plus
- the `party` **action**.

The 9-slice and the icon are **assets** that live in the **catalog**, each on its
own type shelf (Buttons, Icons). The button itself is **not** in the catalog — it
is a widget, composed from those assets at runtime.
