---
status: accepted
date: 2026-07-30
deciders: owner (Nelson) + Codex
refines:
  - "[ADR-0094](0094-merge-builds-and-deploys-the-merged-image.md)"
---

# ADR-0255: Backend and frontend validation run in parallel

## Context

The backend package's `npm test` command accumulated repository-wide work:
it installed the frontend, ran the complete frontend contract/test/typecheck
gate, built the production frontend, built the trainer, and only then ran the
backend checks and smoke tests. Both pull-request CI and the post-merge
deployment workflow followed that command with another frontend install and
the same complete frontend gate.

One observed pull-request run spent 2 minutes 41 seconds in the all-app backend
step and another 2 minutes 1 second repeating frontend validation. The required
image build could not begin until both serialized copies completed.

The backend smoke tests do have two real frontend-derived prerequisites: the
HTTP smoke test serves the production shell and the solver smoke test imports
the DOM-free trainer bundle. Those prerequisites do not justify making the
backend package own frontend validation.

## Decision

- `backend npm test` is backend-owned. It prepares the production web shell,
  board-render package, and trainer bundle required by backend/worker smoke
  tests, then runs backend checks and smoke tests. It does not run the frontend
  contract gate.
- Pull-request validation and post-merge deployment each use separate backend
  and frontend jobs. Those jobs check out the same requested commit and run in
  parallel.
- The backend job alone owns its disposable PostgreSQL service and runs
  `backend npm test`.
- The frontend job runs `frontend npm run check` and the immutable-image
  release contract.
- The existing required image/deployment job keeps its public check name and
  depends on both validation jobs. Docker build, registry mutation, and
  deployment cannot begin unless both parallel lanes succeed.
- Pull-request and production workflows share this topology. A future test
  belongs to the narrowest owning lane; cross-lane prerequisites must not
  silently restore a monolithic all-app test command.

## Consequences

- Frontend validation runs once per workflow instead of twice.
- Backend smoke tests and frontend contracts consume wall-clock time in
  parallel.
- PostgreSQL initialization is limited to the backend lane.
- The production shell and trainer are still rebuilt in the backend lane
  because its HTTP and solver smoke tests consume those exact production
  boundaries.
- Separate jobs repeat checkout and Node setup, trading a small amount of
  runner work for a substantially shorter critical path.
- ADR-0094's exact-ref, immutable-image, and merge-authorizes-deployment
  decisions remain unchanged.
