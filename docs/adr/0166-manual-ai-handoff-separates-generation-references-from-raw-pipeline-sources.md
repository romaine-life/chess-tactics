---
status: accepted
date: 2026-07-23
deciders: Nelson, Codex
partially_superseded_by:
  - "[ADR-0167](0167-raw-pipeline-sources-can-seed-new-attempts.md)"
  - "[ADR-0168](0168-creation-slots-begin-with-reusable-raw-pipeline-sources.md)"
  - "[ADR-0476](0476-generation-references-freeze-the-autosaved-working-copy.md)"
  - "[ADR-0477](0477-board-art-pipeline-owns-ai-result-ingress.md)"
  - "[ADR-0478](0478-ai-artwork-intake-is-source-agnostic.md)"
  - "[ADR-0499](0499-generation-references-may-bake-the-playable-grid.md)"
partially_supersedes:
  - "[ADR-0165](0165-ai-artwork-separates-sources-attempts-and-background-mode.md)'s owner-facing Source Artwork terminology"
  - "[ADR-0165](0165-ai-artwork-separates-sources-attempts-and-background-mode.md)'s owner-facing AI Generation Pipeline workspace name"
  - "[ADR-0165](0165-ai-artwork-separates-sources-attempts-and-background-mode.md)'s unspecified AI-generated-stage ingress"
refines:
  - "[ADR-0109](0109-predrawn-generation-packets-preserve-authored-level-semantics.md)"
  - "[ADR-0125](0125-predrawn-preparation-self-validates-before-generation.md)"
  - "[ADR-0158](0158-immutable-predrawn-background-versions-own-derived-raster-and-occlusion.md)"
---

# ADR-0166: Manual AI handoff separates generation references from raw pipeline sources

## Context

ADR-0165 correctly separated the image given to an image model from the
generated and deterministic board-art stages, but called the first object
**Source Artwork** and left model ingress abstract. That made a level-derived
model input sound interchangeable with the AI-painted PNG returned by Codex.
The current model call is an intentional manual collaboration boundary; hiding
that fact makes it unclear how an owner starts a pipeline attempt with the
generated art.

## Decision

### Two different image roles

A **Generation Reference** is the immutable, unit-free, cover-free,
overlay-free image captured from a canonical saved Level through its saved
generation frame. It is the exact full-resolution image supplied to the image
model. It may capture the saved Legacy environment or the exact saved selected
AI background under ADR-0165. It is not settable board art and it is not a
pipeline output.

A **Raw Pipeline Source** is the exact AI-painted PNG returned by the image
model. It is the first settable raster stage of one creation attempt and the
only input to that attempt's deterministic grid warp. It is not a Generation
Reference merely because it is called a source for later pipeline stages.

Generation References and pipeline artifacts share the immutable
`predrawn_background_versions` store but remain distinct typed roles.
Generation References are rows with `kind='source'`; Raw Pipeline Sources are
rows with `kind='raw'`. Both are accessed through the document-scoped
`/background-versions` API, and neither kind may be reclassified as the other.
Internal identifiers must not leak into owner-facing wording or collapse these
two roles.

The owner-facing attempt workspace is **Board Art Pipeline**. This name makes
the workspace's purpose clear without implying that the application itself
invokes the external model.

### Manual clipboard bridge

Manual model collaboration is a first-class pipeline state:

1. The owner selects one Generation Reference and creates a new normal
   creation attempt. The backend creates one `predrawn_generation_attempts` row
   through the document-scoped `/generation-attempts` API and immediately binds
   that waiting attempt to the exact reference identity and hash, canonical
   semantic request and hashes, request hash, and actor/time provenance.
2. **Copy generation reference** places that reference's original
   full-resolution PNG on the clipboard. It never copies a thumbnail, viewport
   screenshot, UI composite, or newly rendered approximation.
3. The owner works with Codex outside the deterministic application pipeline.
   The clipboard carries image bytes, not semantic or persistence authority;
   the attempt's server-bound semantic request remains authoritative. The
   application does not know or claim the external Codex conversation's model,
   prompt, or generation parameters.
