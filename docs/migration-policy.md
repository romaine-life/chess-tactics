# Migration Policy

When migrating off an old system, the old system must be deleted end to end.
Compatibility is prohibited.

A migration that rewrites durable data completely into the new representation is not
compatibility. Versioned player data must have an explicit forward migration; removed content maps
to a typed tombstone or neutral replacement rather than invalidating the containing document. For
client-owned storage that no server process can rewrite, the client performs that transform at its
storage boundary and immediately persists only the new shape. Runtime business logic still receives
only the current representation. See ADR-0380.

This is not a preference or a default that can be overridden by agent caution.
It is the migration contract for this repository.

## Completion Standard

A migrated path is not complete until all of these are true:

- no live routes
- no UI controls or links
- no code, generator, or build branches that select or produce the old path
- no fallback defaults
- no old behavior tests
- no docs saying the old path is supported
- no runtime reads whose purpose is to keep old behavior working
- no old source scripts or assets left runnable — a retired generator or asset
  is **deleted**, not flagged, commented out, or "kept for reference"

Unknown callers are unsupported. Known old callers are unsupported. Old data
does not justify runtime support.

If removal exposes another dependency on the old system, delete that dependency
too. If the task cannot be completed, stop with a blocker report naming the
exact remaining old dependency.

Do not add a compatibility layer. Do not add a fallback. Do not keep a
read-only runtime path.

## Agent Checklist

When asked to complete a migration, search for the old system's names, routes,
types, feature flags, tests, docs, UI labels, storage behavior, and any scripts
or source assets that produce it. Remove every live path.

Treat `legacy`, `compatibility`, `fallback`, `temporary`, `retired`, and
`exception` as deletion targets, not design options.

Tests should fail if the retired path is reintroduced into live code.

## Provenance

Brought in deliberately from the `tank-operator` repo's migration policy, because
this repo accumulated exactly the sediment it prohibits: 9-slice generators that
ADRs declared "retired" but were left on disk and runnable beside their
replacements (extraction `generate-kit-row.mjs` / `generate-kit-tabs.mjs` per
[ADR-0011](adr/0011-chrome-art-generated-not-extracted.md); whole-frame
`forge-row.mjs` per [ADR-0012](adr/0012-nine-slice-frames-are-atom-assembled.md)).
Under this policy, an ADR that retires a method is an instruction to **delete**
it, not to leave it runnable.
