---
status: "accepted"
date: 2026-07-20
deciders: Nelson, Codex
---

# ADR-0148: Pre-drawn background authoring storage is bounded

## Context

ADR-0147 makes raw scene uploads and deterministic raster and mask children durable, immutable,
owner-authored media. Each request already has a 32 MiB and eight-megapixel ceiling, but those
per-request limits do not bound the number of permanent rows, the total retained Blob content, or
the number of request bodies buffered concurrently. Archive intentionally retains immutable bytes
and lineage, so it cannot double as storage reclamation or a way to evade accounting.

Without server-owned aggregate limits, any authenticated editor writer could allocate unbounded
metadata and object storage or issue parallel maximum-size uploads. A client-side limit would not
protect the backend and would make browser behavior an authority it does not own.

## Decision

The backend enforces all pre-drawn lineage storage limits:

- One editor document may own at most **256 permanent background-version rows**, including raw,
  registered-raster, occlusion, ready, published, and archived rows. Archive does not restore row
  capacity.
- One owner may reference at most **1 GiB of unique immutable background-version Blob bytes**.
  Bytes are counted once per distinct SHA-256 across all of that owner's documents and statuses.
  Reusing the same content hash does not charge it twice; archive does not remove it from the
  retained-byte total.
- Quota validation for a new distinct Blob is serialized under owner-scoped database authority in
  the same transaction that binds the content, so concurrent documents cannot race past the
  aggregate limit.
- At most **one raw background upload body per editor document** may be in flight before the raw
  parser allocates its bounded buffer. A second concurrent request fails explicitly and may retry;
  it does not queue another 32 MiB body in memory.
- The existing 32 MiB body and eight-megapixel raster ceilings remain independent request limits.

The backend reports distinct version-count, retained-byte-quota, and upload-busy errors. UI may
explain those errors, but cannot weaken or replace the server checks. Published and canonical
references remain immutable and resolvable. Reclamation beyond these retention bounds requires a
future explicit deletion/retention decision; it is not silently attached to Archive.

## Consequences

- Authenticated authoring has a predictable database, object-storage, and request-memory ceiling.
- Ordinary iterative work retains ample history while malicious or accidental unbounded growth
  fails before additional permanent allocation.
- Archive remains honest lifecycle organization rather than deceptive deletion.
- A future horizontally scaled backend must replace the process-local in-flight guard with a
  distributed equivalent while preserving the same user-visible one-upload-per-document rule.
