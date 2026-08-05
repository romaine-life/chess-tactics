---
status: accepted
date: 2026-08-04
deciders: owner (Nelson) + Codex
refines:
  - "[ADR-0034](0034-nine-slice-line-frames-for-surface-fill.md)"
  - "[ADR-0063](0063-rail-tab-continuity-is-data-indexed-not-dom-positioned.md)"
  - "[ADR-0102](0102-runtime-buttons-use-registered-inner-chrome.md)"
---

# ADR-0433: Leaf chrome uses oak over structural teal fields

## Context

Run chrome used the same cool teal/blue fill for both structural fields and the controls
nested inside them. On Alienatio this made the operation rows, roster dropdowns, row actions,
and Controls navigation read as one undifferentiated layer. The frame hierarchy remained
technically correct, but the material hierarchy did not explain which surfaces establish a
region and which surfaces terminate the interaction tree.

The installed `hybrid-wood-oak` surface already gives the apparatus rail a warmer, tactile
button material. It can express that terminal layer without introducing new media or baking
material pixels into a frame.

## Decision

- Cool teal/blue stone is the structural field material. It belongs to surfaces that establish
  a background for subordinate units or regions: shell bodies, operation rows, dropdown popup
  bodies, and comparable content containers.
- `hybrid-wood-oak` is the leaf material. It belongs to actionable controls and terminal
  identity/status plates that do not establish another content region. Frame, tone, selected,
  danger, and disabled treatments continue to communicate state; wood does not replace them.
- The first explicit rollout is the Run surface: roster dropdown triggers, the Run Controls
  buttons, Alienatio and Expunctio row actions, Army-profile leaf actions, and the Run identity
  plate in the title bar. The existing apparatus rail already conforms and now consumes the
  same shared leaf-surface policy constant.
- Opening a dropdown does not turn its popup field into a leaf. The closed trigger is oak; the
  popup remains structural teal because it hosts option rows.
- A repeated leaf collection never restarts the wood at the same origin on every item. Its data
  renderer owns a monotonic phase index, and shared CSS derives the surface offset from that
  index. Alienatio and Expunctio actions inherit the already data-indexed operation-row phase.
  DOM-position ladders and painting wood on a parent—thereby filling the gaps—remain forbidden
  by ADR-0063.
- This rollout does not silently reskin every existing screen. Subsequent destinations apply
  the hierarchy by reusing the shared named-surface policy and recording any material exception.

## Consequences

- The Run page now communicates depth through material before copy or state styling is read.
- Teal fields remain visually continuous around the subordinate controls they organize.
- Oak is reusable as a semantic leaf material rather than a Run-only literal.
- Repeated wood controls require an explicit data-owned phase, which adds a small renderer
  obligation but prevents stamped texture repetition.
- No runtime, candidate, or source-media bytes are added to Git; the implementation consumes an
  already installed named chrome surface.
