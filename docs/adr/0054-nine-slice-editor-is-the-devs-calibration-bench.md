---
status: "accepted; repo-write and asset-storage clauses superseded by ADR-0081"
date: 2026-07-02
deciders: Nelson, Claude
---

# ADR-0054: The 9-slice editor is the dev's calibration bench — agents build the tool, the dev tunes the pixels

Names the contract behind the dev-only editor of
[ADR-0019](0019-dev-only-nine-slice-editor-save.md) and updates two of its
load-bearing rules that the split-layer rework overturned. Also amends
[ADR-0012](0012-nine-slice-frames-are-atom-assembled.md)'s canonical-assembler
pointer.

## Context and Problem Statement

The kit frames are the app's design system ([ADR-0032](0032-no-bland-html-css-every-surface-is-kit.md)):
a handful of atoms assembled into every piece of chrome, consumed by many screens
from one baked PNG. That pipeline has three stations — AI paints the atoms,
the kit assembles them mechanically, and a **human eye** judges seating, weight,
and proportion. The third station is the 9-slice editor.

The division of labor was implicit and kept being violated in both directions:
agents hand-editing frame configs (a synchronous round-trip per pixel, ADR-0019's
original complaint), and — the failure this ADR comes from — the *tool* silently
requiring hand-compensation for its own bake bugs. When the dev scaled the
mode-button frame up, non-integer scaling broke mirror symmetry, and the only
recourse was eight per-corner/per-side fixup values whose reason nobody recorded.
The tool must be good enough that the dev never needs an agent (or mystery
numbers) to express a visual judgement.

## Decision Outcome

**The 9-slice editor is the game dev's calibration bench. Agents build and
maintain the tool and its invariants; the dev makes the visual calls in it.**

Concretely:

- **Agents do not hand-tune frame configs.** If a visual tweak can be expressed
  in the editor, the dev makes it there and Saves. If it cannot be expressed,
  the correct agent move is to **extend the tool** (a new control, baked through
  the shared kit), never to bypass it with a hand-edited JSON or a one-off script.
- **Two values are explicitly human-calibrated inputs to code**, not agent
  guesses: the **fill box** (where a surface painted behind a line frame stops —
  the number consumer code clips to, [ADR-0034](0034-nine-slice-line-frames-for-surface-fill.md))
  and the **content box** (where text/icons start; carried into CSS as the
  asset's `consume.cssVar`, per ADR-0019). The dev lines these up by eye against
  real pixels; code consumes the result.
- **Scaling must never require hand fixups.** The bake's algorithmic invariant:
  every mirror/rotation happens **after** scaling, from one scaled source per
  atom (floor-sampled nearest-neighbour scaling does not commute with mirroring).
  Pipes underlay the full side at scale > 1 so corner nudges cannot expose seams.
  Zero-nudge bakes are mirror-symmetric by construction and pinned by vitest
  (`nineSliceBake.test.ts`); per-corner nudges exist for *deliberate* asymmetry,
  not to compensate the assembler.
- **What-you-tune-is-what-bakes stays absolute** (ADR-0019's one-bake-path rule):
  editor preview, dev Save, and CLI bake share the assembler model; the committed
  PNG must equal a fresh bake from its committed config (also test-pinned).
- **Frames that share a format share ONE shape (a "family"/theme).** Assets built
  from the same atoms (gold: `mode-button`, `button`, `panel`) carry a `theme` key
  in the registry, and their shared *shape* — cool corners, pipes, scales, brackets
  — lives in a single `config/nine-slice/themes/<theme>.json`. Each member's own
  config carries only its per-frame boxes (content / fill). The bake resolves
  *theme shape + member boxes*, so the family **cannot drift** — there is one
  source for the shape. Editing the Shape tab edits the family; the editor says so
  ("Editing the gold family — one shared shape") rather than "this asset". Saving
  writes the theme file + the member's boxes and rebakes **every** member, then
  pushes a Vite `full-reload` so the change lands live across the whole app — set
  it once, then navigate. Pinned by vitest: family members bake a byte-identical
  base frame. (This corrects the earlier per-asset-config split, which duplicated
  the shape across three files and let them drift.)

### Amendments to earlier records

- **ADR-0019 scope rule 1 ("keyline offset is inert; only the bracket is
  nudgeable") is superseded.** Every element is tunable, and the config stores
  per-element ABSOLUTES — exactly the render degrees of freedom (4 gold
  brackets + 4 cool corners at {dx,dy} each, 4 pipes at one normal-axis number
  each, two layer scales, content/fill); the retired global+residual shape
  folds in on read. The editor's control shape: two layer tabs (gold | cool,
  each owning its scale), a 3×3 spatial selector (corner cell = 2-axis
  screen-direction d-pad; side cell = 1-axis d-pad along the side's normal,
  with cool-layer member toggles corners/pipe — both on is the rigid seam-safe
  side move; center = whole-layer symmetric out/in steppers), all multi-member
  moves atomic (one shared clamped delta — no member can shear away at a clamp
  bound), plus a passive asymmetry indicator (inward-positive storage makes
  mirror symmetry = equal values). Rule 2 (content is consumption-side) stands.
- **ADR-0012's canonical assembler is now `buildFrameParts` in
  `frontend/scripts/nine-slice-kit.mjs`.** `assemble-frame.mjs` no longer has
  importers and does not implement the split-layer model or the mirror-after-scale
  invariant; ADR-0012's *decision* (atoms, never whole-frame generation) is
  unchanged — only the entry point moved.

### Consequences

- Good: the dev tunes proportions after a scale change, seats fill/content
  boxes, and ships the result — asynchronously, with no agent in the loop and
  no unexplained compensation values in configs.
- Good: config values now mean what they say (a nudge is a design choice, not a
  bug offset), so a re-orienting agent can read a config as intent.
- Cost: tool-quality bugs are now contract violations, not annoyances — a bake
  asymmetry or an editor/bake divergence blocks the dev, so the symmetry and
  parity tests are load-bearing and must stay.

## More Information

- Bake + invariant: `frontend/scripts/nine-slice-kit.mjs` (`buildFrameParts`);
  tests: `frontend/src/ui/design/nineSliceBake.test.ts`.
- Editor: `frontend/src/ui/NineSliceEditor.tsx` (`NineSliceLab`).
- Mechanism (save endpoint, dev gate, registry): [ADR-0019](0019-dev-only-nine-slice-editor-save.md),
  [ADR-0016](0016-single-source-nine-slice-registry.md).
- Surface/fill semantics: [ADR-0034](0034-nine-slice-line-frames-for-surface-fill.md).
