---
status: "accepted"
date: 2026-07-13
deciders: Nelson, Codex
---

# ADR-0094: Merge builds and deploys the merged image

## Context and Problem Statement

The one-time runtime-asset cutover required the owner to exercise a final
digest-pinned image against the live data plane before rollout. Its implementation
turned that cutover proof into a standing release protocol: pull-request CI baked
the prospective production version, published and locked a candidate, printed a
machine-formatted approval comment, and made the later `main` deployment refuse
to build or deploy without that comment.

The cutover is complete. The standing protocol made a normal green merge fail
afterward unless the owner copied an opaque comment, and it introduced races
between the PR head, squash-merge tree, mutable `prod` version, and final
deployment. A historical cutover proof is not ordinary release authorization.

## Decision Drivers

- A normal merge to protected `main` must be sufficient deployment authorization.
- Production must run bytes built from the exact merged revision.
- Argo must remain pinned to an immutable registry digest.
- PR validation images must remain reachable by pushed commit for Glimmung test
  slots without becoming production release candidates.
- Completed migration tools, tests, instructions, and configuration must be
  deleted rather than left as optional compatibility paths.

## Decision Outcome

Chosen: **Build and Deploy builds the merged `main` revision and deploys its
digest automatically**.

Pull-request CI tests the pushed ref, builds its content-fingerprint image for
validation, and maintains the `sha-<commit>` alias consumed by Glimmung. It does
not bake the next production version, publish a production candidate, or provide
a second approval boundary.

After merge, Build and Deploy checks out the triggering `main` revision, reruns
the application tests, computes the release version and complete Docker-input
fingerprint, and builds that merged image when its fingerprint tag is absent.
The workflow verifies and locks both the tag and manifest against overwrite and
deletion, then writes the full `registry/repository@sha256:...` reference plus
version and build provenance to the Argo-tracked `prod` branch.

There is no pull-request approval marker, trusted-approver variable consumer,
comment query, or prebuilt-candidate requirement. The now-unused repository
variable can be removed from GitHub settings after this workflow lands; deleting
it before then would break releases from the current `main`. If a future operation
genuinely requires manual production authorization, it must use a visible
protected GitHub environment or a bounded migration workflow and must be removed
when that operation completes.

The exact-image comment verifier, cutover verifier, their tests and package
commands, and the operational cutover runbook are deleted end to end. The
accepted cutover ADR and storage audit remain as historical evidence.

## Consequences

- Good: ordinary merges deploy without a hidden post-merge gesture.
- Good: production is built from the exact merged tree rather than a PR-head
  candidate whose version or content may have drifted.
- Good: digest pinning and registry retention remain machine-enforced.
- Good: Dependabot and human merges use the same release path.
- Good: Glimmung retains a commit-addressed PR validation image.
- Cost: production may repeat a Docker build already performed for PR
  validation, with registry caching limiting the duplicated work.
- Constraint: merge is release authorization; any future manual gate belongs in
  GitHub environment protection, never in PR comment syntax.

## More Information

- [ADR-0086](0086-runtime-asset-cutover-uses-one-live-data-plane.md) remains the
  authoritative record of the completed one-live-data-plane cutover. This ADR
  retires its temporary operational scaffold; it does not reverse that cutover.
- The steady-state workflow is documented in the Deploy section of
  [`README.md`](../../README.md).
- End-to-end retirement follows [`docs/migration-policy.md`](../migration-policy.md).
