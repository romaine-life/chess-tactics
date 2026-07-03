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
2. **Grain: per-control, REQUIRED.** Every individual tuning control (each slider, each
   number field, each toggle) ships its own ↺ that resets JUST that control to its saved
   value — not only one whole-surface button. The reference is SurfaceDressingRoom and the
   page tuners: per-knob ↺ via `SliderRow`'s `dflt` / `ctlReset` primitives in
   `frontend/src/ui/dressing/SliderRow.tsx`; a bespoke dark lab (PropLab) matches the
   pattern in its own idiom (`pl-mini-reset`). Disable the ↺ when the control is already at
   its saved value, so it doubles as a per-control dirty light. A whole-surface "Reset all"
   is layered ON TOP for convenience (and, where the surface has element groups, a
   per-element reset in between) — but it never replaces the per-control resets. Place the
   surface-level Reset in the same action row as Save/Copy.
3. **The baseline must be derived, not transcribed**: import the committed module
   (PropLab ← `propSeats.json`, PortraitEditor ← `portraitCrops.json`; SfxLibraryStudio ←
   `ARRIVAL_BAKED` in `sfx.ts`, the same constant the game consumes), measure the live
   surface (SurfaceDressingRoom), or fetch the on-disk config (NineSliceEditor ←
   `GET /__nine-slice/config`). If a baseline can ONLY be a hand-mirrored constant
   because the shipped value lives somewhere unimportable (CSS source — PagesLibraryStudio's
   `MM_LIVE` mirrors `style.css`), it must ship a derive-and-compare test that reads the
   shipped source and fails when they disagree (`ui/dressing/mmLive.test.ts`). A bare
   mirrored constant with only a comment is not enough — it rots silently.
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
- Good: audit (2026-07-03) brought the gaps up to the contract — NineSliceEditor gained
  "↺ Reset to saved config" (the `0` d-pad button remains, labeled as zero-out),
  ArtworkCompare gained per-pane "↺ Reset" to the curated/baked CSS baseline, and
  DoodadEditor's Load (its reset-to-saved) now fetches `cache: 'no-store'` so it can no
  longer serve a stale composition right after Save.
- Good: the per-control (req 2) sweep — PropLab (anchor X / anchor Y / scale),
  SfxLibraryStudio (each terrain row + arrival sound/volume/firing), and NineSliceEditor
  (bracket / content inset / fill inset) each got a per-control ↺ that resets only that
  control to its saved value and disables when already there (a per-control dirty light),
  with a whole-surface "Reset all" layered on top. The dressing rooms + page tuners
  already complied via `SliderRow`/`ctlReset`. This was the gap the first draft's
  "optional on top" wording let through — the reference lab itself (PropLab) shipped
  without per-control resets.
- Good: the two hand-mirrored baselines the audit flagged as rot risks are now closed.
  The SFX panel's arrival baseline derives from a new `ARRIVAL_BAKED` constant in
  `sfx.ts` that `playArrival` + the deploy roll-call (`game/store.ts`) actually consume,
  so it is the single source. The Pages/menu tuner's `MM_LIVE` moved to
  `ui/dressing/mmLive.ts` with `mmLive.test.ts`, which re-derives every value out of
  `style.css` and fails CI the moment the shipped rule and the constant disagree.
- Cost: new tuning surfaces must wire a baseline source before they ship controls. Where
  a baseline can only be a mirrored constant (can't import the shipped value), it needs
  a derive-and-compare test like `mmLive.test.ts` so it can't rot silently.

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
