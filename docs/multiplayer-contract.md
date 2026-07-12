# Multiplayer Contract

This is the consolidated current-state contract for lobby gameplay, derived from
[ADR-0077](adr/0077-multiplayer-is-one-game-projected-through-seat-local-clients.md),
[ADR-0078](adr/0078-lobby-authority-survives-retry-reconnect-and-departure.md), and
[ADR-0079](adr/0079-lobby-recovery-pins-content-and-unresolved-intent.md), plus
[ADR-0080](adr/0080-lobby-ambiguity-fails-closed-and-stays-resolvable.md).
ADR-0064 governs ordered victory rules and ADR-0072 governs chess-draw and
cross-consumer settlement parity.

## Identities and perspective

- `player` and `enemy` are canonical serialized faction ids. They do not mean the person
  looking at a client.
- An interactive lobby client has exactly one `localSide`; `opponentSide` is its inverse.
- "You", "your", "opponent", ownership-sensitive controls, objective instructions,
  overlays, roster actions, logs and results must derive from that perspective.
- Solo play uses the same projection with `localSide = player`.
- Fixed camera orientation does not alter perspective; the board-render contract remains
  authoritative.

## Interface parity

Selection, focus, inspection, overlays, promotion choice and premoves are client-local
interface features and must work for both lobby seats. A premove is queued only for
`localSide`, may be entered only while the opponent owns the turn/landing beat, stores any
promotion choice, and is revalidated against the authoritative board before submission.

Objective and result presentation must use the same resolved `VictoryRule[]` as gameplay.
Each seat is told its own win paths and threats. Authored rule names and exact draw reasons
survive settlement; only the relative Victory/Defeat wording changes by client.

## Authority and pending input

- The lobby server owns move ordering.
- A client POST is an intent, not a board commit.
- Only an ordered server echo or backfill mutates the multiplayer board.
- At most one local move intent may be pending for an expected relay index.
- Every gesture has a stable `intentId`. All retries reuse it; the server returns an
  identical prior event for an identical id and rejects conflicting reuse.
- Matching echo or authoritative backfill clears pending state deterministically. A hard
  rejection may restore input only when the server cannot still accept that identity.
- A failed POST whose recovery also fails remains locked to its stable id and is retried
  idempotently. An equal-count snapshot is not proof that the original request cannot
  still arrive and never unlocks a different gesture.
- Before the first POST, the full lobby/seat/count/id/piece/move intent is written to a
  reload-durable journal. Remount/reload restores and retries it after backfill; failure to
  write the journal blocks submission rather than silently weakening authority.
- Exactly one same-origin tab holds the interactive `(lobby, seat)` Web Lock. Other tabs
  remain read-only. The journal is cross-tab durable (not session-only), so tab close and
  replacement cannot hide an in-flight identity.
- Relays preserve valid client-local selection/focus and never arbitrarily select the first
  array element.

## Session boundary

Every new, resumed or lobby match has a distinct generation. Timers, worker callbacks,
clock callbacks, premove beats and subscriptions must capture it and no-op or abort after a
transition. New/resume/net/conclude/leave reset mode-specific state, including premoves,
promotion, in-memory pending input, test controls and clock state. Ordinary UI teardown does
not erase an unresolved durable network identity; only authoritative settlement/result or an
acknowledged Leave does. A solo↔lobby transition is fresh even when the level id is unchanged.

## Settlement

`applyMove` transforms chess state; the shared committed-position adjudicator decides the
game. It runs at match initialization and after every committed move, in this order:

1. the level's ordered authored rules, or the one canonical preset expansion;
2. checkmate/stalemate when the side to move has no legal move;
3. enabled 50-move/threefold rules.

It returns winner, terminal kind and fired authored rule. Solo, lobby, AI, self-play,
replay, solver and search must consume this primitive or an adapter over the exact same
rules. Supplying only an objective enum where `VictoryRule[]` exists is a contract breach.

Each lobby seat independently reports a move-derived terminal result with the exact committed
relay count. The server publishes it only after both original seats report the same winner and
reason; one client cannot authoritatively claim a win or draw. Reports are idempotent per seat,
and disagreement remains unresolved rather than first-writer-wins. The first report freezes new
move intents at that prefix until agreement or explicit dispute resolution. A terminal lobby frame is applied only
after its complete ordered move prefix.

Cross-seat disagreement is published as `result_disputed`: the prefix stays frozen and reports
stay immutable. Clients stop automatic retries, explain the divergence, and offer a confirmed
concession/abandon action. It never pretends already-terminal simulations can resume, and it
never leaves the only escape to tombstone expiry.

Start pins a deep-cloned canonical level snapshot and fingerprint beside the seed. Participant
detail/recovery reads return that snapshot, and every client builds from it rather than a mutable
local level lookup. A level id alone is never sufficient replay authority. Because canonical reads
are asynchronous, Level and Start compare a monotonic lobby revision after the read; stale
transitions cannot mix an id with another snapshot, double-seed Start, or resurrect a closed lobby.

## Lifecycle and declared exclusions

- Explicit Leave during a live match is resignation; publish the terminal result before
  cleanup.
- A stream/network interruption is not resignation; reconnect and backfill recover state.
- Start is valid only from the ready phase. A started match cannot be reset by another Start;
  rematch requires a distinct coordinated protocol.
- Any participant departure from a started lifecycle creates a closed tombstone retaining both
  original seats, pinned content, ordered moves and result reports. Pregame guest departure may
  still free the unused seat. Tombstones stay out of public active listings but are returned in
  each original seat's recoverable-match list until both acknowledge/leave or bounded TTL expires.
- Observers do not enter the interactive player route until a spectator UI is accepted;
  redirect/reject them explicitly.
- Timed authored levels cannot start in lobby mode until a server-authoritative clock is
  implemented. The server resolves timing eligibility from the canonical selected level and
  Start rejects timed or unavailable content; client-authored metadata is never authoritative.
- Restart/rematch require shared server state. Board rotation remains fixed by the
  board-render contract.

## Required verification

Every multiplayer-affecting change must cover both seats. The durable suite includes:

- mirrored host/guest UI assertions for objectives, overlays, roster, logs and results;
- store tests for pending input, relay echo/rejection, premove drain and promotion;
- stale callback and solo↔lobby transition tests;
- initial and post-move outcome parity across solo/net/AI/self-play;
- backend lifecycle tests for resign/leave, observer entry and backfill;
- backend protocol tests for intent deduplication, ready-only Start, two-seat result agreement,
  pending-result relay freeze, canonical timing/content pinning and tombstone discovery/acknowledgement;
- forced async transition races for Start/Level, double Start and Leave-during-Start;
- reload tests for durable intent restoration, same-id retry and fail-closed storage errors;
- multi-tab lease tests and disputed-result escape/anti-rebroadcast tests;
- a two-browser authenticated match exercising moves and premoves from both seats.

Passing pure rules determinism tests is necessary but does not establish interface or
lifecycle parity.
