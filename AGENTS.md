# Agent Workflow

This is the repository-wide entry point for agent work. Keep it as a router to
the authoritative sources below rather than copying their domain details here.

## Start from current repository truth

- Read [`CLAUDE.md`](CLAUDE.md) before working. Despite its name, it contains
  repository-wide operational rules for agents, including backend startup,
  worktrees, screenshots, direct URLs, and board handoffs.
- Start and finish with `git status --short --branch`. Treat every pre-existing
  edit as user-owned: do not discard, rewrite, stage, or commit unrelated work.
- Worktrees may be detached or behind `main`. Before making a repository-wide
  claim that something is absent, or creating a side branch to add it, fetch and
  compare with current `origin/main`. Base side work on a clean current worktree.
- Before substantial work, search the task's own vocabulary in
  [`docs/adr/decision-log.md`](docs/adr/decision-log.md), `docs/`, and the nearest
  analogous implementation or generator. Read the matched contracts, linked
  ADRs, script headers, and tests before choosing an architecture.
- Existing code is evidence, not authorization. This repository deliberately
  contains named debt and temporary violations; a nearby implementation may be
  the bug or interim state that a contract tells you to retire.
- If governing documents are missing, conflict with one another, or conflict
  with the requested approach, surface that before implementation. Do not create
  a silent exception.

## Decisions and contracts

- The [`docs/adr/` system](docs/adr/README.md) is authoritative for decisions.
  Living contract docs are the derived current-state rollup. When they disagree,
  follow the current non-superseded ADR; report the stale contract as part of the
  work.
- An accepted ADR's decision content is immutable. A changed decision requires a
  superseding ADR, a row in the decision log, the corresponding contract update,
  and only the old ADR's status/link metadata changed to point at its replacement.
- Any significant new decision, or change to an existing decision, about
  architecture, UI, art, tooling, or content policy must be recorded in an ADR
  rather than embedded only in code or comments. Use the decision log as the
  index; reading every ADR is not required.

## Find the governing documents

This table is a starting route, not an exhaustive list. Search for more specific
contracts whenever the task vocabulary suggests one.

| Work area | Start with |
| --- | --- |
| Product and gameplay intent | [`docs/game-concept.md`](docs/game-concept.md) and relevant entries in the ADR decision log |
| Board, terrain, tiles, and projection | [`docs/board-render-contract.md`](docs/board-render-contract.md), [`docs/tile-ruleset.md`](docs/tile-ruleset.md), [`docs/blender-projection-contract.md`](docs/blender-projection-contract.md), and [`frontend/scripts/TILE_PIPELINE.md`](frontend/scripts/TILE_PIPELINE.md) |
| Generated visual art and runtime visual assets | [`docs/runtime-asset-contract.md`](docs/runtime-asset-contract.md), [`docs/asset-generation-contract.md`](docs/asset-generation-contract.md), [`docs/asset-terminology.md`](docs/asset-terminology.md), and the relevant portrait, background, UI, or tile contract |
| UI, chrome, Studio, and editors | [`docs/ui-art-direction.md`](docs/ui-art-direction.md), [`docs/ui-kit-standard.md`](docs/ui-kit-standard.md), and [`docs/studio-control-architecture.md`](docs/studio-control-architecture.md) |
| Content, persistence, and authentication | [`docs/persistence.md`](docs/persistence.md) and the ADRs governing the affected content system |
| Backend, multiplayer, and local server work | `CLAUDE.md` and the relevant backend smoke tests |
| Solver and AI work | [`docs/per-board-ai-plan.md`](docs/per-board-ai-plan.md), [`docs/board-solver-implementation-plan.md`](docs/board-solver-implementation-plan.md), and ADR-0069 through ADR-0071 as applicable |
| Deployment and infrastructure | The Deploy section of [`README.md`](README.md), [`.github/workflows/`](.github/workflows/), [`k8s/`](k8s/), and [`tofu/`](tofu/) |
| Retiring or migrating a system | [`docs/migration-policy.md`](docs/migration-policy.md) and the ADR that retires or supersedes the old path |
| Running and visual verification | `CLAUDE.md` for the current server, dynamic-port, direct-link, and screenshot workflow |

