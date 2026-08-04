# ADR-0376: Held relics are Lipsana, one root end to end

## Status

Accepted.

## Context

The Run's held-relic register has been called **The Lipsanotheca** since ADR-0231 — Greek
*leipsanon* (relic) + *thēkē* (case), literally a relic-case. Its contents kept the plain
English word "relic" everywhere: the workspace heading, the Enchiridion section, the run
document field, the media slot path, the statistics table.

So the container was named in one language and its contents in another, and the container's
name described something no copy on the screen ever said. The same split existed nowhere else
in the Run's vocabulary — the Chartulary holds cards, the Martial Prosopography holds the
army, and both say so.

The screen that hands over a relic is **Bona Vacantia**: the legal term for goods whose owner
is gone. *Leipsanon* derives from *leipō*, "to be left behind, to be absent" — the thing left
by an owner who is no longer there. The two names are the same idea in two languages, which
was invisible while the contents were called relics.

## Decision

The player-facing and storage vocabulary is one Greek root in all three forms:

- **Lipsanon** — one of them
- **Lipsana** — several
- **Lipsanotheca** — the register they live in (unchanged)

This is a full migration under `docs/migration-policy.md`, not a copy change. The retired
spelling survives nowhere: not in the run document, the craft grammar, the routes, the CSS,
the media catalog, or the statistics table.

### What moved

- `RunDocument.relics` → `RunDocument.lipsana`, at `RUN_FORMAT_VERSION` 15.
- `RunRelicId` → `LipsanonId`, `RUN_RELICS` → `RUN_LIPSANA`, `hasRelic` → `hasLipsanon`,
  and the rest of the identifier surface.
- The craft grammar's `relics=` → `lipsana=`, and `/enchiridion/relics` →
  `/enchiridion/lipsana`.
- Production catalog: `ui/run/relics/<id>.png` → `ui/run/lipsana/<id>.png`, with the
  `run-relic-icon` / `run-relic-mat` runtime components and roles renamed to match.
- `run_relic_stat_events` → `lipsanon_stat_events`, including its index and check
  constraint, which a table rename does not carry.

### Documents below format 15 are refused, not upgraded

Every pre-15 run document carries `relics` and no `lipsana`. Reading the old key to fill the
new one would be exactly the compatibility path the migration policy prohibits, so
`normalizeRunDocument` throws for anything below 15.

The consequence is deliberate and larger than this rename: the per-format upgrade paths for
formats 1, 2, 3 and 5 (unit names, historical identities, inspection seeds, all-unit
Cacochymic state) are now unreachable for any stored document, and their tests were replaced
by one asserting the floor. **In-progress Runs are unsupported.** Per
`CLAUDE.md`, the owner's active Run is disposable test state and no migration is designed
around keeping one alive.

### Minted craft links are rewritten

A craft link is a durable address the owner holds, and its spec is data the migration can
canonicalize exactly, so migration 52 rewrites `run_craft_links.spec` in place —
`relics` becomes `lipsana`. Links minted before the rename keep working because the stored
spec moved, not because anything reads the old key.

## Consequences

- Migration 45 stays byte-for-byte canonical per ADR-0174, so `run_relic_stat_events` is
  still the name on disk until 52 renames it. The relation-repair registry therefore pairs
  `lipsanon_stat_events` with `[45, 52]`: replaying 45 alone rebuilds the retired spelling.
- `media_slots.slot` is a primary key that `media_versions.slot` and
  `media_slots_active_version_fk` reference with no `ON UPDATE` clause, so migration 52 drops
  both constraints, moves all three slot-bearing tables in one transaction, and restores the
  constraints identically.
- Until the migration runs on rollout, a worktree backend answers
  `503 schema_migration_required`. That is the expected state while the PR is open.
