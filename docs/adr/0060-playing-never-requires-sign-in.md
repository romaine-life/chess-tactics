---
status: "accepted; asset-catalog no-DB/fallback clauses superseded by ADR-0081"
date: 2026-07-03
deciders: Nelson, Claude
---

# ADR-0060: Playing never requires sign-in — reads are public, only writes are login-gated

An intent / product-architecture ADR (the app-wide auth boundary), recorded as a
standalone decision because it governs everything that follows the move to make
the **live DB the source of truth for tweakable content**. It generalizes the
public-GET / `requireAdmin`-PUT split that
[ADR-0038](0038-campaigns-are-tiered-game-content.md) shipped for the officials
tier into a standing rule, and it forecloses a "login wall for everyone"
alternative that the DB-as-source-of-truth direction had put back on the table.

## Context and Problem Statement

We are moving toward the **live DB as the source of truth for content we want to
tweak live** (props' `propSeats.json` is the first candidate), and dev
environments now point at the prod DB rather than a local one. That prompted a
tempting simplification: since we always use the prod DB now and devs are always
signed in, should we drop the offline/anonymous paths and just **require a login
everywhere**?

That question is genuinely a product-**intent** call, not a cleanup detail,
because "require login" quietly removes three surfaces that work today *without a
session*: the public officials read (`GET /api/official-campaigns/default`,
asserted session-free at [smoke-test.js:593](../../backend/smoke-test.js)), public
shareable maps (`GET /api/maps/:publicId`), and OG / share-link thumbnail unfurls
rendered for crawlers ([server.js:2587](../../backend/server.js)). It must be
decided and recorded, not inferred from "latest main uses the prod DB."

## Decision Drivers

- **Cold-start players.** A first-time visitor must be able to play without
  hitting an account wall.
- **Shareable links / OG unfurls.** Crawlers and logged-out clients can't sign in;
  social/Discord share cards and publicly linked maps must still render and play.
- **Consistency with the shipped officials tier.** ADR-0038 already made officials
  public-GET / `requireAdmin`-PUT and enshrined the no-DB-dependency invariant;
  reads there are already session-free by design.
- **A forward rule for DB-backed tweakables.** Whatever tweakable content moves
  into the DB next (props first) needs a settled rule: loading it must not require
  a session; only editing it does.
- **Reversibility / blast radius.** Preserving anonymous play is the smaller,
  reversible posture; a login wall is a one-way product pivot that also sheds the
  SEO/unfurl/public-map surfaces and the signed-out progress path.

## Considered Options

- **A. Anonymous play survives — reads public, writes login-gated.**
  Loading/playing needs no session; only authoring and persistence require
  sign-in (and privileged global writes require admin, per ADR-0038).
  **(chosen)**
- **B. Login wall for everyone.** Sign-in required before playing; drop the public
  officials/maps GET and the OG unfurl path; collapse the signed-out fallbacks
  (e.g. the `campaign_progress` localStorage mirror) into straight DB reads.

## Decision Outcome

Chosen: **A — playing never requires sign-in.** The governing principle is
**login gates _writes_, not _reads_**: reads stay public so anonymous play,
publicly linked maps, and crawler unfurls keep working; authoring/persistence
require a session, and publishing global content requires admin
(`requireAdmin` / `ADMIN_EMAILS`, unchanged from ADR-0038). B was rejected — the
win it offered (fewer moving parts: no public GET, no signed-out mirror) is not
worth walling out cold-start players and breaking every share-link thumbnail, and
it is a one-way pivot where A is reversible.

This also settles the rule for **all future DB-backed tweakable content**: when
props (or anything else) move into the DB, the load path is a **public read** and
the edit path (e.g. prop-lab publish) is **admin-gated** — the exact shape of the
officials tier.

### What this does and does not license

The intent above is deliberately narrow, so the implementation boundary is
explicit (the owner asked specifically that intent be separated from
implementation):

- **Licenses** removing the *DEV-only file-fixture* fallback —
  `loadOfficialFallback()` reading `official.json` under `import.meta.env.DEV` in
  [campaignWorkspace.ts:52](../../frontend/src/net/campaignWorkspace.ts) — because
  dev now uses the prod DB, and deleting it does not touch the public-read
  contract.
- **Does NOT license** the "require login" simplifications: keep the
  **graceful-empty / never-throws** resilience (a DB blip yields empty officials,
  never a crash — ADR-0038's no-DB-dependency invariant, mirrored by the
  last-known-good memory cache on the OG path at
  [server.js:2588](../../backend/server.js)); keep the **public** officials/maps
  GET; keep the **`campaign_progress` localStorage mirror** (it exists for
  signed-out / cross-device players, who still exist under this decision).

### Consequences

- Good: cold-start players and share-link unfurls keep working; the app has **one
  settled auth rule** — reads public, writes gated — that every DB-backed
  tweakable inherits by construction.
- Good: consistent with the already-shipped officials tier (ADR-0038); no new
  surface area, no pivot.
- Good: the change stays **reversible** — nothing about anonymous play is torn out.
- Cost: the signed-out support paths stay on the books — the graceful-empty
  resilience and the `campaign_progress` localStorage mirror are **not** collapsed,
  so the "assume everyone's logged in" cleanup is explicitly foreclosed here.
- Cost: every new DB-backed content type must ship a **public read** path (not a
  blanket sign-in gate), which is marginally more work than one "require session"
  middleware.

## Pros and Cons of the Options

### A. Anonymous play survives (chosen)

- Good: cold-start + shareable links keep working; one consistent
  read-public/write-gated rule; reversible; matches ADR-0038.
- Bad: keeps the signed-out code paths (localStorage progress mirror,
  graceful-empty) alive; each new DB content type needs its own public read.

### B. Login wall for everyone

- Good: fewer moving parts — no public GET, signed-out mirrors collapse into plain
  DB reads; "everyone is a known user" simplifies progress/account scoping.
- Bad: walls out anonymous cold-start players; breaks OG/share-link thumbnails and
  publicly linked maps (crawlers can't authenticate); a one-way product pivot.
  Rejected.

## More Information

- Generalizes: [ADR-0038](0038-campaigns-are-tiered-game-content.md) (officials
  public GET / `requireAdmin` PUT; the no-DB-dependency invariant).
- Reflects into `docs/persistence.md` (the "game never depends on the DB" +
  auth-boundary rules) — the public-read / write-gated split is now a standing
  app-wide rule, not just an officials-tier detail.
- Code touchpoints: `frontend/src/net/campaignWorkspace.ts` (`loadOfficialFallback`,
  graceful-empty), `backend/server.js` (public officials GET + OG last-known-good
  cache), `backend/smoke-test.js` (session-free public GET assertion),
  `frontend/src/campaign/progress.ts` / `campaign_progress` (the localStorage
  mirror this decision keeps).
- Motivating direction: making the live DB the source of truth for tweakable
  content (props' `propSeats.json` first) — props inherit this ADR's public-read /
  admin-write shape.
