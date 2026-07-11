---
status: accepted
date: 2026-07-04
deciders: owner (Nelson) + Claude
---

# ADR-0065: The Editor is a settings-twin at `/editor`; the level editor nests at `/editor/level`

## Context and Problem Statement

The main-menu **"Editor"** button opened `/campaigns-next` — a **bespoke** surface
(`CampaignEditor.tsx`) built from its own `.ce-*` chrome: a three-panel (campaigns | levels /
details | live preview) grid plus a separate footer bar. It was the last top-level surface that
did NOT follow the app's one shared shell. Two problems compounded:

1. **The routes didn't match what the user sees.** What the player calls "the editor" was routed
   `/campaigns-next`; the level editor it drills into was `/edit` / `/level-editor` — an unrelated
   name, not obviously *inside* the editor.
2. **The layout was a bespoke parallel** of the settings/menu rail+content shell — exactly the
   class of drift [ADR-0059](0059-reuse-the-canonical-primitive-not-a-bespoke-parallel.md) names a
   defect, and unlike the play-side Campaign screen (already a settings-twin), it forked the chrome.

## Decision Outcome

**1 — Route naming.** The canonical routes are:

- **`/editor`** — the Editor (formerly `/campaigns-next`). The main-menu "Editor" tab points here.
- **`/editor/level`** — the level editor nested inside it (formerly `/edit`). Existing levels
  reach it through "Edit Board"; the Editor rail's pinned "New Level" action opens it directly as
  a blank, standalone board that can be assigned to a campaign later.

Legacy paths (`/campaigns-next`, `/campaigns`, `/edit`, `/level-editor`) stay as **aliases** (the
router + `routeSurfaces` + `titleBarConfig` + `routePrefetch` accept both) so bookmarks/tests keep
working; every *internal* producer emits the canonical name, so the address bar reads `/editor`.

**2 — The Editor is a settings-twin.** It adopts the shared shell — the one continuous
`HomepageBackdrop` ([ADR-0064](0064-homepage-backdrop-is-one-continuous-instance.md)) behind one
`ArtRouteChrome className="settings-shell"`, split into a left
`.settings-rail-frame` (a rail of campaign `.settings-tab`s + a pinned workspace-verb footer) and a
right `.settings-main-frame` (a single scrolling column of `SettingsSection`/`SettingsRow` groups
with the live board preview pinned at the top). It is now the **fourth member** of the
menu · Settings · Campaign · Editor family, mirroring `Campaign.tsx`. This **supersedes the bespoke
`campaign-editor/*` panel-art chrome direction** in `campaign-editor-art-feature-contract.md`; the
reused settings surfaces are real 9-slice kit art (`panel.png` / `panel-line.png` / `mode-button.png`),
so the contract's "no CSS imitation of rendered chrome" non-negotiable is still honored — better, in
fact. All behavior (tier-scoped save/publish, official read-only/admin gating, unassigned levels, the
data-backed `ViewPane` preview, confirmations) is preserved; only the chrome moved.

**3 — The shared control primitives are extracted.** `SettingsSection` / `SettingsRow` /
`SettingsButton` moved from inside `Settings.tsx` to `ui/shared/SettingsControls.tsx`, imported by
BOTH Settings and the Editor — so the Editor composes the canonical controls instead of a local
copy (the ADR-0059 rule: a missing-but-needed primitive is made shared + registered, not inlined).

This is an instance of [ADR-0059](0059-reuse-the-canonical-primitive-not-a-bespoke-parallel.md)
(reuse the canonical shell) and a sibling of
[ADR-0062](0062-settings-twin-rail-is-placed-by-one-shared-rule.md) (the settings-twin rail family).

### The one divergence from the settings pattern

The campaign rail is a **dynamic, unbounded** list (unlike Settings' fixed four tabs), so it adds a
`KitScroll` + a pinned footer of workspace verbs — the one thing the fixed-tab settings rail has no
analogue for. The content keeps a single scrolling column (not a second board column) with the live
preview pinned above it: faithful to "rail + one content column," and it gives the board and level
rows the full frame width.

### Consequences

- Good: one consistent shell across every top-level surface; the routes name what the user sees; the
  Editor can't drift a bespoke parallel again (it IS the shared shell).
- Not in conflict with [ADR-0033](0033-board-plus-control-panel-layout.md): that governs
  board/canvas + controls screens — i.e. the **level editor**, which keeps its clean-board +
  right-side-control-panel shape. Only its ROUTE moved (to `/editor/level`).
- Follow-up: the now-dead `.ce-*` layout-scaffold CSS (the retired three-panel/footer classes) is
  harmless but should be pruned.

## More Information

- Route registries: `App.tsx` (renderRoute), `ui/routeSurfaces.ts`, `ui/shell/titleBarConfig.ts`,
  `ui/routePrefetch.ts`, `ui/MainMenu.tsx` (`MODE_HREFS`).
- Component: `ui/CampaignEditor.tsx` (renders the settings-twin), `ui/shared/SettingsControls.tsx`
  (the extracted primitives), `ui/Campaign.tsx` (the precedent it mirrors).
- Contract updated: `docs/campaign-editor-art-feature-contract.md` (live route + chrome direction).
