---
status: accepted
date: 2026-07-03
deciders: owner (Nelson) + Claude
---

# ADR-0057: Studio tuning surfaces ship Reset-to-committed-baseline

## Context and Problem Statement

Studio/dev-tool surfaces keep growing tuning controls — prop seats (/prop-lab), 9-slice
offsets, portrait crops, page-chrome dressing rooms, SFX assignments. Each holds draft
state that drifts from a committed baseline (a checked-in JSON/TS module, the shipped CSS,
or baked game code). The owner has repeatedly had to ask, surface by surface, for a way
back to the saved values; the convention existed in most editors but was never written
down, so new tools (and refactors of old ones) kept shipping without it — or worse, with a
misleading one (the 9-slice editor's `0` button reset to *all zeros*, which is not any
frame's saved state, and there was no way back short of a full page reload).

## Decision Drivers

- The owner tunes by eye and experiments freely; an experiment must always be one click
  away from "what actually ships", or the tool punishes exploration.
- "Reset" must mean the same thing on every surface — restore the COMMITTED baseline —
  or muscle memory turns destructive.
- Baselines that are hand-copied constants silently rot when the shipped value changes,
  making Reset restore the wrong state.

## Considered Options

- Codify: every tuning surface ships Reset-to-committed, at the selected-item grain.
- Status quo: add reset buttons when asked, surface by surface.

## Decision Outcome

Chosen: **codify the Reset contract**. Every Studio surface with TUNING state must ship:

1. **Reset restores the committed baseline** — the checked-in file / shipped code the
   surface's Save/Copy flow feeds — never a zero state or an arbitrary default.
   "Zero out" may exist as a separate labeled control, but it is not Reset.
2. **Grain: the selected item** (the prop, the frame, the piece, the element), placed in
   the same action row as Save/Copy. A whole-surface "Reset all" is optional on top
   (SurfaceDressingRoom and the page tuners are the model for multi-grain resets:
   per-knob ↺ via `SliderRow`'s `dflt` / `ctlReset` primitives in
   `frontend/src/ui/dressing/SliderRow.tsx`, then per-element, then reset-all).
3. **The baseline must be derived, not transcribed**: import the committed module
   (PropLab ← `propSeats.json`, PortraitEditor ← `portraitCrops.json`), measure the live
   surface (SurfaceDressingRoom), or fetch the on-disk config (NineSliceEditor ←
   `GET /__nine-slice/config`). A hand-mirrored constant (SfxLibraryStudio's
   `DEFAULT_ARRIVAL`, PagesLibraryStudio's `MM_LIVE`) is a last resort and must carry a
   comment naming the shipped source it mirrors — it rots silently otherwise.
4. **Reset must compose with external changes.** Drafts live as OVERRIDES on top of the
   committed baseline where practical (PropLab's model: equal overrides auto-drop, so a
   save from another tab or a git pull flows through instead of being shadowed). At
   minimum, Reset must re-read the current baseline, not a mount-time snapshot.

TUNING state = state that shapes an asset/config and has a committed baseline. VIEW state
(zoom, seed, search, filters, selection, playback) does not require Reset — don't invent
buttons for it.

Rejected the status quo: it is the loop this ADR exists to end.

### Consequences

- Good: one muscle-memory contract across every editor; exploration is always safe.
- Good: audit (2026-07-03) brought the three gaps up to the contract — NineSliceEditor
  gained "↺ Reset to saved config" (the `0` d-pad button remains, labeled as zero-out),
  ArtworkCompare gained per-pane "↺ Reset" to the curated/baked CSS baseline, and
  DoodadEditor's Load (its reset-to-saved) now fetches `cache: 'no-store'` so it can no
  longer serve a stale composition right after Save.
- Cost: new tuning surfaces must wire a baseline source before they ship controls.

## Pros and Cons of the Options

### Codify Reset-to-committed

- Good: predictable; reviewable ("where's your Reset and what does it restore?").
- Bad: a little ceremony for tiny tools.

### Status quo

- Good: no ceremony.
- Bad: the owner keeps re-requesting the same control; resets drift in meaning.

## More Information

Audited 2026-07-03 across all Studio surfaces: PropLab, NineSliceEditor, PortraitEditor
(+PortraitLab), DoodadEditor, SurfaceDressingRoom, SfxLibraryStudio, PagesLibraryStudio
(main-menu + campaign-editor tuners), SurfaceLibraryStudio, SurfaceLab, SceneAnimLab,
ArtworkCompare, TileCompare, the three library grids, and the catalog rails. Related:
ADR-0019 (dev-only editor save), ADR-0054 (9-slice editor as calibration bench),
ADR-0033 (board + control panel layout). Forward note: if /scene-anim-lab's tempo ever
gains a save path into `SCENE_ANIMS`, it becomes tuning state and falls under this ADR.
