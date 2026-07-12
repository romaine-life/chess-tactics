# 0081 — TD runs are a per-level experiment library, not a single mutable document

Status: accepted
Date: 2026-07-11

## Context

The Piece-values pane (Training Gym `values` mode) learns per-board piece values by
afterstate TD(λ) self-play. Its first persistence model was one durable document per
level (`BooksBlob.tdSession`): the pane autosaved into a single slot, and Reset —
the only path to changing any setting — deleted it. The owner rejected that model
outright: training work is *experiments*. Every ML tool treats a **run** as the
primitive — an immutable record of frozen config plus everything it produced — and
the run *list* is the point, because comparing runs is how you learn what a knob
does ("how does 600 games compare to 6000?"). A single mutable slot makes that
workflow impossible: starting the 6000-game experiment destroys the 600-game
evidence. (See the experiment-tracking model of MLflow / Weights & Biases /
TensorBoard runs.)

## Decision

- **The blob field is a run library.** `BooksBlob.tdRuns = { nextId, activeId?,
  runs: TdRunDoc[] }` (lab/tdSession.ts). A `TdRunDoc` is the old autosave payload
  (`TdSessionDoc`: opts, seedCount, session, probeLog, summary, kept, adoption?)
  wrapped with identity: `id`, `name`, `createdAt?`. Ids never rewind — deleting
  the last run keeps `nextId`.
- **The pane opens one run; a fresh pane is unattached.** `activeId` names the open
  run; absent means the pane is fresh and its FIRST autosave records a new run
  (`upsertTdRun` allocates). Settings stay frozen per run (the ε/α schedules anneal
  over the fixed budget — restoring a session without its exact opts would corrupt
  it), so **changing a knob means + New run**, which shelves the open run and
  unfreezes a fresh pane seeded with the same knobs.
- **Delete run is the only discard.** The transport's `↺ reset` button is retired.
  Open/rename/new/compare never destroy anything.
- **Compare is a first-class view.** One column per run; settings rows that differ
  are highlighted (they are the experiment); outcomes and pawn = 1 learned values
  (seed-fold mean when folded, live weights otherwise) sit side by side.
- **Adoption records carry provenance, delete-proof.** `TdAdoptionRecord.runId/
  runName` say which run went live. The LIVE record is stored at blob level
  (`BooksBlob.tdAdoption`) so the audit box survives deleting the run it came from
  (shown "(deleted)"); each run also keeps its own copy as history. Clearing an
  adoption removes the vector + live record, keeps per-run history; the live record
  is validated by exact vector match (JSON round-trips preserve doubles), so a
  later Training-tab adoption correctly demotes it.
- **Legacy migrates on load.** `migrateTdRuns` (lab/openingBooks.ts, applied in
  net/openingBooks.ts `loadOpeningBooks`) folds the retired `tdSession` field into
  the library as `Run 1`, contents intact, hoisting its adoption record to the
  blob-level slot; the field is never written again. A blob holding both keeps the
  library and drops the stale legacy field. Malformed legacy docs are dropped, and
  `sanitizeTdRuns` drops malformed runs at the load boundary — the picker/compare
  dereference every run unguarded.
- **Storage stays bounded against the backend's 4mb body cap** (every autosave PUTs
  the whole blob). Per run: probeLog −400; ledger rows rounded to display precision
  (6dp — full doubles tripled row size for digits nothing reads); the OPEN run
  keeps a 2000-row ledger window, shelved runs 400. A mature run is ~50KB, so the
  cap fits ~60 runs. A non-401 save failure raises a visible error line in the run
  manager (silent persistence death was the review's top finding). The pagehide
  keepalive flush stays best-effort (~64KB browser quota); the debounced saves are
  the durable path. The TD transport + autosave are gated on the books load
  settling, so a first save can never clobber the server library with an empty one.

## Consequences

- The owner's real workflow works: shelve the 600-game baseline, run 6000 games,
  compare, adopt the better one, and the audit trail names the experiment.
- The backend is untouched (the library rides the same per-(owner, level) JSONB
  passthrough blob).
- An old client that writes the blob would drop `tdRuns` (it doesn't know the
  field). Single-owner app, dev-server deploys — accepted; the mixed-version window
  is effectively the owner's own open tabs.
- Tests: `lab/tdRuns.test.ts` (upsert/migrate invariants),
  `net/openingBooks.test.ts` (round-trip, caps, migration on load, legacy field
  never written back). Verified live end-to-end on `off-l-break-line` (record,
  rename, shelve, complete + seed fold, compare, toggle, reload, delete-to-empty,
  and a planted legacy blob migrating to Run 1) — never driving `l4`, the owner's
  live data.
