---
status: "accepted as PIPT-12's decision; this record of how chess-tactics applies it has not been reviewed by Nelson"
date: 2026-11-16
deciders: "Nelson decided in PIPT-12 that every home repo's CI comes from pipeline-templates' central suites, with checks on pull requests only, each run only when its inputs change, and every release numbered prefix.N; Claude applied it here and wrote this record"
supersedes:
  - "[ADR-0644](0644-one-ci-workflow-in-the-home-web-app-shape.md)"
---

# ADR-0645: CI from the pipeline-templates suites

## Context and Problem Statement

[PIPT-12](https://openproject.home.romaine.life/wp/PIPT-12) moves every home repo's CI to suites
kept in pipeline-templates and chosen by the repo's entry in its `fleet.json`. Six rules: checks
run on pull requests only; a check runs only when its inputs change; caches are kept; no job
waits or polls; a new push cancels a stale pull-request run; and the suites enforce this, not
each repo. ADR-0644's single workflow published from a pull request, waited out PostgreSQL in a
retry loop, never cancelled, and deployed through a `prod` branch.

## Decision Outcome

The `web-app`, `cluster-service` and `tofu` suites run chess-tactics' CI; `.forgejo/workflows/ci.yml`
and `tofu.yaml` are gone.

- On a pull request, the web-app suite runs each package's `npm run lint` and `npm test`: the
  backend against a PostgreSQL service the suite starts and waits on by its health events, and
  the frontend's guards and type check (`lint`) and vitest (`test`) on Linux. It builds the image
  and runs `--self-test` (`backend/self-check.js`). Each runs only when its inputs changed.
- `checks.yml` runs the Markdown guards on a pull request that changes Markdown, so a
  documentation-only change is checked without the code suites.
- A merge that changes the application releases `v0.1.N`, pushes the image and opens a pin PR
  on `main` writing the image (tag and digest) and the build provenance (the release commit and
  the PR it merged) into `k8s/values.yaml`; merge-queue lands it, and Argo CD deploys `main`.
  The `prod` branch, its deploy commits and the chart `appVersion` bump are retired.
- Pull requests no longer build or push candidate images, and a manual dispatch no longer
  prebuilds a ref.
- The cluster-service suite renders the chart and checks its schemas and that every image is
  named by digest. The tofu suite plans on a pull request and applies on a merge, with the
  providers pinned in `tofu/`.

### Consequences

- Good: one central definition of CI; a pull request runs only what its change touches; no job
  holds a runner waiting.
- Cost: frontend validation moves from the Windows runner to Linux (ADR-0643's split), and
  Settings → About shows the full release commit.
