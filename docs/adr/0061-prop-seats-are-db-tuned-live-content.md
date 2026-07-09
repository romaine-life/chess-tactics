---
status: "accepted"
date: 2026-07-03
deciders: Nelson, Claude
---

# ADR-0061: Prop seats are DB-tuned live content — committed baseline + live DB overrides + bake-back

The first application of the "tweakable content lives in the DB" direction beyond
campaigns. It reuses the dual-homed pattern of
[ADR-0038](0038-campaigns-are-tiered-game-content.md) (committed file + live global
DB row + weekly bake-back) and the read-public / write-admin rule of
[ADR-0060](0060-playing-never-requires-sign-in.md), and it treats prop-seat
tuning as the canonical live-editable asset class the owner wants to nudge on prod
without a commit→push→deploy loop.

## Context and Problem Statement

Prop **seat tuning** — per-prop `anchorX/anchorY`, render `scale`, gameplay
footprint `w/h`, and size-variant `base` links — lives in
`frontend/src/core/propSeats.json`, eye-tuned in `/prop-lab`. Today a save goes
through a **dev-only Vite endpoint** (`propSeatSave`/`propSeatDelete` in
`frontend/vite.config.js`) that writes the file on disk; shipping a tweak means
commit + push + deploy. The owner wants to nudge props **live on prod** and have
the change stick.

Two constraints from the code shape the design. `frontend/src/core/props.ts`
imports the seats **synchronously** (`import propSeats from './propSeats.json'`)
and **throws** if any `PROP_DEFS` entry has no seat — props are composed at module
load and must always render. The shared `@chess-tactics/board-render` package
also carries that baseline for server-side level thumbnails. So the seats can't
simply move to an async-only DB fetch, and any live change must reach the
thumbnail renderer too or thumbnails drift from the live look.

Prod is the owner's **personal sandbox** (no other players), so there is no
audience to protect from a half-tuned prop — which is exactly why instant-live
editing with no publish gate is the right model here (per the locked intent).

## Decision Drivers

- **Live tuning without a deploy** — a `/prop-lab` nudge persists and shows up on
  prod.
- **Instant-live, no publish gate** — the owner's locked choice; a confirm-per-nudge
  would kill iteration, and there are no other players to shield.
- **Props must always render** — an empty/absent seat set throws; there must always
  be a complete baseline, independent of the DB.
- **No DB dependency for playing** — a Postgres outage must not empty or break props
  (`docs/persistence.md`, "Failure behavior"; ADR-0038).
- **Reads public, writes admin** — per ADR-0060; loading seats needs no session,
  publishing them requires admin.
- **Thumbnails must not drift** — the server-side renderer must see the live seats,
  the same way the OG/officials path already reads the live DB (`server.js`).
- **Reuse, don't fork** — clone the officials tier and the canonical primitives
  rather than inventing a parallel mechanism (ADR-0059).

## Considered Options

- **A. DB-only (drop the committed file).** Props hydrate from the DB at boot; no
  bundled seats. **Rejected** — props can't render until the DB responds, a DB
  outage means no props, and it breaks the "props always render" invariant and the
  no-DB-dependency rule. (This is the key contrast with ADR-0038, which *deleted*
  `official.json`: an empty campaign set is a valid empty screen, but an empty seat
  set throws.)
- **B. Committed baseline + live DB overrides + bake-back.** `propSeats.json` stays
  as the always-available **baseline/seed**; a global `prop_seats` row holds the
  **live overrides**; the frontend overlays the DB on top of the baseline at boot;
  a cron bakes DB→file. **(chosen)**
- **C. Status quo.** Dev-only file save + commit + deploy. **Rejected** — that is
  the friction being removed.

## Decision Outcome

Chosen: **B.** The DB is authoritative for **tuned values**; the committed file is
the **baseline + outage fallback + git history**. Unlike ADR-0038 the file is
**not** retired — props require a complete baseline to render at all, so
`propSeats.json` stays committed and the DB layers live overrides over it.

### The tier

A new global **`prop_seats`** table — a deliberate clone of `official_campaigns`
(PK `id` alone, e.g. `'default'`): **public GET** (synthesizes an empty override
doc on miss, never 404), **`requireAdmin` PUT** (per ADR-0060 / ADR-0038's
`ADMIN_EMAILS`), with `revision` + `updated_by`. We do **not** reuse
`design_portfolios` — its PUT falls through to any signed-in designer, but a global
publish must be admin-gated (the same reason ADR-0038 declined
`requireDesignPortfolioWriter`).

### Load contract (baseline overlay, API-first)

`props.ts` keeps the **synchronous baseline import** so props render immediately
and with zero DB. A new hydrate step (`loadLiveSeats()`) fetches
`GET /api/prop-seats/default`, **overlays** the returned entries over the baseline
per `propId`, re-derives `PROP_DEFS`/`SEATS`, and triggers a re-render — **never
throws** (any error/empty leaves the baseline in place). "Instant-live" means the
override applies on the next load/refresh, not a real-time socket push.

### Editing (`/prop-lab`)

