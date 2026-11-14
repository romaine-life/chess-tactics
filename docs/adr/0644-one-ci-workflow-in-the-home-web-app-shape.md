---
status: "accepted as PIPT-4's decision; this record of how chess-tactics applies it has not been reviewed by Nelson"
date: 2026-11-13
deciders: "Nelson decided in PIPT-4 (2026-11-13) that every repo's CI converges on the pipeline-templates reference shape; Claude applied it here and wrote this record"
refines:
  - "[ADR-0643](0643-forgejo-owns-ci-and-release-production.md)"
---

# ADR-0644: One CI workflow in the home web-app shape

## Context and Problem Statement

[PIPT-4](https://openproject.home.romaine.life/wp/PIPT-4) brings every home repo's Forgejo CI to one reference shape per kind of project. Here, pull requests ran Docker Build Check and merges ran Build and Deploy behind a `paths` filter, so each repeated the backend and frontend lanes in its own file, and a Markdown-only pull request occupied the Windows runner for the whole frontend gate.

## Decision Outcome

One workflow, `.forgejo/workflows/ci.yml` named `CI`, runs on pull requests, pushes to `main` and manual dispatch.

- A `changes` job runs `check-fetches` and decides whether a pull request changes anything besides Markdown and `LICENSE`. `docs/` is not skipped wholesale: it holds JSON, Python and text that the frontend tests and scripts read.
- A Markdown-only pull request skips the backend lane, the frontend lane and the image job. The frontend gate's guards that read Markdown (committed media, doc links, the decision-log index, ADR numbers) also run alone in a `Check docs` job on every run, so those pull requests are still checked.
- A pull request or dispatch builds the validation image (`image`); a push to `main` builds and deploys the merged revision (`deploy`), and a dispatch runs `deploy` after `image`. A dispatch of `main` with no `git_ref` publishes to `prod` like a push, so a merge run that never started can be restarted by dispatch; any other dispatch builds and locks its ref without publishing. `deploy` runs only when `changes`, both lanes and (except on a push, where it is skipped) `image` succeeded. It keeps its own permissions and `ARM_CLIENT_ID` condition.
- Pushes to `main` have no `paths` filter, so every merge builds, deploys and cuts a source release.
- Pushes and dispatches share Build and Deploy's concurrency group, so releases run one at a time; pull requests group by ref. No run is cancelled, because `backend-tests` starts a PostgreSQL container that a cancelled job would leave running.

The lanes stay parallel (ADR-0255) and frontend validation stays on the Windows runner (ADR-0643).

### Consequences

- Good: one file describes CI; a Markdown-only change costs the Linux runner seconds and the Windows runner nothing.
- Cost: a merge that changes only Markdown or `tofu/` now deploys a new patch version.