## Standing implementation invariants

- The durable, contract-complete implementation is the default. Urgency does
  not create a quick-versus-thorough mode. A prototype may support exploration,
  but label it unmergeable or incomplete; do not present it as production or
  merge it before a contract-complete pass. An owner-authorized temporary
  downgrade must be recorded as named debt and cannot silently override a
  standing ADR; a decision change still requires a superseding ADR.
- Search for and reuse the canonical shared primitive before building. If it is
  genuinely missing, create a shared, discoverable primitive rather than a local
  parallel; register it in the current mutable registry or index when one exists.
  See
  [ADR-0059](docs/adr/0059-reuse-the-canonical-primitive-not-a-bespoke-parallel.md).
- For substantive feature work, especially tunable, generative, visual, or
  algorithmic systems, the deliverable is the owner-operable instrument, not
  merely an agent-chosen result. Put judgment behind reachable viewers, editors,
  steppers, comparisons, and controls with legible state. See
  [ADR-0071](docs/adr/0071-the-deliverable-is-the-instrument.md).
- Runtime, review, candidate, and source-media binaries are live-storage-backed.
  Git may own code, deterministic geometry, prompts, and text provenance, but it
  must not own media bytes, accepted pointers, or a packaged fallback. Promotion
  is an admin backend transaction; generation tools upload candidates instead of
  writing runtime art into the repository. See
  [ADR-0081](docs/adr/0081-runtime-assets-are-live-storage-backed.md) and the
  [runtime asset contract](docs/runtime-asset-contract.md).
- Any board or level offered through the UI must use the canonical content
  system. Do not hide a broken or unavailable source behind compiled-in demo
  data, shadow catalogs, or fallback viewer states. See
  [ADR-0070](docs/adr/0070-board-content-answers-to-the-one-content-system.md).
- A migration deletes the retired path end to end. Do not preserve compatibility
  branches, fallback defaults, old tests, or runnable generators "for reference."
- For board and feature material governed by ADR-0040, code may own deterministic
  geometry, masks, placement, and validation; the material pixels must come from
  generated source pixels that the bake or runtime actually consumes. Citing a
  concept reference does not make independently code-painted pixels generated
  material; record the provenance of the pixels actually shipped. Do not recreate
  pixel-authored material with hardcoded RGB, gradients, CSS, or ad hoc SVG. See
  the asset-generation contract and
  [ADR-0040](docs/adr/0040-feature-tiles-own-geometry-generate-material.md).

## Change and pull-request hygiene

- When a defect originates in a shared primitive or repeated rule, fix that
  shared source and add a regression guard when practical; do not patch only one
  screen or fixture where the symptom appeared.
- Keep side tasks in separate worktrees when the active worktree is dirty. Stage
  only task files, and do not rewrite shared history or force-push without
  explicit permission.
- A request to open a pull request alone does not authorize merging it. Merge
  only after required checks are green and the user has explicitly requested or
  approved that PR for merge.

## Run and validate the real application

- The backend is a hard dependency. Agents must not use `DEV_NO_BACKEND=1` or
  `DEV_OFFLINE=1`; follow `CLAUDE.md` if startup fails.
- Run checks proportional to the changed surface. For changes that affect the
  running application, verify the real full app on the exact route and state
  affected. Use the dynamically printed Vite URL, not an assumed port, and use
  the supported screenshot path documented in `CLAUDE.md`.

## User verification gates feature completion

- A feature is not complete until the user has verified it in the running application and explicitly confirmed that it works.
- Automated tests, type checks, builds, and agent-run browser checks are prerequisites for handoff, not substitutes for the user's verification.
- After implementing a feature, describe it as **ready for verification**, provide the exact development URL, and keep that development server running.
- Do not stop the development server or report the feature as done while user verification is still pending.
- If the application cannot be made available for verification, report the blocker clearly and leave the feature marked as unverified.
