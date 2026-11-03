---
status: accepted
date: 2026-11-02
deciders: Nelson (FORGEJO-3)
refines:
  - "[ADR-0255](0255-backend-and-frontend-validation-run-in-parallel.md)"
---

# ADR-0643: Forgejo owns CI and release production

## Context

[FORGEJO-3](https://openproject.romaine.life/wp/FORGEJO-3) moves the repository's writable home to Forgejo. GitHub remains a push mirror for cloud source readers; ArgoCD cannot reach the home-only Forgejo service.

## Decision

Forgejo runs the existing backend PostgreSQL tests, frontend contract gate, immutable-image validation, container builds, Azure deployment and infrastructure workflows. The backend and frontend remain parallel lanes under ADR-0255; frontend validation and infrastructure use the Windows runner to limit work on the single NAS Linux runner. Azure uses the existing app registration with Forgejo OIDC federation.

Main merges retain the immutable image and prod-branch deployment contract. The workflow writes only the deployment branch, never main, then cuts a source release tagged with that production version. The production version continues above both the previous prod version and package floors. The GitHub mirror carries main, prod, all other branches and tags; cloud readers keep their accessible GitHub URLs. GitHub workflows are removed after Forgejo's default-branch CI and a Forgejo release pass; Dependabot and its GitHub-only auto-merge workflow are retired in the migration PR. Required checks protect Forgejo main, with all source changes entering through checked pull requests.

## Consequences

The GitHub mirror remains usable for source reads. A release contains the source archives and identifies the immutable ACR image; this app has no standalone published binary or publish script. BGM metadata synchronization remains a manually dispatched Azure workflow.
