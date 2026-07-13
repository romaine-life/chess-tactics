---
status: "accepted; asset-storage clauses superseded by ADR-0085"
date: 2026-07-04
deciders: Nelson, Claude
---

# ADR-0066: The title-bar rule is a forged TILESET — shared-rivet runs, orientation-lit straps, distinct joints

Extends [ADR-0037](0037-title-bar-full-bleed-bottom-rule.md) (the full-bleed bottom rule is a
forged nailhead band). Builds on [ADR-0011](0011-chrome-art-generated-not-extracted.md) /
[ADR-0013](0013-transparency-chroma-key-via-subscription.md) /
[ADR-0014](0014-ui-chrome-low-fidelity-aesthetic.md) (chrome is codex-generated, method-verified,
chroma-keyed + low-fi, never code-drawn) and [ADR-0012](0012-nine-slice-frames-are-atom-assembled.md)
(chrome is assembled from generated atoms). Serves [ADR-0042](0042-title-bar-is-an-invariant-screens-add-slots.md)
(the invariant trailing cluster).

## Context and Problem Statement

ADR-0037 gave the title bar a single **horizontal** forged riveted rule along its bottom edge. We
then wanted a **vertical** rule too — a "wall" that locks the invariant account/settings cluster
(ADR-0042) off from the contextual controls to its left. That turned the one-off bottom rule into a
small **rule system** (a horizontal run, a vertical run, and the junction where they meet), and two
problems surfaced that we kept tripping over:

- **Rotation side-lights the art.** The bar is lit from straight above. A rivet is a 3-D dome that
  glints on **top**; a horizontal strap is a ledge whose **top edge** catches light. "Making a
  vertical strip" by rotating the horizontal one swings both highlights onto a **side** — visibly
  wrong. Lighting is genuinely orientation-dependent, so one rotated asset can't serve both.
- **Separate generations drift.** Forging an independent horizontal and vertical strip — even from
  the same seed, same prompt — yields two strips whose rivets differ in size/grain/contrast, so they
  read as *two different arts* sitting next to each other, not one rule turning a corner.
- Earlier attempts also **code-drew** the vertical rail (a Pillow script — a hard ADR-0011
  violation) and modeled the junction as a **plate laid over the seam** or a **colour-merge**,
  neither of which is a real forged joint.

## Decision Outcome

**The title-bar rule is a forged TILESET assembled from codex-generated atoms** (method-verified per
ADR-0011/0013, composed per ADR-0012 — no drawing):

1. **One shared RIVET atom** (`atom-rivet.png`), placed **upright** in every piece — both runs and
   the square's corners. Because it is never rotated, it always glints on top, and because it is the
   *same pixels* everywhere, the rivets cannot drift between orientations.
2. **Two orientation-lit STRAP atoms** — a **horizontal ledge** (`atom-strap-h`, bright top edge) and
   a **vertical wall** (`atom-strap-v`, symmetric left-right). The strap is the *only* thing that
   changes with orientation, so each axis is lit correctly.
3. The rivet is composited onto each strap (`scripts/compose-titlebar-runs.py`) to make the **run
   tiles**: `band-forged.png` (E-W, `repeat-x`) and `rail-forged.png` (N-S, `repeat-y`).
4. **Two DISTINCT joints:** a **square** intersection cover (`joint-square-forged.png` = plate atom +
   the shared rivet on each corner) that **blocks** the run↔run connection, and a **diamond** centre
   cap (`joint-diamond-forged.png`) on the band. Different shapes for different jobs.

The insight that unlocks it: **split the rivet from the strap.** The rivet is what must stay
*consistent* (share it); the strap is what must be *orientation-correct* (light it per axis). That
resolves the consistency-vs-lighting tension that a single rotated tile (consistent, wrongly lit) and
two independent generations (rightly lit, inconsistent) each got half-wrong.

The intersection joint is an **overlay that covers the crossing**, not a merged/continuous junction:
the band tiles from the screen's left edge and the wall's x shifts with viewport width, so the band's
rivet phase under the wall is not fixed — a continuously-merged ⊥ could not keep its rivets aligned
across widths, whereas a covering square is robust everywhere. The wall is **full-bleed to the top
edge** exactly as the band is full-bleed to the bottom edge (no end-cap; it ends flat), and the
square's bottom is flush with the bar's bottom edge.

### Consequences

- **Good:** one rule that reads as one forged object in any orientation, correctly lit each way; the
  vertical rule is generated art, not code-drawn; the kit is fully reproducible
  (`forge-titlebar-wall.mjs` forges the atoms, `compose-titlebar-runs.py` assembles the tiles).
- **Retired:** `band-studded.png` (app use — superseded by `band-forged.png`; kept only as the
  forge's root style-seed), `ornament-nailstud.png` (replaced by `joint-diamond-forged.png`), and the
  dead exploratory pieces (the code-drawn `rail-studded`, and `joint-boss` / `plate-forged` /
  `joint-tee-forged` / `joint-cross-forged`). A guard (`scripts/check-titlebar-rule-kit.mjs`, wired
  into `npm run check`) fails the build if any of them reappears in `src`, and asserts the wall is
  still rendered by the invariant cluster.
- **Scope:** this refines ADR-0037's single bottom rule into the run+joint system; the bottom rule is
  now `band-forged` (the E-W run) capped at centre by the diamond.

## More Information

- **Components:** `frontend/src/ui/shared/HeaderAccountCluster.tsx` (the `.cluster-wall` element on
  the invariant cluster), `frontend/src/style.css` (`.cluster-wall::before/::after`,
  `.settings-header-frame` band + diamond cap).
- **Forge / compose:** `frontend/scripts/forge-titlebar-wall.mjs` (atoms; a left/right symmetry gate
  rejects any side-lit strap roll), `frontend/scripts/compose-titlebar-runs.py` (assembly).
- **Assets:** `frontend/public/assets/ui/titlebar/` — `atom-rivet`, `atom-strap-h`, `atom-strap-v`,
  `atom-square-plate`, `band-forged`, `rail-forged`, `joint-square-forged`, `joint-diamond-forged`.
- **Related:** [ADR-0037](0037-title-bar-full-bleed-bottom-rule.md),
  [ADR-0011](0011-chrome-art-generated-not-extracted.md),
  [ADR-0012](0012-nine-slice-frames-are-atom-assembled.md),
  [ADR-0042](0042-title-bar-is-an-invariant-screens-add-slots.md). Method gate: [`../kit-forge.md`](../kit-forge.md).