`/prop-lab` **Save** switches from the dev-only Vite file endpoint to
`PUT /api/prop-seats/default` (`requireAdmin`) — applied **instantly, no confirm
dialog** (unlike officials' "Publish to all players"; per the instant-live intent
and the personal-sandbox reality). Base/size-variant integrity (a base with
dependent variants can't be deleted) moves **server-side** into the PUT validation
— today it lives only in the Vite `propSeatDelete` handler. `mapSaveError` reuse:
`401`→sign-in, `403`→admin-required, `503`→retry. The dev-only
`propSeatSave`/`propSeatDelete` Vite endpoints retire.

### Server thumbnails

The board-render thumbnail path overlays the **live** `prop_seats` over its
embedded baseline (short TTL + last-known-good in memory, mirroring the officials
OG path in `server.js`), so a re-tuned prop can't drift from its thumbnail; the
embedded copy is the fallback when the DB is down.

### Bake-back (DB → file) — the undo

A GitHub Actions cron (modeled on the ADR-0038 bake-back) `curl`s the **public**
`GET /api/prop-seats/default`, merges into `propSeats.json`, `git diff`-guards, and
commits `[skip ci]`. Because instant-live has **no publish/draft boundary, this is
the rollback**: a bad nudge is undone by reverting the snapshot commit. Git history
is the version log; the DB is the live authority.

### Consequences

- Good: prop tuning is live on prod, no deploy; props still render with zero DB;
  thumbnails stay true to the live look; git bake-back is a real undo despite the
  no-publish-gate model.
- Good: one consistent shape reused from ADR-0038/0060 — no new mechanism.
- Cost: two homes for seats (baseline file + DB row) kept in sync by the cron —
  bounded drift, `git diff` no-op guard, but a moving part; the in-container
  baseline can lag the live DB between deploys.
- Cost: the server renderer gains a DB read on the thumbnail path (TTL-cached,
  last-known-good) rather than a pure static compute.
- Cost: instant-live has no confirm, so a bad seat is live until reverted —
  accepted (personal sandbox; git bake-back is the safety net).

## Implementation Plan (phased)

Each step is independently deployable.

**Step 1 — Backend tier.** `MIGRATIONS` vN: create `prop_seats` (clone of
`official_campaigns`). `GET /api/prop-seats/:id` (public) + `PUT` (`requireAdmin`),
`{portfolio:{data,revision,updated_by}}` envelope. Validate the seats **shape** +
base/variant integrity on PUT. Seed `'default'` lazily from the committed
`propSeats.json` on first GET/PUT — never an eager startup write.

**Step 2 — Frontend load.** `loadLiveSeats()` (API-first, baseline overlay);
hydrate at boot before the first board render; re-derive `PROP_DEFS`. Never throws.

**Step 3 — `/prop-lab` write.** Save → `PUT /api/prop-seats/default` (instant-live,
no confirm, admin-gated); move base-protection server-side; retire the Vite file
endpoints; `mapSaveError` handling.

**Step 4 — Server thumbnails.** Overlay live seats on the board-render path
(TTL + last-known-good; embedded baseline fallback).

**Step 5 — Bake-back.** GH Actions cron DB→`propSeats.json`, `[skip ci]`.

**Guardrails.** `props.test.ts`'s "every def composes a full seat / no orphans"
invariant must hold against **baseline ∪ overlay**; a missing seat still throws
(the baseline guarantees presence); the PUT reuses the same integrity checks the
test encodes.

## Pros and Cons of the Options

### A. DB-only
- Good: single source, no file.
- Bad: props can't render pre-DB; outage empties props; violates no-DB-dependency
  and the always-render invariant. Rejected.

### B. Baseline + DB overrides + bake-back (chosen)
- Good: live tuning without sacrificing render-always or DB-independence;
  git-recoverable; reuses ADR-0038/0060.
- Bad: two homes to keep in sync (bounded cron drift); a DB read on the thumbnail
  path.

### C. Status quo
- Good: zero work.
- Bad: is the friction being removed. Rejected.

## More Information

- Builds on: [ADR-0038](0038-campaigns-are-tiered-game-content.md) (dual-homed
  file+DB pattern, `requireAdmin`/`ADMIN_EMAILS`, weekly bake-back),
  [ADR-0060](0060-playing-never-requires-sign-in.md) (public read / admin write),
  [ADR-0059](0059-reuse-the-canonical-primitive-not-a-bespoke-parallel.md) (reuse
  the officials tier, don't fork).
- Contrast: unlike ADR-0038's `official.json` (deleted, because empty officials is
  valid), `propSeats.json` **stays** as the required render baseline.
- Code touchpoints: `packages/board-render/src/core/props.ts` (sync baseline import
  + overlay, re-exported through `frontend/src/core/props.ts`),
  `frontend/src/ui/PropSeatLab.tsx` (Save → PUT), `frontend/vite.config.js`
  (`propSeatSave`/`propSeatDelete` retire), `backend/server.js` (new tier + migration,
  mirrors `official_campaigns`), `@chess-tactics/board-render` (thumbnail overlay),
  `frontend/src/core/props.test.ts` (baseline ∪ overlay invariant).
- Direction + intent: the `props-to-db-direction` design note; the locked
  instant-live edit model.