4. **Paste AI-painted board**, a direct `Ctrl+V`, or **Choose PNG file instead**
   reads one exact PNG payload and stages a local preview for the selected
   waiting attempt. This does not mutate the attempt. The application does not
   crop, resize, warp, composite, or otherwise change the preview.
5. After review, **Use this board** hashes and stores those exact unchanged
   bytes as that attempt's immutable Raw Pipeline Source. Discarding the preview
   leaves the attempt waiting.
6. Grid adjustment and occlusion continue inside the application as the
   deterministic warped and occlusion-ready stages governed by ADR-0158.

Clipboard permission denial, a clipboard without one supported PNG image, an
invalid or oversized pasted or selected file, a stale writer fence, or a
lineage mismatch leaves the attempt waiting and reports the concrete failure.
Copy and local staging may be repeated. The first successful **Use this board**
commits the one raw slot; an idempotent retry of the same operation resolves the
committed result, while different pixels require a new attempt.

When the editor already has an explicitly mounted preexisting Codex-painted PNG,
**Use existing Codex-painted board** may import those exact bytes directly into
the selected waiting attempt's raw slot. This is a direct Raw Pipeline Source
import, not a clipboard round trip, a Generation Reference capture, or
reclassification of an existing stored artifact.

### Attempt and lineage boundaries

A normal creation attempt therefore has this owner-visible sequence:

`Generation Reference → waiting for AI-painted PNG → Raw Pipeline Source → Warped → Occlusion-ready`

One attempt binds one Generation Reference and admits at most one committed
Raw Pipeline Source, one warped result, and one occlusion-ready result. The
explicit editor-mounted preexisting-result path may fill that raw slot directly
without a clipboard round trip, but it does not promote or reclassify another
stored stage.

Raw, warped, and occlusion-ready artifacts do not gain a generic **Use as
source** or promotion action. If an owner deliberately wants an installed AI
background to influence another model run, the owner selects it as the Level's
AI background, saves that Level state, and captures a new Generation Reference.
That explicit capture records the new reference semantics and provenance
instead of relabeling an output artifact.

Migration continues to preserve old source-less lineages honestly. A
`kind=raw` row in a historical attempt is labeled Raw Pipeline Source, but
relabeling never fabricates the missing Generation Reference or request.
Attempts marked `missing-historical-source` remain inspection-only and cannot
accept a paste, rerun generation, derive a new stage, or claim isolated
pipeline provenance. Their existing exact artifacts, settable state, hashes,
and audit history remain unchanged.

## Consequences

- The owner can see which image goes to Codex and which image comes back.
- Manual collaboration is explicit and resumable instead of masquerading as an
  in-app model call.
- The application can prove the exact reference, canonical semantic request,
  imported pixels, hashes, actor, and time. It does not invent provenance for
  the external Codex conversation's model, prompt, or parameters.
- The application still owns every deterministic transform, occlusion build,
  installation, Save, and Publish operation; ADR-0158's removal of agent-driven
  deterministic installation remains intact.
- Existing raw Codex artwork is named according to its actual pipeline role,
  while historical missing provenance stays visible and fail-closed.

## Verification

Contract-complete implementation proves that:

- copy yields the exact full-resolution Generation Reference without units,
  cover, overlays, chrome, resampling, or viewport capture;
- a new normal attempt is visibly waiting on one immutable reference before
  local preview and remains bound to that reference after reload;
- clipboard paste and exact-PNG file selection stage a byte-identical local
  preview without mutating the attempt, and **Use this board** commits those
  exact bytes as its one immutable Raw Pipeline Source;
- the explicitly mounted preexisting-Codex-result action imports its exact PNG
  directly as the raw stage without reclassifying it as a Generation Reference;
- after one raw commit, a second different raw import fails closed;
- a valid existing `kind=raw` row is displayed as Raw Pipeline Source and never
  as Generation Reference;
- warp and occlusion consume only the committed raw and warped stage
  respectively and require no agent handoff;
- no raw, warped, or occlusion-ready artifact exposes generic source promotion;
  and
- historical missing-source attempts remain explicitly unavailable for new
  work without losing any existing artifact or provenance.
