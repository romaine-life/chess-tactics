# 0082 — The level's AI is a named approach with its own parameter set

Status: accepted
Date: 2026-07-12

## Context

Adoption used to set a bare weight vector: `BooksBlob.adoptedWeights` held "the
adopted weights" and `BooksBlob.tdAdoption` a provenance record beside it. The
owner rejected that framing: unit strengths are not an entire AI. "Set this as
this game's AI" must set a whole **approach** — a named technique (algorithm +
evaluation recipe) *plus that approach's own tunable parameters* — because a
future approach (piece-square tables, a small value network: the next rungs of
the value-function ladder) needs its own parameter set beside this one, not a
fight over one anonymous slot that tramples whatever tuning came before.

## Decision

- **A registry names the approaches** (`game/aiApproach.ts`). One entry today:
  `material-search` → display name **"Tuned material search"**, technique line
  "alpha-beta search over a material evaluation — unit values learned by
  afterstate TD(λ) self-play (Beal & Smith) or SPSA champion tuning". Both
  current tuning surfaces (the Piece-values pane's TD runs, the Training tab's
  SPSA champions) tune this ONE approach's vector — the surface is provenance,
  not a different approach.
- **The blob field is a level-AI document.** `BooksBlob.levelAi = { live?,
  approaches: { [id]: { vector, adoption? } } }` (lab/openingBooks.ts). `live`
  names the approach in force (absent = stock AI); each approach owns its
  config, so repointing `live` never destroys a sibling's tuning. `adoption` is
  the values-pane provenance record (names the run, survives deleting it);
  absent = the Training tab's champion set the values. Pure verbs:
  `setLevelAiApproach` (adopt = the whole pointer: approach + parameters +
  provenance), `clearLevelAiApproach` (drop one config; emptied document
  removed), `sanitizeLevelAi` (load boundary).
- **The resolver is unchanged**: `game/adoptedWeights` still caches the LIVE
  vector per level in localStorage for the synchronous personal → shipped →
  default read before every enemy reply. One approach exists, so the cache
  stays a bare vector; a second approach adds a resolver branch there.
- **The audit box names the recipe.** "This level's AI: plays **Tuned material
  search** — your values, set from this pane / the Training tab", the technique
  line, values beside defaults, and the run provenance. With nothing set it
  still names the engine — "material search (stock)" with shipped or default
  values — because the approach concept is true of the stock tier too.
- **Legacy migrates on load.** `migrateLevelAi` (applied in `loadOpeningBooks`
  AFTER `migrateTdRuns`, which hoists a pre-library document's record up to
  `tdAdoption` first) folds `adoptedWeights` + a vector-matching `tdAdoption`
  into a live material-search config; a mismatched or orphaned record drops
  (the old read path ignored those too). `adoptedWeights`/`tdAdoption` are
  retired: read for migration only, never written.

## Consequences

- "I'm tuning THE approach" is now literal: runs, compare, SPRT champions all
  feed one named parameter set, and a second approach is additive (registry id +
  config shape + resolver branch) instead of a migration.
- The backend is untouched (same per-(owner, level) JSONB passthrough blob).
- Tests: `lab/levelAi.test.ts` (set/clear/migrate/sanitize invariants, sibling
  survival under a cast future id), `net/openingBooks.test.ts` (levelAi
  passthrough + sanitize, bare-vector migration, the full legacy chain
  tdSession → Run 1 → levelAi, retired fields never written back). Verified
  live on `off-l-break-line`: adopt → audit box names approach + run, server
  blob holds `levelAi` only; reload restores; clear falls back to stock; a
  planted legacy blob migrates on load and persists the migrated shape.
